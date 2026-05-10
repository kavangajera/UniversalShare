/* ============================================================
   upload.js — File upload with streaming, progress, and speed
   ============================================================ */

uploadAllBtn.addEventListener('click', uploadFiles);

async function uploadFiles() {
    if (selectedFiles.length === 0) {
        showToast('No files selected', 'error');
        return;
    }

    uploadProgress.style.display = 'block';
    uploadProgress.innerHTML = '';

    for (let i = 0; i < selectedFiles.length; i++) {
        await uploadFile(selectedFiles[i], i);
    }

    selectedFiles = [];
    fileInput.value = '';
    renderPreview();
    loadUploadedFiles();
}

async function uploadFile(file, index) {
    // Use discovered servers (includes current + all found on network)
    const allServers = discoveredServers.length > 0 ? discoveredServers : [SERVER_URL];

    // Create progress item with speed display
    const progressItem = document.createElement('div');
    progressItem.className = 'progress-item';
    progressItem.innerHTML = `
        <div class="progress-name">
            <span>${file.name} (${formatFileSize(file.size)})</span>
            <span class="status-badge status-uploading">Uploading...</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span class="progress-speed" id="speed-${index}">Calculating...</span>
            <span class="progress-speed" id="percent-${index}">0%</span>
        </div>
        <div class="progress-bar">
            <div class="progress-fill" style="width: 0%"></div>
        </div>
    `;
    uploadProgress.appendChild(progressItem);

    const progressFill = progressItem.querySelector('.progress-fill');
    const statusBadge = progressItem.querySelector('.status-badge');
    const speedDisplay = document.getElementById(`speed-${index}`);
    const percentDisplay = document.getElementById(`percent-${index}`);

    // Track upload speed
    let lastLoaded = 0;
    let lastTime = Date.now();

    // Track progress for each server
    const serverProgresses = new Array(allServers.length).fill(0);

    // Upload to all discovered servers in parallel
    const uploadPromises = allServers.map((serverUrl, serverIndex) => {
        return new Promise((resolve) => {
            const formData = new FormData();
            formData.append('file', file);

            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    serverProgresses[serverIndex] = (e.loaded / e.total) * 100;

                    // Calculate average progress across all servers
                    const totalProgress = serverProgresses.reduce((sum, p) => sum + p, 0) / allServers.length;
                    progressFill.style.width = Math.min(totalProgress, 100) + '%';
                    percentDisplay.textContent = Math.round(totalProgress) + '%';

                    // Calculate speed (for the first server)
                    if (serverIndex === 0) {
                        const now = Date.now();
                        const elapsed = (now - lastTime) / 1000;
                        if (elapsed > 0.3) {
                            const bytesPerSec = (e.loaded - lastLoaded) / elapsed;
                            speedDisplay.textContent = formatFileSize(bytesPerSec) + '/s';
                            lastLoaded = e.loaded;
                            lastTime = now;
                        }
                    }
                }
            });

            xhr.addEventListener('load', () => {
                serverProgresses[serverIndex] = 100;
                const totalProgress = serverProgresses.reduce((sum, p) => sum + p, 0) / allServers.length;
                progressFill.style.width = Math.min(totalProgress, 100) + '%';

                if (xhr.status === 200) {
                    resolve({ server: serverUrl, success: true });
                } else {
                    resolve({ server: serverUrl, success: false, error: xhr.status });
                }
            });

            xhr.addEventListener('error', () => {
                serverProgresses[serverIndex] = 100;
                resolve({ server: serverUrl, success: false, error: 'Network error' });
            });

            xhr.open('POST', `${serverUrl}/upload`);
            xhr.send(formData);
        });
    });

    // Wait for all uploads to complete
    const results = await Promise.all(uploadPromises);

    // Count successes
    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;

    if (successCount === totalCount) {
        statusBadge.className = 'status-badge status-success';
        statusBadge.textContent = totalCount > 1
            ? `Uploaded to ${successCount} server(s) ✓`
            : 'Uploaded ✓';
        progressFill.style.width = '100%';
        progressFill.style.animation = 'none';
        percentDisplay.textContent = '100%';
        speedDisplay.textContent = 'Done';
        showToast(`${file.name} uploaded successfully!`, 'success');
    } else if (successCount > 0) {
        statusBadge.className = 'status-badge status-error';
        statusBadge.textContent = `Partial: ${successCount}/${totalCount} servers`;
        progressFill.style.width = '100%';
        showToast(`${file.name}: ${successCount}/${totalCount} servers`, 'error');
    } else {
        statusBadge.className = 'status-badge status-error';
        statusBadge.textContent = 'Failed';
        progressFill.style.width = '100%';
        showToast(`Failed to upload ${file.name}`, 'error');
    }

    return results;
}
