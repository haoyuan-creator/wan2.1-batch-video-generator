#!/usr/bin/env python3
"""
Video Workflow Server
生产级视频处理工作流服务器，使用ComfyUI作为后端渲染引擎。
提供任务管理、队列处理、状态跟踪和结果管理功能。
"""

import asyncio
import json
import uuid
import time
import logging
import shutil
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict

import aiohttp
import aiofiles
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
import uvicorn

# ==================== 配置 ====================
CONFIG = {
    "comfyui_url": "http://192.168.31.150:8001",
    "max_concurrent_jobs": 1,
    "upload_dir": "uploads",
    "output_dir": "outputs",
    "max_retries": 3,
    "retry_delay": 5,  # 秒
    "cleanup_old_files": True,
    "cleanup_days": 7,
}

# ==================== 日志配置 ====================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== 数据模型 ====================
class JobStatus(str, Enum):
    PENDING = "pending"
    UPLOADING = "uploading"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class VideoFormat(str, Enum):
    MP4 = "mp4"
    WEBM = "webm"
    GIF = "gif"

class WorkflowConfig(BaseModel):
    positive_prompt: str = Field(..., description="正面提示词")
    negative_prompt: str = Field(..., description="负面提示词")
    seed: int = Field(default=88888, description="随机种子")
    randomize_seed: bool = Field(default=True, description="是否随机化种子")
    fps: int = Field(default=16, ge=1, le=60, description="帧率")
    duration: int = Field(default=5, ge=1, le=30, description="视频时长(秒)")
    format: VideoFormat = Field(default=VideoFormat.MP4, description="输出格式")

@dataclass
class Job:
    """任务实例"""
    id: str
    filename: str
    original_filename: str
    filepath: Path
    status: JobStatus
    progress: float = 0.0
    config: WorkflowConfig = None
    comfy_prompt_id: Optional[str] = None
    result_path: Optional[Path] = None
    error_message: Optional[str] = None
    created_at: datetime = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    retry_count: int = 0

    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.now()

    def to_dict(self):
        data = asdict(self)
        data['status'] = self.status.value
        data['created_at'] = self.created_at.isoformat() if self.created_at else None
        data['started_at'] = self.started_at.isoformat() if self.started_at else None
        data['completed_at'] = self.completed_at.isoformat() if self.completed_at else None
        data['filepath'] = str(self.filepath) if self.filepath else None
        data['result_path'] = str(self.result_path) if self.result_path else None
        return data

# ==================== 服务器状态 ====================
class WorkflowServer:
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.jobs: Dict[str, Job] = {}
        self.job_queue: asyncio.Queue = asyncio.Queue()
        self.processing_tasks: Dict[str, asyncio.Task] = {}
        self.session: Optional[aiohttp.ClientSession] = None

        # 创建目录
        self.upload_dir = Path(config["upload_dir"])
        self.output_dir = Path(config["output_dir"])
        self.upload_dir.mkdir(exist_ok=True, parents=True)
        self.output_dir.mkdir(exist_ok=True, parents=True)

        logger.info(f"Workflow Server initialized")
        logger.info(f"ComfyUI URL: {config['comfyui_url']}")
        logger.info(f"Upload dir: {self.upload_dir.absolute()}")
        logger.info(f"Output dir: {self.output_dir.absolute()}")

    async def start(self):
        """启动服务器"""
        self.session = aiohttp.ClientSession()
        # 启动工作进程
        for i in range(self.config["max_concurrent_jobs"]):
            asyncio.create_task(self._worker(i + 1))

        # 启动清理任务
        if self.config["cleanup_old_files"]:
            asyncio.create_task(self._cleanup_task())

    async def stop(self):
        """停止服务器"""
        if self.session:
            await self.session.close()

    async def _worker(self, worker_id: int):
        """工作进程，处理任务队列"""
        logger.info(f"Worker {worker_id} started")
        while True:
            try:
                job_id = await self.job_queue.get()
                job = self.jobs.get(job_id)
                if not job:
                    continue

                # 处理任务
                task = asyncio.create_task(self._process_job(job, worker_id))
                self.processing_tasks[job_id] = task

                try:
                    await task
                except Exception as e:
                    logger.error(f"Worker {worker_id} job {job_id} failed: {e}")
                finally:
                    self.processing_tasks.pop(job_id, None)
                    self.job_queue.task_done()

            except Exception as e:
                logger.error(f"Worker {worker_id} error: {e}")
                await asyncio.sleep(1)

    async def _process_job(self, job: Job, worker_id: int):
        """处理单个任务"""
        logger.info(f"Worker {worker_id} processing job {job.id}: {job.original_filename}")

        try:
            # 更新状态
            job.status = JobStatus.UPLOADING
            job.started_at = datetime.now()
            job.progress = 10

            # 1. 上传图片到ComfyUI
            uploaded_filename = await self._upload_to_comfyui(job.filepath)
            job.progress = 30

            # 2. 生成工作流
            workflow = self._generate_workflow(uploaded_filename, job.config)
            job.progress = 40

            # 3. 提交到ComfyUI
            job.status = JobStatus.PROCESSING
            prompt_id = await self._queue_workflow(workflow)
            job.comfy_prompt_id = prompt_id
            job.progress = 50

            # 4. 等待ComfyUI完成
            await self._wait_for_completion(prompt_id, job)
            job.progress = 80

            # 5. 下载结果
            result_path = await self._download_result(prompt_id, job)
            job.result_path = result_path
            job.progress = 100

            # 6. 标记完成
            job.status = JobStatus.COMPLETED
            job.completed_at = datetime.now()

            logger.info(f"Job {job.id} completed successfully: {result_path}")

        except Exception as e:
            logger.error(f"Job {job.id} failed: {e}")
            job.status = JobStatus.FAILED
            job.error_message = str(e)

            # 重试逻辑
            if job.retry_count < self.config["max_retries"]:
                job.retry_count += 1
                logger.info(f"Retrying job {job.id} (attempt {job.retry_count})")
                await asyncio.sleep(self.config["retry_delay"])
                await self.queue_job(job.id)

    async def _upload_to_comfyui(self, filepath: Path) -> str:
        """上传图片到ComfyUI"""
        url = f"{self.config['comfyui_url']}/upload/image"

        async with aiofiles.open(filepath, 'rb') as f:
            file_content = await f.read()

        data = aiohttp.FormData()
        data.add_field('image', file_content, filename=filepath.name)
        data.add_field('overwrite', 'true')
        data.add_field('type', 'input')

        async with self.session.post(url, data=data) as response:
            if response.status != 200:
                raise HTTPException(
                    status_code=response.status,
                    detail=f"Upload failed: {await response.text()}"
                )

            result = await response.json()
            return result['name']

    def _generate_workflow(self, image_filename: str, config: WorkflowConfig) -> Dict:
        """生成ComfyUI工作流"""
        # 加载基础工作流模板
        workflow_path = Path("services/workflowTemplate.ts")
        if not workflow_path.exists():
            # 使用内置模板
            workflow = self._get_default_workflow()
        else:
            # 从文件加载（简化版本）
            with open(workflow_path, 'r') as f:
                content = f.read()
                # 这里需要解析TypeScript文件，简化处理
                workflow = self._get_default_workflow()

        # 应用配置
        seed = config.seed if not config.randomize_seed else int(time.time() * 1000) % 1000000

        # 这里应该根据实际工作流结构进行修改
        # 简化处理：返回一个基本工作流
        return workflow

    def _get_default_workflow(self) -> Dict:
        """获取默认工作流"""
        return {
            "3": {
                "inputs": {
                    "seed": 88888,
                    "steps": 20,
                    "cfg": 7.0,
                    "sampler_name": "euler",
                    "scheduler": "normal",
                    "denoise": 1.0,
                    "model": ["4", 0],
                    "positive": ["6", 0],
                    "negative": ["7", 0],
                    "latent_image": ["5", 0]
                },
                "class_type": "KSampler"
            }
        }

    async def _queue_workflow(self, workflow: Dict) -> str:
        """提交工作流到ComfyUI"""
        url = f"{self.config['comfyui_url']}/prompt"

        async with self.session.post(url, json={"prompt": workflow}) as response:
            if response.status != 200:
                raise HTTPException(
                    status_code=response.status,
                    detail=f"Queue failed: {await response.text()}"
                )

            result = await response.json()
            return result['prompt_id']

    async def _wait_for_completion(self, prompt_id: str, job: Job):
        """等待ComfyUI任务完成"""
        history_url = f"{self.config['comfyui_url']}/history/{prompt_id}"

        max_wait = 300  # 5分钟超时
        start_time = time.time()

        while time.time() - start_time < max_wait:
            async with self.session.get(history_url) as response:
                if response.status == 200:
                    history = await response.json()
                    if prompt_id in history and history[prompt_id].get('status') == 'completed':
                        return

                # 更新进度
                elapsed = time.time() - start_time
                job.progress = 50 + min(30, elapsed / max_wait * 30)
                await asyncio.sleep(2)

        raise TimeoutError(f"ComfyUI execution timeout for prompt {prompt_id}")

    async def _download_result(self, prompt_id: str, job: Job) -> Path:
        """下载结果文件"""
        history_url = f"{self.config['comfyui_url']}/history/{prompt_id}"

        async with self.session.get(history_url) as response:
            if response.status != 200:
                raise HTTPException(
                    status_code=response.status,
                    detail=f"Failed to get history: {await response.text()}"
                )

            history = await response.json()
            outputs = history[prompt_id].get('outputs', {})

            # 查找视频输出（假设节点ID为108）
            video_data = outputs.get('108', {}).get('videos', [{}])[0]
            if not video_data:
                raise ValueError("No video output found")

            filename = video_data.get('filename', 'output.mp4')
            subfolder = video_data.get('subfolder', '')
            filetype = video_data.get('type', 'output')

            # 下载文件
            view_url = f"{self.config['comfyui_url']}/view"
            params = {
                'filename': filename,
                'subfolder': subfolder,
                'type': filetype
            }

            output_filename = f"{job.id}_{filename}"
            output_path = self.output_dir / output_filename

            async with self.session.get(view_url, params=params) as response:
                if response.status != 200:
                    raise HTTPException(
                        status_code=response.status,
                        detail=f"Failed to download: {await response.text()}"
                    )

                async with aiofiles.open(output_path, 'wb') as f:
                    async for chunk in response.content.iter_chunked(1024):
                        await f.write(chunk)

            return output_path

    async def _cleanup_task(self):
        """清理旧文件任务"""
        while True:
            try:
                cutoff_time = time.time() - (self.config["cleanup_days"] * 24 * 3600)

                # 清理上传文件
                for file in self.upload_dir.rglob("*"):
                    if file.is_file() and file.stat().st_mtime < cutoff_time:
                        file.unlink()

                # 清理输出文件（保留最近的结果）
                for file in self.output_dir.rglob("*"):
                    if file.is_file() and file.stat().st_mtime < cutoff_time:
                        file.unlink()

                await asyncio.sleep(3600)  # 每小时检查一次

            except Exception as e:
                logger.error(f"Cleanup error: {e}")
                await asyncio.sleep(60)

    # ==================== API方法 ====================
    async def create_job(self, file: UploadFile, config: WorkflowConfig) -> str:
        """创建新任务"""
        # 保存上传文件
        job_id = str(uuid.uuid4())
        timestamp = int(time.time())
        safe_filename = file.filename.replace(' ', '_').replace('/', '_')
        filename = f"{timestamp}_{safe_filename}"
        filepath = self.upload_dir / filename

        async with aiofiles.open(filepath, 'wb') as f:
            content = await file.read()
            await f.write(content)

        # 创建任务实例
        job = Job(
            id=job_id,
            filename=filename,
            original_filename=file.filename,
            filepath=filepath,
            status=JobStatus.PENDING,
            config=config
        )

        self.jobs[job_id] = job
        await self.job_queue.put(job_id)

        logger.info(f"Created job {job_id} for file {file.filename}")
        return job_id

    async def queue_job(self, job_id: str):
        """将任务加入队列"""
        if job_id in self.jobs:
            await self.job_queue.put(job_id)

    async def get_job(self, job_id: str) -> Optional[Job]:
        """获取任务信息"""
        return self.jobs.get(job_id)

    async def get_all_jobs(self) -> List[Job]:
        """获取所有任务"""
        return list(self.jobs.values())

    async def cancel_job(self, job_id: str) -> bool:
        """取消任务"""
        if job_id in self.jobs:
            job = self.jobs[job_id]
            if job.status in [JobStatus.PENDING, JobStatus.UPLOADING, JobStatus.PROCESSING]:
                job.status = JobStatus.CANCELLED

                # 取消ComfyUI任务
                if job.comfy_prompt_id:
                    try:
                        url = f"{self.config['comfyui_url']}/prompt/{job.comfy_prompt_id}"
                        async with self.session.delete(url) as response:
                            if response.status != 200:
                                logger.warning(f"Failed to cancel ComfyUI prompt {job.comfy_prompt_id}")
                    except Exception as e:
                        logger.error(f"Error cancelling ComfyUI prompt: {e}")

                # 取消处理任务
                if job_id in self.processing_tasks:
                    self.processing_tasks[job_id].cancel()

                return True
        return False

# ==================== FastAPI应用 ====================
app = FastAPI(title="Video Workflow Server", version="1.0.0")

# CORS配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 服务器实例
server = None

@app.on_event("startup")
async def startup_event():
    global server
    server = WorkflowServer(CONFIG)
    await server.start()

@app.on_event("shutdown")
async def shutdown_event():
    global server
    if server:
        await server.stop()

# ==================== API端点 ====================
@app.get("/")
async def root():
    return {
        "name": "Video Workflow Server",
        "version": "1.0.0",
        "status": "running",
        "comfyui_url": CONFIG["comfyui_url"]
    }

@app.post("/api/jobs")
async def create_job(
    file: UploadFile = File(...),
    positive_prompt: str = Form(...),
    negative_prompt: str = Form(...),
    seed: int = Form(88888),
    randomize_seed: bool = Form(True),
    fps: int = Form(16),
    duration: int = Form(5),
    format: VideoFormat = Form(VideoFormat.MP4)
):
    """创建新视频处理任务"""
    config = WorkflowConfig(
        positive_prompt=positive_prompt,
        negative_prompt=negative_prompt,
        seed=seed,
        randomize_seed=randomize_seed,
        fps=fps,
        duration=duration,
        format=format
    )

    job_id = await server.create_job(file, config)
    return {"job_id": job_id, "status": "queued"}

@app.get("/api/jobs")
async def list_jobs():
    """获取所有任务"""
    jobs = await server.get_all_jobs()
    return {"jobs": [job.to_dict() for job in jobs]}

@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str):
    """获取任务详情"""
    job = await server.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job.to_dict()

@app.delete("/api/jobs/{job_id}")
async def cancel_job(job_id: str):
    """取消任务"""
    success = await server.cancel_job(job_id)
    if not success:
        raise HTTPException(status_code=404, detail="Job not found or cannot be cancelled")
    return {"status": "cancelled"}

@app.get("/api/jobs/{job_id}/result")
async def get_job_result(job_id: str):
    """获取任务结果文件"""
    job = await server.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status != JobStatus.COMPLETED or not job.result_path:
        raise HTTPException(status_code=400, detail="Job not completed or no result")

    return FileResponse(
        path=job.result_path,
        filename=f"result_{job.original_filename}.mp4",
        media_type="video/mp4"
    )

@app.get("/api/stats")
async def get_stats():
    """获取服务器统计信息"""
    jobs = await server.get_all_jobs()

    status_counts = {}
    for job in jobs:
        status = job.status.value
        status_counts[status] = status_counts.get(status, 0) + 1

    return {
        "total_jobs": len(jobs),
        "status_counts": status_counts,
        "queue_size": server.job_queue.qsize(),
        "processing_tasks": len(server.processing_tasks)
    }

@app.get("/api/health")
async def health_check():
    """健康检查"""
    try:
        # 检查ComfyUI连接
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{CONFIG['comfyui_url']}/system_stats") as response:
                comfy_ok = response.status == 200
    except:
        comfy_ok = False

    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "comfyui_connected": comfy_ok,
        "server": "running"
    }

# ==================== 主函数 ====================
if __name__ == "__main__":
    print("=" * 60)
    print("Video Workflow Server")
    print("=" * 60)
    print(f"API URL: http://127.0.0.1:8000")
    print(f"ComfyUI URL: {CONFIG['comfyui_url']}")
    print(f"Max concurrent jobs: {CONFIG['max_concurrent_jobs']}")
    print("\nAPI Endpoints:")
    print("  POST /api/jobs      - 创建新任务")
    print("  GET  /api/jobs      - 获取所有任务")
    print("  GET  /api/jobs/{id} - 获取任务详情")
    print("  GET  /api/stats     - 服务器统计")
    print("  GET  /api/health    - 健康检查")
    print("=" * 60)

    uvicorn.run(app, host="127.0.0.1", port=8000)