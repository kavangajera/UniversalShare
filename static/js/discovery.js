/* ============================================================
   discovery.js — Network discovery for LAN multi-server mode
   ============================================================ */

// Automatic server discovery - finds all UniversalShare servers on network
async function discoverServers(showStatus = true) {
    const discoveryStatusEl = document.getElementById('discoveryStatus');
    const discoveryStatusText = document.getElementById('discoveryStatusText');
    const discoveryIndicator = document.getElementById('discoveryIndicator');

    if (showStatus) {
        discoveryStatusEl.style.display = 'block';
        discoveryStatusText.textContent = 'Discovering servers...';
        discoveryIndicator.style.animation = 'pulse 1s ease-in-out infinite';
    }

    discoveredServers = [SERVER_URL]; // Always include current server

    try {
        // Get subnet from current URL
        const currentHost = window.location.hostname;

        let baseIP = null;
        if (currentHost.match(/^\d+\.\d+\.\d+\.\d+$/)) {
            baseIP = currentHost;
        } else {
            try {
                const response = await fetch(`${SERVER_URL}/discover`);
                const data = await response.json();
                baseIP = data.ip;

                // If this is a cloud deployment, skip discovery
                if (data.is_cloud) {
                    console.log('[Discovery] Cloud mode — skipping LAN discovery');
                    discoveryStatusEl.style.display = 'none';
                    return;
                }
            } catch (e) {
                console.log('[Discovery] Could not reach discover endpoint:', e);
            }
        }

        if (!baseIP || baseIP === 'localhost' || baseIP === '127.0.0.1') {
            if (showStatus) {
                discoveryStatusText.textContent = 'Local only (no network scan)';
                setTimeout(() => { discoveryStatusEl.style.display = 'none'; }, 2000);
            }
            return;
        }

        // Extract subnet
        const ipParts = baseIP.split('.');
        if (ipParts.length !== 4) return;
        const subnet = ipParts.slice(0, 3).join('.');
        const currentLastOctet = parseInt(ipParts[3]);

        console.log(`[Discovery] Scanning ${subnet}.x ...`);
        if (showStatus) {
            discoveryStatusText.textContent = `Scanning ${subnet}.x...`;
        }

        // Scan common IP ranges
        const scanIPs = [];
        for (let i = 1; i <= 254; i++) {
            if (i !== currentLastOctet) scanIPs.push(i);
        }

        const scanPromises = [];

        scanIPs.forEach((lastOctet) => {
            ['http', 'https'].forEach((protocol) => {
                const testUrl = `${protocol}://${subnet}.${lastOctet}:8000`;
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 1500);

                scanPromises.push(
                    fetch(`${testUrl}/discover`, {
                        method: 'GET',
                        signal: controller.signal,
                        mode: 'cors'
                    })
                    .then(response => {
                        clearTimeout(timeoutId);
                        return response.ok ? response.json() : null;
                    })
                    .then(data => {
                        if (data && data.server_url && !discoveredServers.includes(data.server_url)) {
                            discoveredServers.push(data.server_url);
                            console.log(`[Discovery] ✅ Found: ${data.server_url}`);
                            if (showStatus) {
                                discoveryStatusText.textContent = `Found ${discoveredServers.length} server(s)!`;
                                discoveryIndicator.style.background = 'var(--success)';
                            }
                        }
                    })
                    .catch(() => { clearTimeout(timeoutId); })
                );
            });
        });

        await Promise.allSettled(scanPromises);

        if (showStatus) {
            if (discoveredServers.length > 1) {
                discoveryStatusText.textContent = `Found ${discoveredServers.length} servers!`;
                discoveryIndicator.style.background = 'var(--success)';
                setTimeout(() => { discoveryStatusEl.style.display = 'none'; }, 3000);
                showToast(`${discoveredServers.length} servers found — uploads sync to all! 📡`, 'success');
            } else {
                discoveryStatusText.textContent = 'Only current server found';
                discoveryIndicator.style.background = 'var(--text-dim)';
                setTimeout(() => {
                    discoveryStatusText.textContent = 'Add server IP manually';
                    document.getElementById('manualIPEntry').style.display = 'flex';
                }, 2000);
            }
        }
    } catch (error) {
        console.error('[Discovery] Error:', error);
        if (showStatus) {
            discoveryStatusEl.style.display = 'none';
        }
    }
}

// Test a specific server IP manually
async function testServer(serverIP) {
    for (const protocol of ['http', 'https']) {
        try {
            const testUrl = `${protocol}://${serverIP}:8000`;
            const response = await fetch(`${testUrl}/discover`, {
                method: 'GET',
                signal: AbortSignal.timeout(2000),
                mode: 'cors'
            });

            if (response.ok) {
                const data = await response.json();
                if (data && data.server_url && !discoveredServers.includes(data.server_url)) {
                    discoveredServers.push(data.server_url);
                    showToast(`Added server: ${data.server_url}`, 'success');
                    return true;
                }
            }
        } catch (err) {
            // Silent — try next protocol
        }
    }
    return false;
}

// Manual refresh
document.getElementById('refreshDiscoveryBtn').addEventListener('click', () => {
    discoverServers(true);
});

// Manual IP entry
const manualIPInput = document.getElementById('manualIPInput');
const addManualIPBtn = document.getElementById('addManualIPBtn');

async function addManualIP() {
    const ip = manualIPInput.value.trim();
    if (!ip) { showToast('Please enter an IP address', 'error'); return; }
    if (!ip.match(/^\d+\.\d+\.\d+\.\d+$/)) { showToast('Invalid IP format', 'error'); return; }

    const discoveryStatusText = document.getElementById('discoveryStatusText');
    discoveryStatusText.textContent = `Testing ${ip}...`;

    const success = await testServer(ip);
    if (success) {
        manualIPInput.value = '';
        document.getElementById('manualIPEntry').style.display = 'none';
        discoveryStatusText.textContent = `${discoveredServers.length} server(s) connected!`;
        document.getElementById('discoveryIndicator').style.background = 'var(--success)';
    } else {
        showToast(`Cannot reach ${ip}:8000 — check server and firewall`, 'error');
    }
}

addManualIPBtn.addEventListener('click', addManualIP);
manualIPInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') addManualIP(); });

// Expose for console usage
window.testServer = testServer;

// Auto-discover on page load
window.addEventListener('load', () => {
    setTimeout(() => discoverServers(true), 1500);
});
