import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  clipboard: {
    getDetectionHistory: () => ipcRenderer.invoke('clipboard:get-detection-history'),
    clearHistory: () => ipcRenderer.invoke('clipboard:clear-history'),
    getSettings: () => ipcRenderer.invoke('clipboard:get-settings'),
    updateSettings: (settings: any) => ipcRenderer.invoke('clipboard:update-settings', settings),
    onSensitiveDataDetected: (callback: (data: any) => void) => {
      ipcRenderer.on('clipboard:sensitive-data-detected', (_, data) => callback(data));
    },
  },
  app: {
    getPlatform: () => ipcRenderer.invoke('app:get-platform'),
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    isMonitoring: () => ipcRenderer.invoke('app:is-monitoring'),
    toggleMonitoring: () => ipcRenderer.invoke('app:toggle-monitoring'),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
