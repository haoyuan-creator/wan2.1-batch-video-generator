import React, { useState, useRef, useEffect } from 'react';
import { ServerAddress, ServerStatus } from '../types';

interface Props {
  servers: ServerAddress[];
  selectedServerId: string;
}

export const ConnectionStatus: React.FC<Props> = ({ servers, selectedServerId }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedServer = servers.find(s => s.id === selectedServerId);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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
        return 'bg-green-900/30 border-green-700 text-green-400';
      case ServerStatus.DISCONNECTED:
        return 'bg-red-900/30 border-red-700 text-red-400';
      case ServerStatus.CHECKING:
        return 'bg-yellow-900/30 border-yellow-700 text-yellow-400';
    }
  };

  const connectedCount = servers.filter(s => s.status === ServerStatus.CONNECTED).length;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Main Status Button */}
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border transition-all hover:opacity-80 ${
          selectedServer ? getStatusBg(selectedServer.status) : 'bg-gray-800 border-gray-700 text-gray-400'
        }`}
      >
        <div className={`w-2 h-2 rounded-full ${selectedServer ? getStatusColor(selectedServer.status) : 'bg-gray-500'}`} />
        <span className="text-xs font-mono font-medium">
          {selectedServer ? `${selectedServer.name}` : 'No Server'}
        </span>
        <span className="text-[10px] text-gray-500">
          ({connectedCount}/{servers.length})
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-3 w-3 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isDropdownOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50">
          <div className="p-2 space-y-1 max-h-80 overflow-y-auto">
            <div className="px-2 py-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider sticky top-0 bg-gray-900">
              Server Status ({servers.length})
            </div>
            {servers.map((server) => (
              <div
                key={server.id}
                className={`flex items-center justify-between p-2 rounded-lg border ${
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
                <div className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${getStatusBg(server.status)}`}>
                  {server.status === ServerStatus.CONNECTED ? 'Online' :
                   server.status === ServerStatus.CHECKING ? 'Checking' : 'Offline'}
                </div>
              </div>
            ))}
            {servers.length === 0 && (
              <div className="text-center py-4 text-xs text-gray-500">
                No servers configured
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
