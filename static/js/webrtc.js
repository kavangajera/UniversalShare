/* ============================================================
   webrtc.js — Peer-to-peer file transfer via WebRTC
   Files go directly between browsers. Server only does signaling.
   ============================================================ */

// --- State ---
let ws = null;
let myPeerId = null;
let myPeerName = null;
let peers = {};           // {peerId: {name, connection, dataChannel}}
const CHUNK_SIZE = 64 * 1024; // 64KB chunks — safest size for all browsers without fragmentation overhead
const BUFFER_HIGH = 1024 * 1024;       // 1MB — pause sending when buffer exceeds this to prevent queue saturation
const BUFFER_LOW  = 256 * 1024;        // 256KB — resume sending when buffer drains to this
const WS_RECONNECT_DELAY = 2000;

// --- ICE Configuration (works on LAN without internet) ---
const ICE_CONFIG = {
    iceServers: [
        // STUN server helps with NAT traversal (only used if internet available)
        // On LAN/hotspot, WebRTC works without any STUN/TURN servers
    ]
};

// --- Connect to signaling server ---
function connectSignaling() {
    // Try WSS first (for HTTPS pages), fall back to WS (for self-signed certs)
    const host = window.location.host;
    const protocols = window.location.protocol === 'https:' ? ['wss:', 'ws:'] : ['ws:'];
    
    tryConnect(protocols, host, 0);
}

function tryConnect(protocols, host, index) {
    if (index >= protocols.length) {
        console.error('[P2P] All WebSocket protocols failed');
        updateP2PStatus('offline', 'Offline');
        // Retry after delay
        setTimeout(() => connectSignaling(), WS_RECONNECT_DELAY * 3);
        return;
    }

    const wsUrl = `${protocols[index]}//${host}/ws`;
    console.log(`[P2P] Trying ${wsUrl}...`);
    
    ws = new WebSocket(wsUrl);
    let connected = false;

    ws.onopen = () => {
        connected = true;
        console.log(`[P2P] Connected via ${protocols[index]}`);
        updateP2PStatus('online', 'Connected');

        // Set device name based on platform
        const deviceName = getDeviceName();
        ws.send(JSON.stringify({ type: 'set-name', name: deviceName }));
    };

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        // Respond to server heartbeat pings
        if (message.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
            return;
        }
        handleSignalingMessage(message);
    };

    ws.onclose = () => {
        if (connected) {
            console.log('[P2P] Disconnected from signaling');
            updateP2PStatus('offline', 'Reconnecting...');
            setTimeout(connectSignaling, WS_RECONNECT_DELAY);
        }
    };

    ws.onerror = (err) => {
        if (!connected) {
            console.log(`[P2P] ${protocols[index]} failed, trying next...`);
            ws.onclose = null; // Prevent double retry
            // Try next protocol
            tryConnect(protocols, host, index + 1);
        }
    };
}

function getDeviceName() {
    const ua = navigator.userAgent;
    if (/iPhone/i.test(ua)) return '📱 iPhone';
    if (/iPad/i.test(ua)) return '📱 iPad';
    if (/Android/i.test(ua)) {
        // Try to extract phone model
        const match = ua.match(/;\s*([^;)]+)\s*Build/);
        return match ? `📱 ${match[1].trim()}` : '📱 Android';
    }
    if (/Macintosh/i.test(ua)) return '💻 Mac';
    if (/Windows/i.test(ua)) return '💻 Windows';
    if (/Linux/i.test(ua)) return '🖥️ Linux';
    return '🌐 Browser';
}

// --- Handle signaling messages ---
function handleSignalingMessage(msg) {
    switch (msg.type) {
        case 'welcome':
            myPeerId = msg.peer_id;
            myPeerName = msg.peer_name;
            console.log(`[P2P] My ID: ${myPeerId}`);
            break;

        case 'peers':
            // Initial peer list
            msg.peers.forEach(p => {
                peers[p.id] = { name: p.name, connection: null, dataChannel: null };
            });
            renderPeerList();
            break;

        case 'peer-joined':
            peers[msg.peer_id] = { name: msg.peer_name, connection: null, dataChannel: null };
            renderPeerList();
            showToast(`${msg.peer_name} joined`, 'success');
            break;

        case 'peer-updated':
            if (peers[msg.peer_id]) {
                peers[msg.peer_id].name = msg.peer_name;
                renderPeerList();
            }
            break;

        case 'peer-left':
            if (peers[msg.peer_id]) {
                // Clean up connection
                if (peers[msg.peer_id].connection) {
                    peers[msg.peer_id].connection.close();
                }
                delete peers[msg.peer_id];
                renderPeerList();
                showToast('A device disconnected', 'error');
            }
            break;

        case 'offer':
            handleOffer(msg.from, msg.from_name, msg.data);
            break;

        case 'answer':
            handleAnswer(msg.from, msg.data);
            break;

        case 'ice-candidate':
            handleIceCandidate(msg.from, msg.data);
            break;

        case 'file-request':
            handleFileRequest(msg.from, msg.from_name, msg.files);
            break;

        case 'file-response':
            handleFileResponse(msg.from, msg.accepted);
            break;
    }
}

// --- WebRTC Connection Setup ---
function createPeerConnection(peerId) {
    const pc = new RTCPeerConnection(ICE_CONFIG);

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({
                type: 'ice-candidate',
                target: peerId,
                data: event.candidate,
            }));
        }
    };

    pc.onconnectionstatechange = () => {
        console.log(`[P2P] Connection to ${peerId}: ${pc.connectionState}`);
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
            cleanupConnection(peerId);
        }
    };

    pc.ondatachannel = (event) => {
        const channel = event.channel;
        setupReceiveChannel(peerId, channel);
    };

    if (peers[peerId]) {
        peers[peerId].connection = pc;
    }

    return pc;
}

function cleanupConnection(peerId) {
    if (peers[peerId]) {
        if (peers[peerId].connection) {
            peers[peerId].connection.close();
        }
        peers[peerId].connection = null;
        peers[peerId].dataChannel = null;
    }
}

// --- Sending files (initiator) ---
async function sendFilesToPeer(peerId) {
    if (selectedFiles.length === 0) {
        showToast('Select files first, then tap a device to send', 'error');
        return;
    }

    const peer = peers[peerId];
    if (!peer) return;

    // Show sending status
    showToast(`Connecting to ${peer.name}...`, 'success');

    // Create peer connection and data channel
    const pc = createPeerConnection(peerId);
    const channel = pc.createDataChannel('fileTransfer', {
        ordered: true,
        // Max throughput: large buffer
        bufferedAmountLowThreshold: BUFFER_LOW,
    });

    peer.dataChannel = channel;

    channel.binaryType = 'arraybuffer';

    channel.onopen = () => {
        console.log(`[P2P] DataChannel open to ${peerId}`);
        // Start sending files
        sendFilesOverChannel(peerId, channel, selectedFiles);
    };

    channel.onerror = (err) => {
        console.error(`[P2P] DataChannel error:`, err);
        showToast('Transfer failed — connection error', 'error');
    };

    // Create and send offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    ws.send(JSON.stringify({
        type: 'offer',
        target: peerId,
        data: offer,
    }));
}

async function sendFilesOverChannel(peerId, channel, files) {
    const peer = peers[peerId];
    const peerName = peer ? peer.name : 'device';

    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Send file metadata first
        channel.send(JSON.stringify({
            type: 'file-start',
            name: file.name,
            size: file.size,
            fileType: file.type,
            index: i,
            total: files.length,
        }));

        // Read and send file in chunks — optimized for speed
        const reader = file.stream().getReader();
        let sent = 0;
        let lastProgressUpdate = 0;

        // Event-driven backpressure: resolve a promise when buffer drains
        function waitForBufferDrain() {
            return new Promise(resolve => {
                if (channel.bufferedAmount <= BUFFER_LOW) {
                    resolve();
                    return;
                }
                // Use the onbufferedamountlow event (zero-delay, no polling)
                channel.onbufferedamountlow = () => {
                    channel.onbufferedamountlow = null;
                    resolve();
                };
            });
        }

        showP2PProgress(file.name, 0, file.size, 'sending', peerName);

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Send the stream chunk directly or split if > CHUNK_SIZE
            let offset = 0;
            while (offset < value.byteLength) {
                // Backpressure: wait for buffer to drain (event-driven, no polling)
                if (channel.bufferedAmount > BUFFER_HIGH) {
                    await waitForBufferDrain();
                }

                const end = Math.min(offset + CHUNK_SIZE, value.byteLength);
                // Use subarray (view) instead of slice (copy) to eliminate GC overhead
                channel.send(value.subarray(offset, end));
                sent += (end - offset);
                offset = end;
            }

            // Throttle progress UI updates to every 500KB (avoid DOM thrashing)
            if (sent - lastProgressUpdate > 512 * 1024) {
                showP2PProgress(file.name, Math.min(sent, file.size), file.size, 'sending', peerName);
                lastProgressUpdate = sent;
            }
        }

        // Send end marker
        channel.send(JSON.stringify({ type: 'file-end', name: file.name }));

        showP2PProgress(file.name, file.size, file.size, 'sent', peerName);
        showToast(`✅ Sent ${file.name} to ${peerName}`, 'success');
    }

    // All files sent
    channel.send(JSON.stringify({ type: 'transfer-complete' }));

    // Clear selected files
    selectedFiles = [];
    fileInput.value = '';
    renderPreview();
}

// --- Receiving files ---
function setupReceiveChannel(peerId, channel) {
    channel.binaryType = 'arraybuffer';

    let currentFile = null;
    let receivedChunks = [];
    let receivedSize = 0;

    channel.onmessage = (event) => {
        if (typeof event.data === 'string') {
            const msg = JSON.parse(event.data);

            if (msg.type === 'file-start') {
                currentFile = {
                    name: msg.name,
                    size: msg.size,
                    fileType: msg.fileType,
                    index: msg.index,
                    total: msg.total,
                };
                receivedChunks = [];
                receivedSize = 0;
                const senderName = peers[peerId] ? peers[peerId].name : 'device';
                showP2PProgress(msg.name, 0, msg.size, 'receiving', senderName);
            } else if (msg.type === 'file-end') {
                if (currentFile) {
                    // Assemble and download the file
                    const blob = new Blob(receivedChunks, { type: currentFile.fileType || 'application/octet-stream' });
                    downloadBlob(blob, currentFile.name);

                    const senderName = peers[peerId] ? peers[peerId].name : 'device';
                    showP2PProgress(currentFile.name, currentFile.size, currentFile.size, 'received', senderName);
                    showToast(`📥 Received ${currentFile.name}`, 'success');

                    currentFile = null;
                    receivedChunks = [];
                    receivedSize = 0;
                }
            } else if (msg.type === 'transfer-complete') {
                showToast('All files received! ✅', 'success');
            }
        } else {
            // Binary data — file chunk
            receivedChunks.push(event.data);
            receivedSize += event.data.byteLength;

            if (currentFile) {
                const senderName = peers[peerId] ? peers[peerId].name : 'device';
                showP2PProgress(currentFile.name, receivedSize, currentFile.size, 'receiving', senderName);
            }
        }
    };

    channel.onclose = () => {
        console.log(`[P2P] Receive channel closed from ${peerId}`);
    };
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Delay revoke to ensure download starts
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// --- Handle incoming WebRTC signaling ---
async function handleOffer(fromId, fromName, offer) {
    console.log(`[P2P] Received offer from ${fromName} (${fromId})`);

    const pc = createPeerConnection(fromId);

    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    ws.send(JSON.stringify({
        type: 'answer',
        target: fromId,
        data: answer,
    }));
}

async function handleAnswer(fromId, answer) {
    const peer = peers[fromId];
    if (peer && peer.connection) {
        await peer.connection.setRemoteDescription(new RTCSessionDescription(answer));
    }
}

async function handleIceCandidate(fromId, candidate) {
    const peer = peers[fromId];
    if (peer && peer.connection) {
        try {
            await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.error('[P2P] Error adding ICE candidate:', e);
        }
    }
}

// --- File request handling (optional confirmation) ---
function handleFileRequest(fromId, fromName, files) {
    // Auto-accept for now (can add confirmation modal later)
    ws.send(JSON.stringify({
        type: 'file-response',
        target: fromId,
        accepted: true,
    }));
}

function handleFileResponse(fromId, accepted) {
    if (accepted) {
        console.log(`[P2P] Transfer accepted by ${fromId}`);
    } else {
        showToast('Transfer was rejected', 'error');
    }
}

// --- UI: Peer List ---
function renderPeerList() {
    const peerList = document.getElementById('peerList');
    const peerSection = document.getElementById('peerSection');
    const peerCount = document.getElementById('peerCount');

    const peerIds = Object.keys(peers);

    if (peerIds.length === 0) {
        peerSection.style.display = 'none';
        return;
    }

    peerSection.style.display = 'block';
    peerCount.textContent = peerIds.length;
    peerList.innerHTML = '';

    peerIds.forEach(pid => {
        const peer = peers[pid];
        const item = document.createElement('div');
        item.className = 'peer-item';
        item.innerHTML = `
            <div class="peer-info">
                <span class="peer-avatar">${peer.name.split(' ')[0]}</span>
                <div>
                    <div class="peer-name">${peer.name}</div>
                    <div class="peer-status">Ready to receive</div>
                </div>
            </div>
            <button class="peer-send-btn" onclick="sendFilesToPeer('${pid}')">
                Send Files →
            </button>
        `;
        peerList.appendChild(item);
    });
}

// --- UI: P2P Transfer Progress ---
function showP2PProgress(filename, loaded, total, status, peerName) {
    let container = document.getElementById('p2pProgress');
    if (!container) {
        container = document.createElement('div');
        container.id = 'p2pProgress';
        container.className = 'upload-progress';
        document.querySelector('.container').insertBefore(
            container,
            document.getElementById('previewSection')
        );
    }
    container.style.display = 'block';

    let item = document.getElementById(`p2p-${filename}`);
    if (!item) {
        item = document.createElement('div');
        item.id = `p2p-${filename}`;
        item.className = 'progress-item';
        container.appendChild(item);
    }

    const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;
    const direction = status === 'sending' || status === 'sent' ? '↑' : '↓';
    const statusText = {
        'sending': `Sending to ${peerName}...`,
        'sent': `Sent to ${peerName} ✓`,
        'receiving': `Receiving from ${peerName}...`,
        'received': `Received from ${peerName} ✓`,
    }[status] || status;

    const badgeClass = (status === 'sent' || status === 'received') ? 'status-success' : 'status-uploading';

    item.innerHTML = `
        <div class="progress-name">
            <span>${direction} ${filename} (${formatFileSize(total)})</span>
            <span class="status-badge ${badgeClass}">${statusText}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span class="progress-speed">P2P Direct Transfer</span>
            <span class="progress-speed">${percent}%</span>
        </div>
        <div class="progress-bar">
            <div class="progress-fill" style="width:${percent}%;${percent === 100 ? 'animation:none;' : ''}"></div>
        </div>
    `;
}

// --- UI: Status indicator ---
function updateP2PStatus(state, text) {
    const indicator = document.getElementById('p2pIndicator');
    const statusText = document.getElementById('p2pStatusText');
    if (indicator && statusText) {
        statusText.textContent = text;
        if (state === 'online') {
            indicator.style.background = 'var(--success)';
            indicator.style.boxShadow = '0 0 8px rgba(16, 185, 129, 0.5)';
        } else {
            indicator.style.background = 'var(--text-dim)';
            indicator.style.boxShadow = 'none';
        }
    }
}

// --- Initialize ---
window.addEventListener('load', () => {
    connectSignaling();
});
