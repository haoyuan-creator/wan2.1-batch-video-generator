#!/usr/bin/env python3
"""
Mock ComfyUI Server for testing
This server simulates ComfyUI API endpoints for testing the frontend
without requiring a real ComfyUI installation.
"""

import json
import uuid
import time
import asyncio
import random
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn

# Create necessary directories
UPLOAD_DIR = Path("test_uploads")
OUTPUT_DIR = Path("test_outputs")
VIDEO_DIR = OUTPUT_DIR / "video"
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)
VIDEO_DIR.mkdir(exist_ok=True)

# Create sample video file if it doesn't exist
SAMPLE_VIDEO = VIDEO_DIR / "ComfyUI_00001.mp4"
if not SAMPLE_VIDEO.exists():
    # Create a dummy video file
    with open(SAMPLE_VIDEO, "wb") as f:
        f.write(b"Dummy video content for testing")

app = FastAPI(title="Mock ComfyUI Server", version="1.0.0")

# Enable CORS for frontend testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage for tracking prompts
prompts: Dict[str, Dict[str, Any]] = {}
prompt_counter = 1

# Models
class PromptRequest(BaseModel):
    prompt: Dict[str, Any]

class UploadResponse(BaseModel):
    name: str
    subfolder: str = ""
    type: str = "input"

class QueueResponse(BaseModel):
    prompt_id: str
    number: int

class SystemStats(BaseModel):
    system: Dict[str, Any]
    devices: List[Dict[str, Any]]

@app.get("/")
async def root():
    return {"message": "Mock ComfyUI Server", "status": "running"}

@app.get("/system_stats")
async def get_system_stats():
    """Mock system stats endpoint"""
    return {
        "system": {
            "os": "linux",
            "python_version": "3.10.0",
            "comfy_version": "0.0.1-mock"
        },
        "devices": [
            {
                "name": "cuda:0",
                "type": "cuda",
                "index": 0,
                "vram_total": 8589934592,
                "vram_free": 6442450944,
                "torch_vram_total": 8589934592,
                "torch_vram_free": 6442450944
            }
        ]
    }

@app.post("/upload/image")
async def upload_image(
    image: UploadFile = File(...),
    overwrite: str = Form("true"),
    type: str = Form("input")
):
    """Mock image upload endpoint"""
    # Generate a unique filename
    filename = f"upload_{int(time.time())}_{image.filename}"
    filepath = UPLOAD_DIR / filename

    # Save the file
    content = await image.read()
    with open(filepath, "wb") as f:
        f.write(content)

    print(f"[Mock Server] Uploaded image: {filename}")

    return UploadResponse(name=filename)

@app.post("/prompt")
async def queue_prompt(request: PromptRequest, background_tasks: BackgroundTasks):
    """Mock prompt queue endpoint"""
    global prompt_counter

    prompt_id = str(uuid.uuid4())
    prompt_number = prompt_counter
    prompt_counter += 1

    # Store the prompt
    prompts[prompt_id] = {
        "id": prompt_id,
        "number": prompt_number,
        "status": "queued",
        "progress": 0,
        "created_at": datetime.now().isoformat(),
        "workflow": request.prompt
    }

    print(f"[Mock Server] Queued prompt: {prompt_id} (number: {prompt_number})")

    # Start mock processing in background
    background_tasks.add_task(process_prompt, prompt_id)

    return QueueResponse(prompt_id=prompt_id, number=prompt_number)

async def process_prompt(prompt_id: str):
    """Mock prompt processing with progress updates"""
    await asyncio.sleep(0.5)  # Small delay before starting

    # Send execution_start via WebSocket (simulated)
    print(f"[Mock Server] Processing prompt: {prompt_id}")

    # Simulate progress updates
    for progress in range(0, 101, 10):
        await asyncio.sleep(0.3)  # Simulate work
        if prompt_id in prompts:
            prompts[prompt_id]["progress"] = progress

    # Mark as completed
    if prompt_id in prompts:
        prompts[prompt_id]["status"] = "completed"
        prompts[prompt_id]["progress"] = 100

    print(f"[Mock Server] Completed prompt: {prompt_id}")

@app.get("/history/{prompt_id}")
async def get_history(prompt_id: str):
    """Mock history endpoint"""
    if prompt_id not in prompts:
        raise HTTPException(status_code=404, detail="Prompt not found")

    # Create mock outputs
    outputs = {
        "108": {
            "videos": [
                {
                    "filename": "ComfyUI_00001.mp4",
                    "subfolder": "video",
                    "type": "output"
                }
            ]
        }
    }

    return {
        prompt_id: {
            "outputs": outputs,
            "status": prompts[prompt_id]["status"]
        }
    }

@app.get("/view")
async def view_file(filename: str, subfolder: str = "", type: str = "output"):
    """Mock file view endpoint - returns sample video"""
    if type == "output" and "video" in subfolder:
        # Return the sample video file
        return FileResponse(
            path=SAMPLE_VIDEO,
            media_type="video/mp4",
            filename=filename
        )

    # For other files, return 404 or dummy content
    raise HTTPException(status_code=404, detail="File not found")

@app.get("/prompt")
async def get_queued_prompts():
    """Get current queue status"""
    return {
        "queue_running": True,
        "queue_pending": list(prompts.keys())
    }

@app.delete("/prompt/{prompt_id}")
async def delete_prompt(prompt_id: str):
    """Mock prompt deletion"""
    if prompt_id in prompts:
        del prompts[prompt_id]
        return {"message": f"Prompt {prompt_id} deleted"}
    raise HTTPException(status_code=404, detail="Prompt not found")

# WebSocket endpoint (mock - returns 404 since we can't easily mock WS)
@app.get("/ws")
async def websocket_endpoint():
    """WebSocket endpoint - returns error since we can't mock WebSocket easily"""
    raise HTTPException(
        status_code=400,
        detail="WebSocket endpoint not mocked. Use HTTP endpoints for testing."
    )

@app.get("/object_info")
async def get_object_info():
    """Mock object info endpoint"""
    return {
        "KSamplerAdvanced": {
            "input": {
                "required": {
                    "model": ["MODEL"],
                    "positive": ["CONDITIONING"],
                    "negative": ["CONDITIONING"],
                    "latent_image": ["LATENT"],
                    "noise_seed": ["INT", {"default": 0}],
                    "steps": ["INT", {"default": 20}],
                    "cfg": ["FLOAT", {"default": 8.0}],
                    "sampler_name": ["COMBO[STRING]", {"default": "euler"}],
                    "scheduler": ["COMBO[STRING]", {"default": "normal"}],
                    "add_noise": ["COMBO[STRING]", {"default": "enable"}],
                    "start_at_step": ["INT", {"default": 0}],
                    "end_at_step": ["INT", {"default": 10000}],
                    "return_with_leftover_noise": ["COMBO[STRING]", {"default": "disable"}]
                }
            },
            "output": ["LATENT"],
            "output_is_list": [False],
            "output_name": ["LATENT"],
            "name": "KSamplerAdvanced",
            "display_name": "KSampler (Advanced)",
            "description": "",
            "category": "sampling",
            "output_node": False
        }
    }

if __name__ == "__main__":
    print("=" * 60)
    print("Mock ComfyUI Server")
    print("=" * 60)
    print(f"Server URL: http://127.0.0.1:8001")
    print(f"Upload directory: {UPLOAD_DIR.absolute()}")
    print(f"Output directory: {OUTPUT_DIR.absolute()}")
    print("\nEndpoints:")
    print("  GET  /              - Server status")
    print("  GET  /system_stats  - Mock system stats")
    print("  POST /upload/image  - Upload images")
    print("  POST /prompt        - Queue workflow")
    print("  GET  /history/{id}  - Get prompt history")
    print("  GET  /view          - Download files")
    print("  GET  /object_info   - Node info")
    print("\nNote: WebSocket (/ws) is not mocked.")
    print("=" * 60)

    uvicorn.run(app, host="127.0.0.1", port=8001)