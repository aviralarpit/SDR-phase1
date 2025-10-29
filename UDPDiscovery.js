// UDPDiscovery.js — Debug Mode (compatible with your main.js)
const dgram = require("dgram");
const os = require("os");

class UDPDiscovery {
  constructor(listenPort, localName, nodeUpdateCallback, localIp) {
    this.listenPort = listenPort || 41234;
    this.localName = localName || "UnknownNode";
    this.localIp = localIp || this.getLocalIp();
    this.nodeUpdateCallback = nodeUpdateCallback;
    this.socket = dgram.createSocket("udp4");
    this.discoveryInterval = null;
    this.nodes = new Map();
    this.selfInfo = {
      name: this.localName,
      ip: this.localIp,
      port: this.listenPort,
      status: "Active",
    };

    console.log(`[DEBUG][UDP] Module loaded for ${this.selfInfo.name} (${this.localIp})`);

    this.socket.on("message", (msg, rinfo) => {
      try {
        console.log(`[DEBUG][UDP] ⬅ Received from ${rinfo.address}:${rinfo.port} → ${msg}`);
        const data = JSON.parse(msg);
        if (data.type === "HELLO" && rinfo.address !== this.localIp) {
          const node = {
            ip: rinfo.address,
            port: data.port,
            name: data.name || `Node-${rinfo.address}`,
            status: data.status || "Active",
            lastSeen: Date.now(),
          };
          this.nodes.set(rinfo.address, node);
          console.log(`[DEBUG][UDP] ✅ Discovered node: ${node.name} (${node.ip}:${node.port})`);
          if (this.nodeUpdateCallback) this.nodeUpdateCallback(node);
        }
      } catch (e) {
        console.warn(`[DEBUG][UDP] ⚠️ Invalid UDP packet: ${e.message}`);
      }
    });

    this.socket.on("error", (err) => {
      console.error(`[DEBUG][UDP] ❌ Socket error: ${err.message}`);
    });

    this.socket.bind(this.listenPort, () => {
      console.log(`[DEBUG][UDP] 🛰 Listening on ${this.localIp}:${this.listenPort}`);
    });
  }

  getLocalIp() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === "IPv4" && !net.internal) return net.address;
      }
    }
    return "127.0.0.1";
  }

  start() {
    console.log(`[DEBUG][UDP] 🚀 Discovery started as ${this.localName}`);
    this.pingSubnet(); // initial send
    this.discoveryInterval = setInterval(() => this.pingSubnet(), 5000);
  }

  stop() {
    clearInterval(this.discoveryInterval);
    try { this.socket.close(); } catch (_) {}
    console.log(`[DEBUG][UDP] 🛑 Discovery stopped`);
  }

  updateSelf(info) {
    this.selfInfo = { ...this.selfInfo, ...info };
    console.log(`[DEBUG][UDP] 🧩 Updated self info:`, this.selfInfo);
  }

  pingSubnet() {
    const { name, port, status } = this.selfInfo;
    const base = this.localIp.split(".").slice(0, 3).join(".");
    const msg = Buffer.from(JSON.stringify({
      type: "HELLO",
      name,
      port,
      status,
    }));

    console.log(`[DEBUG][UDP] 📡 Broadcasting HELLO from ${this.localIp} to subnet ${base}.x`);
    let sentCount = 0;

    for (let i = 1; i < 255; i++) {
      const target = `${base}.${i}`;
      if (target === this.localIp) continue;
      this.socket.send(msg, 0, msg.length, this.listenPort, target, (err) => {
        if (err && !err.message.includes("EHOSTUNREACH")) {
          console.warn(`[DEBUG][UDP] ❌ Send error to ${target}: ${err.message}`);
        } else {
          sentCount++;
        }
      });
    }

    console.log(`[DEBUG][UDP] 📨 Sent ${sentCount} packets`);
  }
}

module.exports = UDPDiscovery;
