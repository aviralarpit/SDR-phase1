// network/NodeRegistry.js
class NodeRegistry {
  // summaryCb(summaryString), peerCb(event, key, info)
  constructor(summaryCb, peerCb) {
    this.nodes = new Map();
    this.summaryCb = typeof summaryCb === 'function' ? summaryCb : () => {};
    this.peerCb = typeof peerCb === 'function' ? peerCb : () => {};
    this.cleanupInterval = setInterval(() => this.cleanup(), 6000);
  }

  updateNode(info) {
    if (!info || !info.ip || !info.port) return;
    const key = `${info.ip}:${info.port}`;
    const now = Date.now();
    const existed = this.nodes.has(key);
    this.nodes.set(key, { ...info, lastSeen: now });

    if (!existed) {
      // new peer came online
      this.summaryCb(`${info.name} → Online (${key})`);
      this.peerCb('online', key, this.nodes.get(key));
    } else {
      // updated lastSeen - no summary message, but could send update if needed
    }
  }

  cleanup() {
    const now = Date.now();
    for (const [key, info] of this.nodes.entries()) {
      if (!info.lastSeen) continue;
      if (now - info.lastSeen > 11000) { // offline threshold ~11s
        this.nodes.delete(key);
        this.summaryCb(`${info.name} → Offline`);
        this.peerCb('offline', key, info);
      }
    }
  }

  listPeers() {
    const out = [];
    for (const [k, v] of this.nodes.entries()) out.push({ key: k, info: v });
    return out;
  }

  clear() {
    this.nodes.clear();
  }
}

module.exports = NodeRegistry;
