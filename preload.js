const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  savePdf: () => ipcRenderer.invoke('save-pdf'),
  requestSave: () => ipcRenderer.invoke('project:get-data'),
  markDirty: () => ipcRenderer.send('project:dirty'),
  onLoad: (callback) => ipcRenderer.on('project:load', (_event, data) => callback(data)),
  onNew: (callback) => ipcRenderer.on('project:new', () => callback()),
});
