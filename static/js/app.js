/* ============================================================
   app.js — Core UI: DOM setup, toasts, file icons, utilities
   ============================================================ */

// --- DOM Elements ---
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const previewSection = document.getElementById('previewSection');
const fileGrid = document.getElementById('fileGrid');
const uploadAllBtn = document.getElementById('uploadAllBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const uploadProgress = document.getElementById('uploadProgress');
const uploadedFiles = document.getElementById('uploadedFiles');
const fileList = document.getElementById('fileList');
const emptyState = document.getElementById('emptyState');

// --- Global State ---
let selectedFiles = [];
let uploadedFilesList = [];
let discoveredServers = [];
const SERVER_URL = window.location.origin;

// --- File Type Icons ---
const fileIcons = {
    image: '🖼️', video: '🎬', audio: '🎵', pdf: '📄',
    document: '📝', archive: '📦', code: '💻', default: '📎'
};

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) return fileIcons.image;
    if (['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv'].includes(ext)) return fileIcons.video;
    if (['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'wma'].includes(ext)) return fileIcons.audio;
    if (ext === 'pdf') return fileIcons.pdf;
    if (['doc', 'docx', 'txt', 'rtf', 'odt', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return fileIcons.document;
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'dmg', 'iso'].includes(ext)) return fileIcons.archive;
    if (['js', 'ts', 'py', 'java', 'cpp', 'c', 'h', 'html', 'css', 'json', 'xml', 'yaml', 'yml', 'md', 'sh', 'rb', 'go', 'rs', 'swift'].includes(ext)) return fileIcons.code;
    return fileIcons.default;
}

// --- Utilities ---
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        toast.style.transition = '0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- Share Panel (QR Code) ---
const shareToggleBtn = document.getElementById('shareToggleBtn');
const shareDropdown = document.getElementById('shareDropdown');
const shareQR = document.getElementById('shareQR');
const shareUrlInput = document.getElementById('shareUrlInput');
const copyUrlBtn = document.getElementById('copyUrlBtn');

let shareOpen = false;

// Fetch server URL and populate share panel
async function initSharePanel() {
    try {
        const response = await fetch(`${SERVER_URL}/discover`);
        const data = await response.json();
        const shareUrl = data.server_url || window.location.href;

        shareUrlInput.value = shareUrl;

        // Fetch QR code SVG from server
        // We generate the QR client-side using a simple approach
        generateShareQR(shareUrl);
    } catch (e) {
        shareUrlInput.value = window.location.href;
        generateShareQR(window.location.href);
    }
}

function generateShareQR(url) {
    // Use the QR API endpoint or a lightweight client-side approach
    // For now, we use a public QR code API as fallback
    shareQR.innerHTML = `
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}&bgcolor=ffffff&color=000000"
             alt="QR Code" style="width: 200px; height: 200px; border-radius: 8px;">
    `;
}

shareToggleBtn.addEventListener('click', () => {
    shareOpen = !shareOpen;
    shareDropdown.style.display = shareOpen ? 'block' : 'none';
});

copyUrlBtn.addEventListener('click', () => {
    shareUrlInput.select();
    navigator.clipboard.writeText(shareUrlInput.value).then(() => {
        showToast('URL copied to clipboard! 📋', 'success');
        copyUrlBtn.textContent = '✅';
        setTimeout(() => { copyUrlBtn.textContent = '📋'; }, 2000);
    }).catch(() => {
        // Fallback for older browsers
        document.execCommand('copy');
        showToast('URL copied!', 'success');
    });
});

// Close share dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (shareOpen && !e.target.closest('.share-panel')) {
        shareOpen = false;
        shareDropdown.style.display = 'none';
    }
});

// --- Upload Zone Events ---
uploadZone.addEventListener('click', () => fileInput.click());

uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
});

function handleFiles(files) {
    selectedFiles = [...selectedFiles, ...Array.from(files)];
    renderPreview();
}

// --- File Preview ---
function renderPreview() {
    if (selectedFiles.length === 0) {
        previewSection.style.display = 'none';
        return;
    }

    previewSection.style.display = 'block';
    fileGrid.innerHTML = '';

    selectedFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'file-item';

        const preview = document.createElement('div');
        preview.className = 'file-preview';

        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = document.createElement('img');
                img.src = e.target.result;
                preview.innerHTML = '';
                preview.appendChild(img);
            };
            reader.readAsDataURL(file);
        } else {
            preview.textContent = getFileIcon(file.name);
        }

        const name = document.createElement('div');
        name.className = 'file-name';
        name.textContent = file.name;

        const size = document.createElement('div');
        size.className = 'file-size';
        size.textContent = formatFileSize(file.size);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => {
            selectedFiles.splice(index, 1);
            renderPreview();
        });

        item.appendChild(preview);
        item.appendChild(name);
        item.appendChild(size);
        item.appendChild(removeBtn);
        fileGrid.appendChild(item);
    });
}

clearAllBtn.addEventListener('click', () => {
    selectedFiles = [];
    fileInput.value = '';
    renderPreview();
});

// --- Load & Display Uploaded Files ---
async function loadUploadedFiles() {
    try {
        const response = await fetch(`${SERVER_URL}/files`);
        const data = await response.json();
        const files = data.files || [];

        if (files.length === 0) {
            uploadedFiles.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        uploadedFiles.style.display = 'block';
        fileList.innerHTML = '';

        files.forEach(file => {
            const li = document.createElement('li');
            li.className = 'file-list-item';
            li.innerHTML = `
                <div class="file-info">
                    <span class="file-icon">${getFileIcon(file.name)}</span>
                    <div class="file-details">
                        <div class="file-details-name">${file.name}</div>
                        <div class="file-details-size">${file.size_formatted}</div>
                    </div>
                </div>
                <div class="file-actions">
                    <button class="action-btn download-btn" onclick="window.location.href='${SERVER_URL}/download/${encodeURIComponent(file.name)}'">Download</button>
                    <button class="action-btn delete-btn" onclick="deleteFile('${file.name}')">Delete</button>
                </div>
            `;
            fileList.appendChild(li);
        });
    } catch (error) {
        console.error('Error loading files:', error);
    }
}

async function deleteFile(filename) {
    try {
        const response = await fetch(`${SERVER_URL}/files/${encodeURIComponent(filename)}`, {
            method: 'DELETE',
        });
        if (response.ok) {
            showToast(`Deleted '${filename}'`, 'success');
            loadUploadedFiles();
        } else {
            showToast('Failed to delete file', 'error');
        }
    } catch (error) {
        showToast('Error deleting file', 'error');
    }
}

// --- Initialization ---
window.addEventListener('load', () => {
    loadUploadedFiles();
    initSharePanel();
});
