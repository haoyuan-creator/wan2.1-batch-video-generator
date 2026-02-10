import React from 'react';

interface Props {
  isConnected: boolean;
  address: string;
}

export const ConnectionStatus: React.FC<Props> = ({ isConnected, address }) => {
  return (
    <div className={`flex items-center space-x-2 px-3 py-1 rounded-full border ${
      isConnected 
        ? 'bg-green-900/30 border-green-700 text-green-400' 
        : 'bg-red-900/30 border-red-700 text-red-400'
    }`}>
      <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
      <span className="text-xs font-mono font-medium">
        {isConnected ? `Connected to ${address}` : `Disconnected (${address})`}
      </span>
    </div>
  );
};