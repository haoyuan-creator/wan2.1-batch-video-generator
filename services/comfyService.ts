import { ComfyWorkflow, NODE_IDS, WorkflowConfig } from '../types';
import { WAN_WORKFLOW_TEMPLATE } from './workflowTemplate';

// Helper to clone JSON
const clone = <T,>(obj: T): T => JSON.parse(JSON.stringify(obj));

export const checkConnection = async (baseUrl: string): Promise<boolean> => {
  try {
    const res = await fetch(`${baseUrl}/system_stats`);
    return res.ok;
  } catch (e) {
    return false;
  }
};

export const uploadImage = async (baseUrl: string, file: File): Promise<string> => {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('overwrite', 'true');
  formData.append('type', 'input');

  const res = await fetch(`${baseUrl}/upload/image`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Upload failed: ${res.statusText}`);
  }

  const data = await res.json();
  // ComfyUI returns { name: "filename.png", subfolder: "", type: "input" }
  return data.name;
};

export const queuePrompt = async (
  baseUrl: string, 
  workflow: ComfyWorkflow
): Promise<{ prompt_id: string }> => {
  const res = await fetch(`${baseUrl}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow }),
  });

  if (!res.ok) {
    throw new Error(`Queue failed: ${res.statusText}`);
  }

  return await res.json();
};

export const generateWorkflow = (
  imageFilename: string,
  config: WorkflowConfig
): ComfyWorkflow => {
  const workflow = clone(WAN_WORKFLOW_TEMPLATE);

  // 1. Inject Image
  if (workflow[NODE_IDS.LOAD_IMAGE]) {
    workflow[NODE_IDS.LOAD_IMAGE].inputs.image = imageFilename;
  }

  // 2. Inject Prompts
  if (workflow[NODE_IDS.POSITIVE_PROMPT]) {
    workflow[NODE_IDS.POSITIVE_PROMPT].inputs.text = config.positivePrompt;
  }
  if (workflow[NODE_IDS.NEGATIVE_PROMPT]) {
    workflow[NODE_IDS.NEGATIVE_PROMPT].inputs.text = config.negativePrompt;
  }

  // 3. Inject Seed
  // Note: Wan workflow has two samplers (node 85 and 86).
  // Node 86 is the first step (0 to 2) with add_noise: "enable"
  // Node 85 is the second step (2 to 4) with add_noise: "disable"
  // Both should use the same seed for consistency
  const seed = config.randomizeSeed ? Math.floor(Math.random() * 1000000000000) : config.seed;

  // Set seed for primary sampler (node 86)
  if (workflow[NODE_IDS.SAMPLER_SEED]) {
    workflow[NODE_IDS.SAMPLER_SEED].inputs.noise_seed = seed;
  }

  // Also set seed for secondary sampler (node 85) if it exists
  if (workflow["85"]) {
    workflow["85"].inputs.noise_seed = seed;
  }

  // 4. Set custom download path if provided
  if (config.downloadPath && workflow[NODE_IDS.SAVE_VIDEO]) {
    workflow[NODE_IDS.SAVE_VIDEO].inputs.filename_prefix = config.downloadPath;
  }

  // 5. Set video resolution (WanImageToVideo node)
  if (workflow["98"]) {
    workflow["98"].inputs.width = config.width;
    workflow["98"].inputs.height = config.height;
  }

  return workflow;
};

export const getDownloadUrl = (baseUrl: string, filename: string, subfolder: string = '', type: string = 'output'): string => {
  const params = new URLSearchParams({
    filename,
    subfolder,
    type
  });
  return `${baseUrl}/view?${params.toString()}`;
};

export const getHistory = async (baseUrl: string, promptId: string): Promise<any> => {
  try {
    const res = await fetch(`${baseUrl}/history/${promptId}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch history: ${res.statusText}`);
    }
    return await res.json();
  } catch (e) {
    console.error(`Error fetching history for prompt ${promptId}:`, e);
    throw e;
  }
};

export const interruptExecution = async (baseUrl: string): Promise<boolean> => {
  try {
    const res = await fetch(`${baseUrl}/interrupt`, {
      method: 'POST'
    });
    return res.ok;
  } catch (e) {
    console.error('Error interrupting execution:', e);
    return false;
  }
};