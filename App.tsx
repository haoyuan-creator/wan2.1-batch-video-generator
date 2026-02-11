import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Job, JobStatus, WorkflowConfig, ServerAddress, ServerStatus } from './types';
import { checkConnection, uploadImage, generateWorkflow, queuePrompt, getDownloadUrl, getHistory, interruptExecution } from './services/comfyService';
import { ConnectionStatus } from './components/ConnectionStatus';
import { ConfigPanel } from './components/ConfigPanel';
import { JobQueue } from './components/JobQueue';
import { ServerManager } from './components/ServerManager';

const DEFAULT_POSITIVE = "她们乘着宇宙飞船遨游太空";
const DEFAULT_NEGATIVE = "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走";

// LocalStorage keys
const STORAGE_SERVERS_KEY = 'wan2_servers';
const STORAGE_SELECTED_SERVER_KEY = 'wan2_selected_server';

// Load servers from localStorage
const loadServers = (): ServerAddress[] => {
  try {
    const stored = localStorage.getItem(STORAGE_SERVERS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Reset status to checking when loading
      return parsed.map((s: ServerAddress) => ({ ...s, status: ServerStatus.CHECKING }));
    }
  } catch (e) {
    console.error('Failed to load servers from localStorage:', e);
  }
  // Default server
  return [{
    id: 'default',
    name: 'Default Server',
    url: 'http://192.168.31.150:8001',
    status: ServerStatus.CHECKING,
  }];
};

// Load selected server ID from localStorage
const loadSelectedServerId = (servers: ServerAddress[]): string => {
  try {
    const stored = localStorage.getItem(STORAGE_SELECTED_SERVER_KEY);
    if (stored && servers.find(s => s.id === stored)) {
      return stored;
    }
  } catch (e) {
    console.error('Failed to load selected server from localStorage:', e);
  }
  return servers[0]?.id || '';
};

export default function App() {
  // Server Management
  const [servers, setServers] = useState<ServerAddress[]>(loadServers);
  const [selectedServerId, setSelectedServerId] = useState<string>(() => loadSelectedServerId(loadServers()));

  // Save servers to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(STORAGE_SERVERS_KEY, JSON.stringify(servers));
  }, [servers]);

  // Save selected server to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_SELECTED_SERVER_KEY, selectedServerId);
  }, [selectedServerId]);

  // Get selected server
  const selectedServer = servers.find(s => s.id === selectedServerId);

  // Config represents the "Default" settings for NEW files
  const [defaultConfig, setDefaultConfig] = useState<WorkflowConfig>({
    positivePrompt: DEFAULT_POSITIVE,
    negativePrompt: DEFAULT_NEGATIVE,
    seed: 88888,
    randomizeSeed: true,
    serverAddress: selectedServer?.url || 'http://192.168.31.150:8001',
    width: 1280,
    height: 720
  });

  // Update serverAddress in defaultConfig when selected server changes
  useEffect(() => {
    if (selectedServer) {
      setDefaultConfig(prev => ({ ...prev, serverAddress: selectedServer.url }));
    }
  }, [selectedServerId, selectedServer]);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [isMixedContent, setIsMixedContent] = useState(false);

  // Ref to track processing state inside callbacks
  const jobsRef = useRef(jobs);
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  // Mixed Content Check
  useEffect(() => {
    if (typeof window !== 'undefined' && selectedServer) {
      const isPageHttps = window.location.protocol === 'https:';
      const isServerHttp = selectedServer.url.startsWith('http://') && !selectedServer.url.startsWith('https://');
      setIsMixedContent(isPageHttps && isServerHttp);
    }
  }, [selectedServer]);

  // Polling for HTTP connection - Check ALL servers
  useEffect(() => {
    const checkAllServers = async () => {
      const results = await Promise.all(
        servers.map(async (server) => {
          const isOk = await checkConnection(server.url);
          return { id: server.id, status: isOk ? ServerStatus.CONNECTED : ServerStatus.DISCONNECTED };
        })
      );

      setServers(prev => prev.map(s => ({
        ...s,
        status: results.find(r => r.id === s.id)?.status ?? ServerStatus.DISCONNECTED
      })));
    };

    checkAllServers();
    const interval = setInterval(checkAllServers, 2000);
    return () => clearInterval(interval);
  }, [servers]);

  // WebSocket Connection - connect to selected server only
  useEffect(() => {
    if (!selectedServer || selectedServer.status !== ServerStatus.CONNECTED) return;

    const wsAddress = selectedServer.url.replace(/^http/, 'ws').replace(/^https/, 'wss');
    const wsUrl = `${wsAddress}/ws`;

    console.log(`[WS] Connecting to ${wsUrl}...`);
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('[WS] Connected');
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'execution_start') {
          console.log('[WS] Execution Started:', msg.data.prompt_id);
          updateJobStatusByPromptId(msg.data.prompt_id, JobStatus.PROCESSING);
        }

        if (msg.type === 'progress' && msg.data.prompt_id) {
          const percent = Math.round((msg.data.value / msg.data.max) * 100);
          updateJobProgress(msg.data.prompt_id, percent);
        }

        if (msg.type === 'execution_success') {
          console.log('[WS] Execution Success:', msg.data.prompt_id);
          handleJobSuccess(msg.data.prompt_id, msg.data.result?.outputs);
        }

        if (msg.type === 'execution_error') {
          console.error('[WS] Execution Error:', msg.data);
          updateJobStatusByPromptId(msg.data.prompt_id, JobStatus.FAILED, msg.data.exception_message || "Workflow Error");
        }

        if (msg.type === 'executing' && msg.data.node === null && msg.data.prompt_id) {
           console.log('[WS] Queue finished for prompt:', msg.data.prompt_id);
           handleQueueFinished(msg.data.prompt_id);
        }

      } catch (e) {
        console.error('[WS] Error parsing message', e);
      }
    };

    socket.onerror = (e) => {
      console.error('[WS] Error:', e);
    };

    socket.onclose = () => {
      console.log('[WS] Closed');
    };

    return () => {
      socket.close();
    };
  }, [selectedServer, selectedServer?.status]);

  // --- JOB STATE HELPERS ---

  const updateJobStatus = useCallback((id: string, status: JobStatus, errorMessage?: string) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, status, errorMessage } : j));
  }, []);

  const updateJobStatusByPromptId = useCallback((promptId: string, status: JobStatus, errorMessage?: string) => {
    setJobs(prev => prev.map(j => {
      if (j.promptId !== promptId) return j;

      if (j.status === JobStatus.FAILED && status === JobStatus.COMPLETED) {
        console.log(`[StatusUpdate] Ignoring COMPLETED update for cancelled job ${j.id}`);
        return j;
      }

      return { ...j, status, errorMessage };
    }));
  }, []);

  const updateJobProgress = useCallback((promptId: string, progress: number) => {
    setJobs(prev => prev.map(j => j.promptId === promptId ? { ...j, progress } : j));
  }, []);

  const updateJobPromptId = useCallback((id: string, promptId: string) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, promptId } : j));
  }, []);

  const updateJobConfig = useCallback((id: string, newConfig: WorkflowConfig) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, config: newConfig } : j));
  }, []);

  const handleJobSuccess = (promptId: string, outputs: any) => {
    console.log(`[Success] Handling job success for prompt ${promptId}`, outputs);
    setJobs(prev => {
        return prev.map(j => {
            if (j.promptId !== promptId) return j;

            if (j.status === JobStatus.FAILED) {
              console.log(`[Success] Ignoring success for cancelled job ${j.id} with prompt ${promptId}`);
              return j;
            }

            const saveNodeId = "108";
            let videoData = outputs?.[saveNodeId]?.videos?.[0];

            if (!videoData) {
              videoData = outputs?.[saveNodeId]?.images?.[0];
            }

            if (videoData) {
                const url = getDownloadUrl(j.config.serverAddress, videoData.filename, videoData.subfolder, videoData.type);
                console.log(`[Success] Generated download URL: ${url}`);

                let altUrl: string | undefined;
                if (!videoData.subfolder && videoData.filename.includes('/')) {
                  const parts = videoData.filename.split('/');
                  const filenameOnly = parts.pop()!;
                  const pathOnly = parts.join('/');
                  altUrl = getDownloadUrl(j.config.serverAddress, filenameOnly, pathOnly, videoData.type);
                }

                return {
                    ...j,
                    status: JobStatus.COMPLETED,
                    progress: 100,
                    resultUrl: url,
                    resultFilename: videoData.filename,
                    _altUrl: altUrl
                };
            } else {
                console.warn("Job completed but no video output found in node 108.");
                for (const nodeId in outputs) {
                  const nodeOutput = outputs[nodeId];
                  if (nodeOutput) {
                    if (nodeOutput.videos && nodeOutput.videos.length > 0) {
                      const altVideoData = nodeOutput.videos[0];
                      const url = getDownloadUrl(j.config.serverAddress, altVideoData.filename, altVideoData.subfolder, altVideoData.type);
                      return { ...j, status: JobStatus.COMPLETED, progress: 100, resultUrl: url, resultFilename: altVideoData.filename };
                    }
                    if (nodeOutput.images && nodeOutput.images.length > 0) {
                      const altVideoData = nodeOutput.images[0];
                      const url = getDownloadUrl(j.config.serverAddress, altVideoData.filename, altVideoData.subfolder, altVideoData.type);
                      return { ...j, status: JobStatus.COMPLETED, progress: 100, resultUrl: url, resultFilename: altVideoData.filename };
                    }
                  }
                }
                return { ...j, status: JobStatus.COMPLETED, progress: 100 };
            }
        });
    });
  };

  const handleQueueFinished = async (promptId: string) => {
    try {
      console.log(`[History] Fetching results for prompt ${promptId}...`);
      const job = jobs.find(j => j.promptId === promptId);
      if (!job) return;

      const history = await getHistory(job.config.serverAddress, promptId);

      if (history && history[promptId] && history[promptId].outputs) {
        handleJobSuccess(promptId, history[promptId].outputs);
      } else {
        updateJobStatusByPromptId(promptId, JobStatus.COMPLETED);
      }
    } catch (err) {
      console.error(`[History] Failed to fetch history for prompt ${promptId}:`, err);
      updateJobStatusByPromptId(promptId, JobStatus.COMPLETED);
    }
  };

  // --- ACTIONS ---

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newJobs: Job[] = (Array.from(e.target.files) as File[]).map(file => ({
        id: Math.random().toString(36).substring(2, 11),
        file,
        status: JobStatus.IDLE,
        progress: 0,
        config: { ...defaultConfig } // Uses current selected server
      }));
      setJobs(prev => [...prev, ...newJobs]);
      e.target.value = '';
    }
  };

  const removeJob = (id: string) => {
    setJobs(prev => prev.filter(j => j.id !== id));
  };

  const duplicateJob = (id: string) => {
    setJobs(prev => {
      const jobToDuplicate = prev.find(j => j.id === id);
      if (!jobToDuplicate) return prev;

      const newJob: Job = {
        id: Math.random().toString(36).substring(2, 11),
        file: jobToDuplicate.file,
        status: JobStatus.IDLE,
        progress: 0,
        config: { ...jobToDuplicate.config },
      };

      return [...prev, newJob];
    });
  };

  const startJob = (id: string) => {
    updateJobStatus(id, JobStatus.PENDING);
  };

  const stopJob = async (id: string) => {
    console.log(`[Stop] Attempting to stop job ${id}`);
    setJobs(prev => prev.map(j => {
      if (j.id !== id) return j;

      if (j.status === JobStatus.PENDING) {
        return { ...j, status: JobStatus.IDLE };
      }

      if ([JobStatus.UPLOADING, JobStatus.QUEUED, JobStatus.PROCESSING].includes(j.status)) {
        interruptExecution(j.config.serverAddress).then(success => {
          console.log(`[Stop] Interrupt request ${success ? 'succeeded' : 'failed'} for job ${id}`);
        }).catch(err => {
          console.error(`[Stop] Error interrupting execution for job ${id}:`, err);
        });

        return { ...j, status: JobStatus.FAILED, errorMessage: 'Cancelled by user' };
      }

      return j;
    }));
  };

  // --- BATCH CONTROLS ---

  const startBatch = () => {
    console.log('[StartBatch] Starting batch execution');
    setIsBatchRunning(true);
    setJobs(prev => prev.map(j => {
      if (j.status === JobStatus.IDLE) {
        return { ...j, status: JobStatus.PENDING };
      }
      return j;
    }));
  };

  const stopBatch = async () => {
    console.log('[StopBatch] Stopping batch execution');
    setIsBatchRunning(false);

    // Interrupt all active servers
    const activeServers = new Set(jobs
      .filter(j => [JobStatus.PENDING, JobStatus.UPLOADING, JobStatus.QUEUED, JobStatus.PROCESSING].includes(j.status))
      .map(j => j.config.serverAddress)
    );

    for (const serverUrl of activeServers) {
      try {
        await interruptExecution(serverUrl);
      } catch (err) {
        console.error('[StopBatch] Error interrupting server:', serverUrl, err);
      }
    }

    setJobs(prev => prev.map(j => {
      if ([JobStatus.PENDING, JobStatus.UPLOADING, JobStatus.QUEUED, JobStatus.PROCESSING].includes(j.status)) {
        if (j.status === JobStatus.PROCESSING || j.status === JobStatus.QUEUED || j.status === JobStatus.UPLOADING) {
          return { ...j, status: JobStatus.FAILED, errorMessage: 'Cancelled by user' };
        }
        return { ...j, status: JobStatus.IDLE };
      }
      return j;
    }));
  };

  const downloadAllCompleted = () => {
    const completedJobs = jobs.filter(j => j.status === JobStatus.COMPLETED && j.resultUrl);

    if (completedJobs.length === 0) {
      alert(`No completed videos to download.`);
      return;
    }

    if (!confirm(`Confirm download of ${completedJobs.length} videos? This may open multiple prompts.`)) return;

    completedJobs.forEach((job, index) => {
      setTimeout(async () => {
        try {
          const response = await fetch(job.resultUrl!);
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);

          const link = document.createElement('a');
          link.href = url;
          link.download = job.resultFilename || `video_${index}.mp4`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          setTimeout(() => window.URL.revokeObjectURL(url), 100);
        } catch (error) {
          const link = document.createElement('a');
          link.href = job.resultUrl!;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      }, index * 300);
    });
  };

  // --- PROCESS QUEUE LOOP ---

  const processQueue = useCallback(async () => {
    if (isProcessing) return;

    const currentJobs = jobsRef.current;

    // Get all active servers
    const activeServers = new Set(currentJobs
      .filter(j => [JobStatus.UPLOADING, JobStatus.QUEUED, JobStatus.PROCESSING].includes(j.status))
      .map(j => j.config.serverAddress)
    );

    const nextJob = currentJobs.find(j => j.status === JobStatus.PENDING);
    if (!nextJob) return;

    // Skip if this job's server is already processing something
    if (activeServers.has(nextJob.config.serverAddress)) return;

    setIsProcessing(true);

    try {
      updateJobStatus(nextJob.id, JobStatus.UPLOADING);

      const timestamp = new Date().getTime();
      const uniqueName = `${timestamp}_${nextJob.file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const renamedFile = new File([nextJob.file], uniqueName, { type: nextJob.file.type });

      const uploadedFilename = await uploadImage(nextJob.config.serverAddress, renamedFile);

      updateJobStatus(nextJob.id, JobStatus.QUEUED);
      const workflow = generateWorkflow(uploadedFilename, nextJob.config);

      console.log(`[Queue] Sending job ${nextJob.id} to ${nextJob.config.serverAddress}...`);
      const response = await queuePrompt(nextJob.config.serverAddress, workflow);
      console.log(`[Queue] Job sent. Prompt ID: ${response.prompt_id}`);

      updateJobPromptId(nextJob.id, response.prompt_id);

    } catch (err: any) {
      console.error(err);
      updateJobStatus(nextJob.id, JobStatus.FAILED, err.message || "Failed to queue");
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, updateJobStatus, updateJobPromptId]);

  // Loop trigger
  useEffect(() => {
    const currentJobs = jobsRef.current;

    const pending = currentJobs.some(j => j.status === JobStatus.PENDING);
    const hasActiveJob = currentJobs.some(j =>
      [JobStatus.UPLOADING, JobStatus.QUEUED, JobStatus.PROCESSING].includes(j.status)
    );

    if (pending && !isProcessing && !hasActiveJob) {
      processQueue();
    }

    const hasActive = currentJobs.some(j => [JobStatus.PENDING, JobStatus.QUEUED, JobStatus.UPLOADING, JobStatus.PROCESSING].includes(j.status));
    if (!hasActive && isBatchRunning && currentJobs.length > 0) {
      setIsBatchRunning(false);
    }
  }, [jobs, isProcessing, isBatchRunning, processQueue]);

  // Task status polling
  useEffect(() => {
    if (jobs.length === 0) return;

    const interval = setInterval(async () => {
      const activeJobs = jobs.filter(j => {
        if (!j.promptId) return false;
        if (![JobStatus.PROCESSING, JobStatus.QUEUED, JobStatus.UPLOADING].includes(j.status)) return false;
        return true;
      });

      for (const job of activeJobs) {
        try {
          const history = await getHistory(job.config.serverAddress, job.promptId!);
          if (history && history[job.promptId!] && history[job.promptId!].outputs) {
            handleJobSuccess(job.promptId!, history[job.promptId!].outputs);
          }
        } catch (err) {
          console.warn(`[Polling] Failed to check history for job ${job.id}:`, err);
        }
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [jobs]);

  // --- RENDER ---

  const pendingCount = jobs.filter(j => j.status === JobStatus.PENDING).length;
  const processingCount = jobs.filter(j => [JobStatus.UPLOADING, JobStatus.QUEUED, JobStatus.PROCESSING].includes(j.status)).length;

  // Check if any server is connected
  const anyServerConnected = servers.some(s => s.status === ServerStatus.CONNECTED);

  return (
    <div className="flex flex-col h-full bg-gray-950 text-gray-100 font-sans">

      {/* Header */}
      <header className="flex-none bg-gray-900 border-b border-gray-800 p-4 flex justify-between items-center shadow-lg z-20">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-100 tracking-tight">Wan2.1 Batch Studio</h1>
            <p className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">Local ComfyUI Controller</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-4 text-xs font-mono text-gray-500">
             <span>Tasks: {jobs.length}</span>
             <span className={processingCount > 0 ? "text-yellow-500 animate-pulse" : ""}>Active: {processingCount}</span>
             <span>Queue: {pendingCount}</span>
          </div>
          <ConnectionStatus servers={servers} selectedServerId={selectedServerId} />
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">

        {/* Sidebar */}
        <aside className="w-80 flex-none bg-gray-900 border-r border-gray-800 flex flex-col z-10">
          <div className="p-4 space-y-6 overflow-y-auto flex-1 custom-scrollbar">

            {/* Server Manager */}
            <ServerManager
              servers={servers}
              selectedServerId={selectedServerId}
              onServersChange={setServers}
              onSelectedServerChange={setSelectedServerId}
            />

            {/* Upload Area */}
            <div className="space-y-2">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">New Task</h2>
              <div className="relative group cursor-pointer">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                />
                <div className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center transition-all bg-gray-800 ${
                  isBatchRunning
                    ? 'border-green-600/30 hover:bg-green-900/10'
                    : 'border-gray-700 hover:border-blue-500 hover:bg-gray-800'
                }`}>
                  <div className={`p-3 rounded-full mb-2 transition-colors ${
                    isBatchRunning ? 'bg-green-900/30 text-green-400' : 'bg-gray-700 text-gray-400 group-hover:bg-blue-900/30 group-hover:text-blue-400'
                  }`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <p className="text-sm font-bold text-gray-300">Add Images</p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    {selectedServer ? `Using: ${selectedServer.name}` : 'No server selected'}
                  </p>
                </div>
              </div>
            </div>

            {/* Default Config Panel */}
            <ConfigPanel
              config={defaultConfig}
              onChange={setDefaultConfig}
              disabled={false}
            />

            {/* Error Display */}
            {!anyServerConnected && (
               <div className={`p-3 rounded-lg text-xs border ${
                  isMixedContent ? 'bg-orange-900/20 border-orange-800 text-orange-300' : 'bg-red-900/20 border-red-800 text-red-300'
               }`}>
                 <p className="font-bold mb-1">⚠ Connection Error</p>
                 <p>No ComfyUI servers connected. Please check your server configuration.</p>
                 {isMixedContent && <p className="mt-2 opacity-75">Browser blocked HTTP connection (Mixed Content).</p>}
                 <p className="mt-2 opacity-75">Run ComfyUI with: <code className="bg-black/30 px-1 rounded">--enable-cors-header "*"</code></p>
               </div>
            )}
          </div>

          {/* Batch Actions Footer */}
          <div className="p-4 border-t border-gray-800 bg-gray-900 space-y-3">
            <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Batch Operations</h2>

            <div className="grid grid-cols-2 gap-2">
              {isBatchRunning ? (
                 <button
                  onClick={stopBatch}
                  className="col-span-2 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold text-sm flex items-center justify-center space-x-2 shadow-lg shadow-red-900/20 transition-all"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Stop Batch</span>
                </button>
              ) : (
                <button
                  onClick={startBatch}
                  disabled={!anyServerConnected || jobs.length === 0}
                  className={`col-span-2 py-3 rounded-lg font-bold text-sm flex items-center justify-center space-x-2 transition-all ${
                    !anyServerConnected || jobs.length === 0
                    ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                  <span>Start All Pending</span>
                </button>
              )}

              <button
                onClick={downloadAllCompleted}
                disabled={!jobs.some(j => j.status === JobStatus.COMPLETED)}
                className="col-span-2 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-lg text-xs font-bold flex items-center justify-center space-x-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Download All Completed</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 bg-gray-950 p-6 overflow-hidden flex flex-col relative">
           {/* Background Pattern */}
           <div className="absolute inset-0 opacity-5 pointer-events-none"
                style={{ backgroundImage: 'radial-gradient(#4a5568 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
           </div>

           <div className="relative flex-1 z-10 flex flex-col">
              <JobQueue
                jobs={jobs}
                onRemove={removeJob}
                onUpdateConfig={updateJobConfig}
                onStartJob={startJob}
                onStopJob={stopJob}
                onDuplicate={duplicateJob}
              />
           </div>
        </main>

      </div>
    </div>
  );
}
