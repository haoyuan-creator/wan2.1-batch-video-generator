export enum JobStatus {
  IDLE = 'IDLE',          // Added but not queued
  PENDING = 'PENDING',    // Waiting for processor to pick up
  UPLOADING = 'UPLOADING',
  QUEUED = 'QUEUED',      // In ComfyUI Queue
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface WorkflowConfig {
  positivePrompt: string;
  negativePrompt: string;
  seed: number;
  randomizeSeed: boolean;
  serverAddress: string;
  downloadPath?: string; // 自定义下载路径，如 "videos/my_project"
  width: number; // 视频宽度
  height: number; // 视频高度
}

export interface Job {
  id: string;
  file: File;
  status: JobStatus;
  progress: number; // 0-100
  config: WorkflowConfig; // Individual config snapshot
  promptId?: string; // ComfyUI Prompt ID
  resultUrl?: string;
  resultFilename?: string;
  errorMessage?: string;
  _altUrl?: string; // Alternative URL for fallback
}

export interface ComfyNode {
  inputs: Record<string, any>;
  class_type: string;
  _meta?: {
    title: string;
  };
}

export type ComfyWorkflow = Record<string, ComfyNode>;

// Specific IDs from the provided JSON
export const NODE_IDS = {
  POSITIVE_PROMPT: "93",
  NEGATIVE_PROMPT: "89",
  LOAD_IMAGE: "97",
  SAMPLER_SEED: "86", // KSamplerAdvanced (Start)
  SAVE_VIDEO: "108"
};