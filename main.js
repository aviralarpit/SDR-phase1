// main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const net = require('net');

const TCPManager = require('./network/TCPManager');
const UDPDiscovery = require('./network/UDPDiscovery');
const NodeRegistry = require('./network/NodeRegistry');

let win;
let tcpManager = null;
let udpDiscovery = null;
let nodeRegistry = null;
let localName = `Node-${Math.random().toString(36).slice(2,6)}`;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 880,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile('index.html');
}

app.whenReady().then(() => {
  nodeRegistry = new NodeRegistry(
    (summary) => { if (win) win.webContents.send('syslog', summary); },
    (event, key, info) => { if (win) win.webContents.send('peer-update', { event, key, info }); }
  );
  createWindow();
});

app.on('window-all-closed', () => app.quit());

// Start server & discovery
ipcMain.handle('start-server', async (_, port, scope, name, location) => {
  const listenPort = Number(port) || 5001;
  localName = name || localName;

  if (!tcpManager) {
    tcpManager = new TCPManager(listenPort, (msg) => {
      if (win) win.webContents.send('syslog', msg);
    }, (msgObj) => {
      // incoming parsed JSON messages (chat etc) from TCP clients
      if (win && win.webContents) win.webContents.send('incoming-message', msgObj);
    });
    tcpManager.start();
  }

  if (!udpDiscovery) {
    udpDiscovery = new UDPDiscovery(listenPort, localName, (nodeInfo) => {
      nodeRegistry.updateNode(nodeInfo);
    });
    udpDiscovery.start();
  }

  return { address: '0.0.0.0', port: listenPort, name: localName };
});

ipcMain.handle('stop-server', async () => {
  if (tcpManager) { tcpManager.stop(); tcpManager = null; }
  if (udpDiscovery) { udpDiscovery.stop(); udpDiscovery = null; }
  if (nodeRegistry) nodeRegistry.clear();
  if (win) win.webContents.send('syslog', 'Server stopped');
  return { ok: true };
});

ipcMain.handle('update-node-info', async (_, payload) => {
  if (udpDiscovery) udpDiscovery.updateSelf(payload);
  if (win) win.webContents.send('syslog', `Node info updated`);
  return { ok: true };
});

ipcMain.handle('get-known-peers', async () => {
  if (!nodeRegistry) return [];
  return nodeRegistry.listPeers();
});

// Send chat message to remote ip:port (renderer asks)
ipcMain.handle('send-message', async (_, peerIp, peerPort, msgPayload) => {
  return new Promise((resolve) => {
    try {
      const client = new net.Socket();
      client.setTimeout(4000);
      client.connect(Number(peerPort), peerIp, () => {
        const toSend = JSON.stringify(msgPayload) + '\n';
        client.write(toSend, () => {
          client.end();
          resolve({ ok: true });
        });
      });
      client.on('error', (e) => { resolve({ ok: false, error: e.message }); });
      client.on('timeout', () => { client.destroy(); resolve({ ok:false, error:'timeout' }); });
    } catch (e) { resolve({ ok:false, error:e.message }); }
  });
});
