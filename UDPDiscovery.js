// network/UDPDiscovery.js
const dgram = require('dgram');

class UDPDiscovery {
  constructor(listenPort, myName, onNodeFound) {
    this.listenPort = Number(listenPort) || 5001;
    this.myName = myName || `Node-${Math.random().toString(36).slice(2,6)}`;
    this.onNodeFound = onNodeFound || (() => {});
    this.socket = null;
    this.timer = null;
    this.lastBroadcast = 0;
    this.selfPayload = { type: 'HELLO', name: this.myName, port: this.listenPort };
  }

  start() {
    if (this.socket) return;
    this.socket = dgram.createSocket('udp4');
    this.socket.on('error', () => {});
    this.socket.on('message', (msg, rinfo) => {
      try {
        const data = JSON.parse(msg.toString());
        if (data && data.type === 'HELLO' && data.name !== this.myName) {
          // call back with ip, port, name
          this.onNodeFound({
            ip: rinfo.address,
            port: data.port,
            name: data.name,
            lastSeen: Date.now()
          });
        }
      } catch (e) {
        // ignore invalid messages
      }
    });

    this.socket.bind(() => {
      try { this.socket.setBroadcast(true); } catch (e) {}
    });

    // immediate broadcast + periodic
    this.broadcastHello();
    this.timer = setInterval(() => this.broadcastHello(), 5000);
  }

  broadcastHello() {
    if (!this.socket) return;
    const text = Buffer.from(JSON.stringify(this.selfPayload));
    // broadcast to 255.255.255.255
    this.socket.send(text, 0, text.length, 41234, '255.255.255.255', () => {});
    this.lastBroadcast = Date.now();
  }

  updateSelf(payload) {
    if (payload && typeof payload === 'object') {
      // allow updating name or port
      if (payload.name) this.selfPayload.name = payload.name;
      if (payload.port) this.selfPayload.port = payload.port;
    }
    this.broadcastHello();
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.socket) {
      try { this.socket.close(); } catch (e) {}
      this.socket = null;
    }
  }
}

module.exports = UDPDiscovery;
