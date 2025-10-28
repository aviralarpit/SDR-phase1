// network/TCPManager.js
const net = require('net');

class TCPManager {
  constructor(port, logFn) {
    this.port = port || 5001;
    this.server = null;
    this.log = typeof logFn === 'function' ? logFn : () => {};
  }

  start() {
    if (this.server) return;
    this.server = net.createServer((socket) => {
      const addr = socket.remoteAddress + ':' + socket.remotePort;
      this.log(`TCP connection from ${addr}`);
      socket.setKeepAlive(true, 10000);
      socket.on('data', (d) => {
        // currently just log incoming raw data (if any)
        try {
          const s = d.toString().trim();
          this.log(`Received from ${addr}: ${s.slice(0,200)}`);
        } catch (e) {}
      });
      socket.on('close', () => this.log(`TCP disconnected ${addr}`));
      socket.on('error', (err) => this.log(`TCP error ${addr}: ${err.message}`));
    });

    this.server.on('error', (err) => this.log(`TCP server error: ${err.message}`));
    this.server.listen(this.port, '0.0.0.0', () => {
      this.log(`TCP listening on port ${this.port}`);
    });
  }

  stop() {
    if (this.server) {
      try { this.server.close(); } catch (e) {}
      this.server = null;
    }
  }
}

module.exports = TCPManager;
