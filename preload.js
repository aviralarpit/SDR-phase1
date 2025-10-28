// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  startServer: (port, scope, name, location) => ipcRenderer.invoke('start-server', port, scope, name, location),
  stopServer: () => ipcRenderer.invoke('stop-server'),
  updateNodeInfo: (payload) => ipcRenderer.invoke('update-node-info', payload),
  getKnownPeers: () => ipcRenderer.invoke('get-known-peers'),
  sendMessage: (ip, port, payload) => ipcRenderer.invoke('send-message', ip, port, payload),

  onSysLog: (cb) => ipcRenderer.on('syslog', (_, msg) => cb(msg)),
  onPeerUpdate: (cb) => ipcRenderer.on('peer-update', (_, data) => cb(data)),
  onIncomingMessage: (cb) => ipcRenderer.on('incoming-message', (_, data) => cb(data))
});
