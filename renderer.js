// renderer.js
(function(){
  const api = window.api;

  // UI elements
  const nodeNameIn = document.getElementById('nodeName');
  const localPortIn = document.getElementById('localPort');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const updateBtn = document.getElementById('updateBtn');
  const nodeSummary = document.getElementById('nodeSummary');
  const nodesList = document.getElementById('nodesList');
  const syslog = document.getElementById('syslog');

  const toggleChat = document.getElementById('toggleChat');
  const chatPanel = document.getElementById('chatPanel');
  const peerSelect = document.getElementById('peerSelect');
  const chatHistory = document.getElementById('chatHistory');
  const chatInput = document.getElementById('chatMessage');
  const sendBtn = document.getElementById('sendBtn');

  // state
  let peers = {}; // key -> info
  let chatLogs = {}; // key -> [ {from, text, ts} ]
  let selectedPeerKey = '';

  // map
  let map = null;
  let selfMarker = null;
  let peerMarkers = {};

  // UI initialization
  startBtn.disabled = true; stopBtn.disabled = true; updateBtn.disabled = true; sendBtn.disabled = true;
  nodeSummary.textContent = 'Not running';

  // validate start inputs
  function validateInputs() {
    startBtn.disabled = !(nodeNameIn.value.trim() && /^\d+$/.test(localPortIn.value.trim()));
  }
  nodeNameIn.addEventListener('input', validateInputs);
  localPortIn.addEventListener('input', validateInputs);

  // syslog helper
  function log(s) {
    const t = new Date().toLocaleTimeString();
    syslog.innerHTML = `<div>[${t}] ${s}</div>` + syslog.innerHTML;
  }

  // drawer toggle
  toggleChat.addEventListener('click', () => { chatPanel.classList.toggle('collapsed'); });

  // START server
  startBtn.addEventListener('click', async () => {
    const name = nodeNameIn.value.trim();
    const port = Number(localPortIn.value.trim());
    if (!name || !port) return;
    const res = await api.startServer(port, 'LAN', name);
    nodeSummary.textContent = `Running on port ${res.port}`;
    startBtn.disabled = true; stopBtn.disabled = false; updateBtn.disabled = false;
    log(`Started server ${res.address}:${res.port}`);
    // update profile display
    document.getElementById('profileName').textContent = name;
    document.getElementById('profileIp').textContent = `IP: ${res.address}`;
  });

  // STOP server
  stopBtn.addEventListener('click', async () => {
    await api.stopServer();
    nodeSummary.textContent = 'Stopped';
    startBtn.disabled = false; stopBtn.disabled = true; updateBtn.disabled = true;
    log('Stopped server');
    peers = {}; refreshNodes(); clearPeerMarkers();
  });

  // UPDATE node info
  updateBtn.addEventListener('click', async () => {
    await api.updateNodeInfo({ name: nodeNameIn.value.trim() });
    log('Updated node info (broadcast)');
  });

  // send chat message
  sendBtn.addEventListener('click', async () => {
    const text = chatInput.value.trim();
    if (!text || !selectedPeerKey) return;
    const [peerIp, peerPort] = selectedPeerKey.split(':');
    const payload = {
      type: 'chat',
      messageId: `${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      sender: nodeNameIn.value.trim() || 'Me',
      text,
      timestamp: new Date().toISOString()
    };
    // optimistic UI
    appendChatMessage(selectedPeerKey, { from: 'me', text, ts: payload.timestamp });
    chatInput.value = ''; sendBtn.disabled = true;

    const res = await api.sendMessage(peerIp, peerPort, payload);
    if (!res.ok) {
      appendChatMessage(selectedPeerKey, { from: 'system', text: `Send failed: ${res.error}`, ts: new Date().toISOString() });
    } else {
      // success acknowledged by TCP send (no ACK implemented yet)
    }
  });

  // append to chat log UI + memory
  function appendChatMessage(key, obj) {
    if (!chatLogs[key]) chatLogs[key] = [];
    chatLogs[key].push(obj);
    renderChatFor(key);
  }

  function renderChatFor(key) {
    if (!key) { chatHistory.innerHTML = '<div class="muted">Select a node to start chatting</div>'; return; }
    const list = chatLogs[key] || [];
    chatHistory.innerHTML = '';
    list.forEach(m => {
      const div = document.createElement('div');
      div.style.marginBottom = '6px';
      if (m.from === 'me') div.innerHTML = `<div style="text-align:right"><b>You</b><div style="font-size:12px;color:var(--muted)">${m.text}</div></div>`;
      else if (m.from === 'system') div.innerHTML = `<div style="text-align:center;color:var(--muted)">${m.text}</div>`;
      else div.innerHTML = `<div><b>${m.from}</b><div style="font-size:12px;color:var(--muted)">${m.text}</div></div>`;
      chatHistory.appendChild(div);
    });
  }

  // peer selection
  peerSelect.addEventListener('change', (e) => {
    const key = e.target.value;
    selectedPeerKey = key;
    renderChatFor(key);
    sendBtn.disabled = !key;
    if (key) chatPanel.classList.remove('collapsed');
  });

  // refresh nodes list UI
  function refreshNodes() {
    nodesList.innerHTML = '';
    const keys = Object.keys(peers).sort();
    if (!keys.length) {
      nodesList.innerHTML = '<div class="muted">No nodes discovered yet</div>';
      peerSelect.innerHTML = '<option value="">— select —</option>';
      return;
    }
    peerSelect.innerHTML = '<option value="">— select —</option>';
    keys.forEach(k => {
      const info = peers[k];
      // build list item
      const item = document.createElement('div');
      item.className = 'node-item';
      item.innerHTML = `<div><strong>${info.name}</strong><div style="font-size:12px;color:var(--muted)">${k}</div></div>
                        <div style="text-align:right"><div style="color:${statusColor(info.status)}">${info.status||'Active'}</div></div>`;
      item.onclick = () => {
        // select the peer and open chat panel
        selectedPeerKey = k; peerSelect.value = k; renderChatFor(k); chatPanel.classList.remove('collapsed'); sendBtn.disabled = false;
        // center map on marker if available
        if (peerMarkers[k]) map.setView(peerMarkers[k].getLatLng(), 13);
      };
      nodesList.appendChild(item);

      // add to select
      const opt = document.createElement('option');
      opt.value = k;
      opt.text = `${info.name} — ${k}`;
      peerSelect.appendChild(opt);
    });
  }
  
  // incoming messages from main (TCP server parsed)
  api.onIncomingMessage((msg) => {
    // msg expected: { type, sender, text, timestamp, ... } or raw
    let key = '';
    if (msg && msg.fromIp && msg.fromPort) key = `${msg.fromIp}:${msg.fromPort}`;
    // if msg.payload contains chat
    const payload = msg.payload || msg;
    if (payload.type === 'chat') {
      const from = payload.sender || 'peer';
      // determine peer key by sender ip/port if available, else search by name
      // NodeRegistry sends peer updates, so find matching key by name
      let peerKey = Object.keys(peers).find(k => peers[k].name === payload.sender) || key || '';
      if (!peerKey) {
        // if not found, create ephemeral key
        peerKey = key || (`unknown-${payload.sender || 'peer'}`);
      }
      appendChatMessage(peerKey, { from, text: payload.text, ts: payload.timestamp });
      log(`Received chat from ${from}`);
    }
  });

  // peer updates (online/offline)
  api.onPeerUpdate((data) => {
    const { event, key, info } = data;
    if (event === 'online') {
      peers[key] = info;
      // default status if missing
      if (!peers[key].status) peers[key].status = 'Active';
      addOrUpdatePeerMarker(key, info);
      log(`${info.name} → Online (${key})`);
    } else if (event === 'offline') {
      log(`${info.name} → Offline`);
      delete peers[key];
      removePeerMarker(key);
    }
    refreshNodes();
  });

  // map setup
  document.addEventListener('DOMContentLoaded', () => {
    const fallback = [12.9716, 77.5946];
    map = L.map('map', { zoomControl: true }).setView(fallback, 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'&copy; OpenStreetMap contributors' }).addTo(map);

    // self marker from geolocation or fallback
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((p) => placeSelf(p.coords.latitude, p.coords.longitude), () => placeSelf(fallback[0], fallback[1]));
    } else placeSelf(fallback[0], fallback[1]);
  });

  function placeSelf(lat, lon) {
    if (selfMarker) selfMarker.setLatLng([lat, lon]);
    else {
      selfMarker = L.circleMarker([lat, lon], { radius:8, color:'#0ea5e9', fillOpacity:0.9 }).addTo(map);
      selfMarker.bindPopup('This node (you)').openPopup();
    }
  }

  function addOrUpdatePeerMarker(key, info) {
    const lat = (info.location && info.location.lat) ? info.location.lat : map.getCenter().lat;
    const lon = (info.location && info.location.lon) ? info.location.lon : map.getCenter().lng;
    const color = statusColor(info.status || 'Active');

    if (peerMarkers[key]) {
      peerMarkers[key].setLatLng([lat,lon]);
      peerMarkers[key].setStyle({ color });
    } else {
      const m = L.circleMarker([lat,lon], { radius:7, color, fillOpacity:0.9 }).addTo(map);
      m.bindPopup(`<b>${info.name}</b><br>${info.ip}:${info.port}`);
      m.on('click', () => { selectedPeerKey = key; peerSelect.value = key; renderChatFor(key); chatPanel.classList.remove('collapsed'); });
      peerMarkers[key] = m;
    }
  }
  function removePeerMarker(key){ if (peerMarkers[key]) { try{ map.removeLayer(peerMarkers[key]); } catch(e){} delete peerMarkers[key]; } }
  function clearPeerMarkers(){ Object.keys(peerMarkers).forEach(k=>removePeerMarker(k)); }

  function statusColor(s){
    switch((s||'').toLowerCase()){
      case 'active': return '#10b981';
      case 'alert': return '#f59e0b';
      case 'critical': return '#fb7185';
      case 'emergency': return '#ef4444';
      default: return '#6b7280';
    }
  }
})();
