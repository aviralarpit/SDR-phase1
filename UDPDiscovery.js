// network/UDPDiscovery.js
const dgram = require("dgram");
const os = require("os");

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "127.0.0.1";
}

class UDPDiscovery {
  constructor(updateCallback) {
    this.socket = dgram.createSocket("udp4");
    this.localIp = getLocalIp();
    this.listenPort = 41234;
    this.nodes = new Map();
    this.updateCallback = updateCallback;
    this.discoveryInterval = null;
    this.localInfo = null; // <— store here to reuse safely

    this.socket.on("message", (msg, rinfo) => {
      try {
        const data = JSON.parse(msg);
        if (data.type === "HELLO" && rinfo.address !== this.localIp) {
          this.nodes.set(rinfo.address, {
            ip: rinfo.address,
            port: data.port,
            name: data.name || `Node-${rinfo.address}`,
            status: data.status || "Active",
            lastSeen: Date.now(),
          });
          this.updateCallback([...this.nodes.values()]);
        }
      } catch (e) {
        console.warn("Bad UDP message:", e.message);
      }
    });

    this.socket.bind(this.listenPort, () =>
      console.log(`[UDP] Listening on ${this.localIp}:${this.listenPort}`)
    );
  }

  start(localInfo) {
    if (!localInfo || !localInfo.name || !localInfo.port) {
      console.warn("[UDP] ⚠️ Missing localInfo — cannot start discovery");
      return;
    }

    this.localInfo = localInfo;
    console.log(`[UDP] Discovery started as ${localInfo.name} (${this.localIp})`);

    // Send initial ping immediately
    this.pingSubnet();

    // Repeat every 5s
    this.discoveryInterval = setInterval(() => {
      this.pingSubnet();
    }, 5000);
  }

  stop() {
    clearInterval(this.discoveryInterval);
    try {
      this.socket.close();
    } catch (_) {}
    console.log("[UDP] Discovery stopped");
  }

  // 🧠 Instead of broadcast, ping each IP in same subnet
  pingSubnet() {
    if (!this.localInfo) return; // <— avoids undefined 'name' error

    const { name, port, status } = this.localInfo;
    const base = this.localIp.split(".").slice(0, 3).join(".");

    for (let i = 1; i < 255; i++) {
      const target = `${base}.${i}`;
      if (target === this.localIp) continue;

      const msg = Buffer.from(
        JSON.stringify({
          type: "HELLO",
          name,
          port,
          status: status || "Active",
        })
      );

      this.socket.send(msg, 0, msg.length, this.listenPort, target, (err) => {
        if (err && !err.message.includes("EHOSTUNREACH")) {
          console.warn(`[UDP] Send error to ${target}: ${err.message}`);
        }
      });
    }
  }
}

module.exports = UDPDiscovery;
