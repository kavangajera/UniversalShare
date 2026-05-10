/* ============================================================
   shake.js — Shake-to-upload for mobile devices
   ============================================================ */

let shakeDetectionEnabled = false;
let lastShakeTime = 0;
const SHAKE_THRESHOLD = 15;
const SHAKE_COOLDOWN = 1000;

const shakeDetector = document.getElementById('shakeDetector');
const shakeToggleBtn = document.getElementById('shakeToggleBtn');
const testShakeBtn = document.getElementById('testShakeBtn');
const shakeStatusText = document.getElementById('shakeStatusText');

function requestMotionPermission() {
    if (!window.isSecureContext) {
        showToast('Shake needs HTTPS. Open secure URL.', 'error');
        return;
    }

    // iOS 13+ explicit permission path
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    enableShake();
                } else {
                    showToast('Motion permission denied', 'error');
                }
            })
            .catch(error => {
                showToast('Error requesting motion permission', 'error');
            });
    } else {
        // Android and others
        enableShake();
    }
}

function enableShake() {
    window.addEventListener('devicemotion', handleShake, { passive: true });
    shakeDetectionEnabled = true;
    shakeDetector.classList.add('active');
    shakeStatusText.textContent = 'Shake enabled ✓';
    showToast('Shake detection enabled! 📳', 'success');
}

function handleShake(event) {
    const acc = event.acceleration || event.accelerationIncludingGravity || { x: 0, y: 0, z: 0 };
    const x = acc.x || 0;
    const y = acc.y || 0;
    const z = acc.z || 0;

    const magnitude = Math.sqrt(x * x + y * y + z * z);
    const currentTime = Date.now();

    if (magnitude > SHAKE_THRESHOLD && currentTime - lastShakeTime > SHAKE_COOLDOWN) {
        lastShakeTime = currentTime;
        triggerShakeUpload();
    }
}

function triggerShakeUpload() {
    if (selectedFiles.length === 0) {
        showToast('No files selected to upload', 'error');
        return;
    }
    showToast('Shake detected! Uploading files... 🚀', 'success');
    uploadFiles();
}

shakeToggleBtn.addEventListener('click', () => {
    if (shakeDetectionEnabled) {
        window.removeEventListener('devicemotion', handleShake);
        shakeDetectionEnabled = false;
        shakeDetector.classList.remove('active');
        shakeStatusText.textContent = 'Shake disabled';
        showToast('Shake detection disabled', 'success');
    } else {
        requestMotionPermission();
    }
});

testShakeBtn.addEventListener('click', () => {
    triggerShakeUpload();
});

// Auto-enable on mobile
window.addEventListener('load', () => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile && window.isSecureContext) {
        setTimeout(() => requestMotionPermission(), 600);
    } else {
        testShakeBtn.style.display = 'inline-block';
        shakeStatusText.textContent = 'Desktop mode';
        if (!window.isSecureContext) {
            shakeStatusText.textContent = 'Needs HTTPS';
        }
    }
});
