import React, { useState } from 'react';
import { Job, JobStatus, WorkflowConfig } from '../types';

interface Props {
  job: Job;
  onUpdateConfig: (id: string, config: WorkflowConfig) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

export const JobCard: React.FC<Props> = ({ job, onUpdateConfig, onStart, onStop, onDelete, onDuplicate }) => {
  const [videoError, setVideoError] = useState<string | null>(null);

  const handleConfigChange = (field: keyof WorkflowConfig, value: any) => {
    onUpdateConfig(job.id, { ...job.config, [field]: value });
  };

  const setResolution = (width: number, height: number) => {
    onUpdateConfig(job.id, { ...job.config, width, height });
  };

  const handleDownload = async () => {
    if (!job.resultUrl) return;

    console.log(`[Download] Downloading job ${job.id} from ${job.resultUrl}, filename: ${job.resultFilename}`);

    try {
      // Fetch the file as a blob to force download instead of preview
      const response = await fetch(job.resultUrl);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = job.resultFilename || `video_${job.id}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the object URL after a short delay
      setTimeout(() => window.URL.revokeObjectURL(url), 100);
    } catch (error) {
      console.error('[Download] Failed to download:', error);
      // Fallback to direct link if fetch fails (e.g., CORS issues)
      const link = document.createElement('a');
      link.href = job.resultUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const isProcessing = job.status === JobStatus.PROCESSING || job.status === JobStatus.UPLOADING || job.status === JobStatus.QUEUED;
  const isPending = job.status === JobStatus.PENDING;
  const isCompleted = job.status === JobStatus.COMPLETED;

  const StatusColor = {
    [JobStatus.IDLE]: 'bg-gray-700 text-gray-300',
    [JobStatus.PENDING]: 'bg-blue-900/80 text-blue-200 border-blue-700',
    [JobStatus.UPLOADING]: 'bg-purple-900/80 text-purple-200 animate-pulse',
    [JobStatus.QUEUED]: 'bg-indigo-900/80 text-indigo-200 animate-pulse',
    [JobStatus.PROCESSING]: 'bg-yellow-900/80 text-yellow-200 border-yellow-700 animate-pulse',
    [JobStatus.COMPLETED]: 'bg-green-900/80 text-green-200 border-green-700',
    [JobStatus.FAILED]: 'bg-red-900/80 text-red-200 border-red-700',
  };

  // Extract server info from URL for display
  const getServerDisplayName = (url: string): string => {
    try {
      const urlObj = new URL(url);
      return `${urlObj.hostname}:${urlObj.port}`;
    } catch {
      return url;
    }
  };

  return (
    <div className={`relative bg-gray-800 rounded-xl border flex flex-col transition-all duration-300 ${
      isProcessing ? 'border-yellow-600/50 shadow-[0_0_15px_rgba(234,179,8,0.1)]' :
      isCompleted ? 'border-green-600/50' : 'border-gray-700'
    }`}>

      {/* Media Area */}
      <div className="relative aspect-video bg-gray-900 rounded-t-xl overflow-hidden group">
        {isCompleted && job.resultUrl ? (
          videoError ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-red-900/20 p-4">
              <div className="text-red-400 text-xs mb-2">Video Load Error</div>
              <div className="text-gray-500 text-[10px] text-center mb-2">{videoError}</div>
              {job._altUrl && (
                <button
                  onClick={() => {
                    console.log(`Trying alternative URL: ${job._altUrl}`);
                    setVideoError(`Trying alternative URL...`);
                    // In a real implementation, we would update the job's resultUrl
                    // For now, we'll just reload with alternative URL
                    window.open(job._altUrl, '_blank');
                  }}
                  className="mt-1 text-green-400 text-[10px] hover:underline"
                >
                  Try Alternative URL
                </button>
              )}
              <button
                onClick={() => setVideoError(null)}
                className="mt-2 text-blue-400 text-[10px] hover:underline"
              >
                Retry Original
              </button>
            </div>
          ) : (
            <div className="relative w-full h-full">
              <video
                src={job.resultUrl}
                controls
                loop
                muted
                className="w-full h-full object-contain"
                onError={(e) => {
                  console.error(`Video load error for ${job.resultUrl}`, e);
                  console.error('Video error details:', (e.target as HTMLVideoElement).error);
                  setVideoError(`Failed to load video from ${job.resultUrl}`);
                }}
                onLoadStart={() => {
                  console.log(`Video load started: ${job.resultUrl}`);
                }}
                onLoadedData={(e) => {
                  const video = e.target as HTMLVideoElement;
                  console.log(`Video loaded successfully: ${job.resultUrl}`);
                  console.log('Video metadata:', {
                    duration: video.duration,
                    videoWidth: video.videoWidth,
                    videoHeight: video.videoHeight,
                    readyState: video.readyState
                  });
                  setVideoError(null);
                }}
                onCanPlay={() => {
                  console.log(`Video can play: ${job.resultUrl}`);
                }}
                onStalled={() => {
                  console.warn(`Video stalled: ${job.resultUrl}`);
                }}
                onWaiting={() => {
                  console.warn(`Video waiting: ${job.resultUrl}`);
                }}
              />
              {!videoError && (
                <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[8px] px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                  Click to play
                </div>
              )}
            </div>
          )
        ) : (
          <img
            src={URL.createObjectURL(job.file)}
            alt="Source"
            className={`w-full h-full object-cover transition-opacity ${isProcessing ? 'opacity-50' : 'opacity-80'}`}
          />
        )}
        
        {/* Status Badge overlay */}
        <div className="absolute top-2 right-2 z-10">
          <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase border backdrop-blur-md shadow-sm ${StatusColor[job.status]}`}>
            {job.status} {job.status === JobStatus.PROCESSING && `${Math.round(job.progress)}%`}
          </div>
        </div>

        {/* Server Info Badge */}
        <div className="absolute top-2 left-2 z-10">
          <div className="px-2 py-1 rounded text-[9px] font-mono font-medium bg-gray-900/80 border border-gray-700 text-gray-400 backdrop-blur-md shadow-sm">
            {getServerDisplayName(job.config.serverAddress)}
          </div>
        </div>

        {/* Loading Spinner Overlay */}
        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center">
             <div className="w-8 h-8 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {/* Error Message Overlay */}
        {job.status === JobStatus.FAILED && (
          <div className="absolute bottom-0 left-0 right-0 bg-red-900/90 p-2 text-[10px] text-white truncate">
            {job.errorMessage || "Unknown Error"}
          </div>
        )}
      </div>

      {/* Editor / Info Section */}
      <div className="p-3 flex-1 flex flex-col gap-2">
        <h3 className="text-xs font-medium text-gray-300 truncate" title={job.file.name}>{job.file.name}</h3>

        {/* Always show prompt and resolution settings */}
        <div className="space-y-2">
          <div>
            <label className="text-[10px] text-gray-500">Positive Prompt</label>
            <textarea
              value={job.config.positivePrompt}
              onChange={(e) => handleConfigChange('positivePrompt', e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded p-1 text-xs text-gray-200 h-16 focus:border-blue-500 outline-none resize-none"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500">Video Resolution</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                type="button"
                onClick={() => setResolution(1280, 720)}
                className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                  job.config.width === 1280 && job.config.height === 720
                    ? 'bg-blue-900/50 border-blue-600 text-blue-200'
                    : 'bg-gray-900 border-gray-700 text-gray-400 hover:bg-gray-800'
                }`}
              >
                1280×720
              </button>
              <button
                type="button"
                onClick={() => setResolution(720, 1280)}
                className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                  job.config.width === 720 && job.config.height === 1280
                    ? 'bg-blue-900/50 border-blue-600 text-blue-200'
                    : 'bg-gray-900 border-gray-700 text-gray-400 hover:bg-gray-800'
                }`}
              >
                720×1280
              </button>
            </div>
            <p className="text-[9px] text-gray-500 mt-1">
              Current: {job.config.width} × {job.config.height}
            </p>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="p-2 border-t border-gray-700 bg-gray-900/30 rounded-b-xl flex justify-between items-center">
        <div className="flex gap-2">
          {isProcessing || isPending ? (
            <button 
              onClick={() => onStop(job.id)}
              className="p-1.5 rounded bg-red-900/50 text-red-400 hover:bg-red-900 hover:text-white transition-colors"
              title="Stop / Dequeue"
            >
               <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
              </svg>
            </button>
          ) : (
             <button 
              onClick={() => onStart(job.id)}
              className="p-1.5 rounded bg-blue-900/50 text-blue-400 hover:bg-blue-600 hover:text-white transition-colors flex items-center gap-1"
              title={isCompleted ? "Re-generate" : "Start Task"}
            >
               <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                {isCompleted ? (
                   <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                ) : (
                   <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                )}
               </svg>
               {isCompleted && <span className="text-[10px] font-bold">Re-run</span>}
            </button>
          )}

          {isCompleted && job.resultUrl && (
             <button
               onClick={handleDownload}
               className="p-1.5 rounded bg-green-900/50 text-green-400 hover:bg-green-600 hover:text-white transition-colors"
               title="Download Video"
             >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
             </button>
          )}

          {/* Duplicate button - available for all job states */}
          <button
            onClick={() => onDuplicate(job.id)}
            className="p-1.5 rounded bg-purple-900/50 text-purple-400 hover:bg-purple-600 hover:text-white transition-colors"
            title="Duplicate Task"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>

        <button 
          onClick={() => onDelete(job.id)}
          className="text-gray-600 hover:text-red-500 transition-colors p-1"
          title="Delete Task"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
};