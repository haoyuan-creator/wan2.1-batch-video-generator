import React, { useState } from 'react';
import { WorkflowConfig } from '../types';

interface Props {
  config: WorkflowConfig;
  onChange: (newConfig: WorkflowConfig) => void;
  disabled: boolean;
}

export const ConfigPanel: React.FC<Props> = ({ config, onChange, disabled }) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const handleChange = (field: keyof WorkflowConfig, value: any) => {
    onChange({ ...config, [field]: value });
  };

  const setResolution = (width: number, height: number) => {
    onChange({ ...config, width, height });
  };

  return (
    <div className="bg-gray-850 p-4 rounded-xl border border-gray-750 space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Default Settings</h2>
        <button 
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs text-blue-400 hover:text-blue-300 underline"
        >
          {showAdvanced ? 'Hide Server' : 'Server Config'}
        </button>
      </div>
      
      <p className="text-[10px] text-gray-500 -mt-2">
        Settings applied to <strong>new</strong> images only.
      </p>

      {/* Server Config (Collapsible) */}
      {showAdvanced && (
        <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-700 space-y-2">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">ComfyUI Address</label>
            <input
              type="text"
              value={config.serverAddress}
              onChange={(e) => handleChange('serverAddress', e.target.value)}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-2 py-1 text-sm text-gray-200 font-mono"
              placeholder="http://127.0.0.1:8001"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Custom Download Path</label>
            <input
              type="text"
              value={config.downloadPath || ''}
              onChange={(e) => handleChange('downloadPath', e.target.value || undefined)}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-2 py-1 text-sm text-gray-200 font-mono"
              placeholder="videos/my_project (optional)"
            />
            <p className="text-[10px] text-gray-500 mt-1">
              Relative path in ComfyUI output folder. Leave empty for default.
            </p>
          </div>
          <div className="text-[10px] text-gray-500 leading-tight">
            <p className="font-bold text-yellow-600 mb-1">Connection Issues?</p>
            <p>Ensure ComfyUI is launched with:</p>
            <code className="block bg-black/30 p-1 mt-1 rounded text-gray-300 select-all">--enable-cors-header "*"</code>
          </div>
        </div>
      )}
      
      {/* Prompts */}
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Positive Prompt</label>
          <textarea
            disabled={disabled}
            rows={3}
            value={config.positivePrompt}
            onChange={(e) => handleChange('positivePrompt', e.target.value)}
            className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2 text-sm text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:opacity-50"
          />
        </div>
        
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Negative Prompt</label>
          <textarea
            disabled={disabled}
            rows={2}
            value={config.negativePrompt}
            onChange={(e) => handleChange('negativePrompt', e.target.value)}
            className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2 text-sm text-gray-200 focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none disabled:opacity-50"
          />
        </div>
      </div>

      {/* Resolution Config */}
      <div className="pt-2 border-t border-gray-750">
        <label className="block text-xs font-medium text-gray-400 mb-2">Video Resolution</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setResolution(1280, 720)}
            className={`px-3 py-2 text-xs rounded-lg border transition-colors ${
              config.width === 1280 && config.height === 720
                ? 'bg-blue-900/50 border-blue-600 text-blue-200'
                : 'bg-gray-900 border-gray-700 text-gray-400 hover:bg-gray-800'
            }`}
            disabled={disabled}
          >
            1280×720 (横向)
          </button>
          <button
            type="button"
            onClick={() => setResolution(720, 1280)}
            className={`px-3 py-2 text-xs rounded-lg border transition-colors ${
              config.width === 720 && config.height === 1280
                ? 'bg-blue-900/50 border-blue-600 text-blue-200'
                : 'bg-gray-900 border-gray-700 text-gray-400 hover:bg-gray-800'
            }`}
            disabled={disabled}
          >
            720×1280 (纵向)
          </button>
        </div>
        <p className="text-[10px] text-gray-500 mt-2">
          当前分辨率: {config.width} × {config.height}
        </p>
      </div>

      {/* Seed Config */}
      <div className="flex items-center space-x-4 pt-2 border-t border-gray-750">
        <div className="flex items-center space-x-2">
           <input
            type="checkbox"
            id="randomSeed"
            checked={config.randomizeSeed}
            onChange={(e) => handleChange('randomizeSeed', e.target.checked)}
            disabled={disabled}
            className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="randomSeed" className="text-sm text-gray-300">Randomize Seed</label>
        </div>

        {!config.randomizeSeed && (
           <div className="flex-1">
             <input
              type="number"
              value={config.seed}
              onChange={(e) => handleChange('seed', parseInt(e.target.value) || 0)}
              disabled={disabled}
              placeholder="Fixed Seed"
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-2 py-1 text-sm text-gray-200"
             />
           </div>
        )}
      </div>
    </div>
  );
};