import React, { useState } from 'react';
import { ServerAddress, ServerStatus } from '../types';

interface Props {
  servers: ServerAddress[];
  selectedServerId: string;
  onServersChange: (servers: ServerAddress[]) => void;
  onSelectedServerChange: (serverId: string) => void;
}

export const ServerManager: React.FC<Props> = ({
  servers,
  selectedServerId,
  onServersChange,
  onSelectedServerChange,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [newServerUrl, setNewServerUrl] = useState('');

  const handleAddServer = () => {
    if (!newServerName.trim() || !newServerUrl.trim()) return;

    const newServer: ServerAddress = {
      id: Math.random().toString(36).substring(2, 11),
      name: newServerName.trim(),
      url: newServerUrl.trim(),
      status: ServerStatus.CHECKING,
    };

    onServersChange([...servers, newServer]);
    setNewServerName('');
    setNewServerUrl('');
  };

  const handleRemoveServer = (id: string) => {
    const updated = servers.filter(s => s.id !== id);
    onServersChange(updated);

    // If removed server was selected, select another one
    if (id === selectedServerId && updated.length > 0) {
      onSelectedServerChange(updated[0].id);
    }
  };

  const handleSetDefault = (id: string) => {
    onSelectedServerChange(id);
  };

  const getStatusColor = (status: ServerStatus): string => {
    switch (status) {
      case ServerStatus.CONNECTED:
        return 'bg-green-500';
      case ServerStatus.DISCONNECTED:
        return 'bg-red-500';
      case ServerStatus.CHECKING:
        return 'bg-yellow-500 animate-pulse';
    }
  };

  const getStatusBg = (status: ServerStatus): string => {
    switch (status) {
      case ServerStatus.CONNECTED:
        return 'bg-green-900/20 border-green-700 text-green-400';
      case ServerStatus.DISCONNECTED:
        return 'bg-red-900/20 border-red-700 text-red-400';
      case ServerStatus.CHECKING:
        return 'bg-yellow-900/20 border-yellow-700 text-yellow-400';
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Servers</h2>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-gray-500 hover:text-gray-300 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Selected Server Display */}
      <div className={`flex items-center justify-between px-3 py-2 rounded-lg border ${
        servers.find(s => s.id === selectedServerId)?.status === ServerStatus.CONNECTED
          ? 'bg-green-900/30 border-green-700'
          : 'bg-red-900/30 border-red-700'
      }`}>
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${
            servers.find(s => s.id === selectedServerId)?.status === ServerStatus.CONNECTED
              ? 'bg-green-500'
              : 'bg-red-500'
          }`} />
          <span className="text-xs font-mono text-gray-300">
            {servers.find(s => s.id === selectedServerId)?.name || 'No Server'}
          </span>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-[10px] text-gray-500 hover:text-gray-300"
        >
          {servers.length} server{servers.length !== 1 ? 's' : ''}
        </button>
      </div>

      {/* Expanded List */}
      {isExpanded && (
        <div className="space-y-2 mt-2">
          {/* Server List */}
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {servers.map((server) => (
              <div
                key={server.id}
                className={`flex items-center justify-between p-2 rounded-lg border transition-all ${
                  server.id === selectedServerId
                    ? 'bg-blue-900/30 border-blue-700'
                    : 'bg-gray-800 border-gray-700'
                }`}
              >
                <div className="flex items-center space-x-2 flex-1 min-w-0">
                  <div className={`w-2 h-2 rounded-full ${getStatusColor(server.status)}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-300 truncate">{server.name}</div>
                    <div className="text-[10px] font-mono text-gray-500 truncate">{server.url}</div>
                  </div>
                </div>
                <div className="flex items-center space-x-1">
                  {server.id !== selectedServerId && (
                    <button
                      onClick={() => handleSetDefault(server.id)}
                      className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-blue-400 transition-colors"
                      title="Set as default"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}
                  {servers.length > 1 && (
                    <button
                      onClick={() => handleRemoveServer(server.id)}
                      className="p-1 rounded hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors"
                      title="Remove server"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Add New Server */}
          <div className="p-2 bg-gray-800 rounded-lg border border-gray-700 space-y-2">
            <input
              type="text"
              placeholder="Server name"
              value={newServerName}
              onChange={(e) => setNewServerName(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:border-blue-500 outline-none"
            />
            <input
              type="text"
              placeholder="http://IP:PORT"
              value={newServerUrl}
              onChange={(e) => setNewServerUrl(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 font-mono focus:border-blue-500 outline-none"
            />
            <button
              onClick={handleAddServer}
              disabled={!newServerName.trim() || !newServerUrl.trim()}
              className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded text-xs font-bold transition-colors"
            >
              Add Server
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
