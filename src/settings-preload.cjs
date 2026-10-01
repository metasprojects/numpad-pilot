const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settings', {
  get: () => ipcRenderer.invoke('settings:get'),
  save: config => ipcRenderer.invoke('settings:save', config),
  reload: () => ipcRenderer.invoke('settings:reload'),
  openConfig: () => ipcRenderer.invoke('settings:open-config'),
  onStatus: callback => ipcRenderer.on('status', (_event, value) => callback(value))
});
