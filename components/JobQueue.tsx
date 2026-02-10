import React from 'react';
import { Job, WorkflowConfig } from '../types';
import { JobCard } from './JobCard';

interface Props {
  jobs: Job[];
  onRemove: (id: string) => void;
  onUpdateConfig: (id: string, config: WorkflowConfig) => void;
  onStartJob: (id: string) => void;
  onStopJob: (id: string) => void;
  onDuplicate: (id: string) => void;
}

export const JobQueue: React.FC<Props> = ({ jobs, onRemove, onUpdateConfig, onStartJob, onStopJob, onDuplicate }) => {
  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full border-2 border-dashed border-gray-800 rounded-xl bg-gray-900/50 text-gray-500 gap-4">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <div className="text-center">
          <p className="text-lg font-medium">No tasks yet</p>
          <p className="text-sm">Upload images from the sidebar to create tasks.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto pr-2 pb-20">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
        {jobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            onDelete={onRemove}
            onUpdateConfig={onUpdateConfig}
            onStart={onStartJob}
            onStop={onStopJob}
            onDuplicate={onDuplicate}
          />
        ))}
      </div>
    </div>
  );
};