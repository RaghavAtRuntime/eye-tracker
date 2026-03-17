/**
 * Eye Tracker — Main Application Logic
 * Uses WebGazer.js for gaze detection with a calibration flow,
 * drag-and-drop image upload, and a real-time heatmap blip on canvas.
 */

/* ─── State ─────────────────────────────────────────────────── */
const AppState = Object.freeze({ CALIBRATION: 'calibration', UPLOAD: 'upload', TRACKING: 'tracking' });
let currentState = AppState.CALIBRATION;

/* ─── Calibration config ─────────────────────────────────────── */
// 9-point grid (relative to viewport), each clicked CLICKS_PER_DOT times
const CALIB_GRID = [
  [0.1, 0.1], [0.5, 0.1], [0.9, 0.1],
  [0.1, 0.5], [0.5, 0.5], [0.9, 0.5],
  [0.1, 0.9], [0.5, 0.9], [0.9, 0.9],
];
const CLICKS_PER_DOT = 5;
let calibDotIndex = 0;
let calibClickCount = 0;
let calibDotEl = null;

/* ─── Gaze smoothing (moving average) ───────────────────────── */
const SMOOTH_WINDOW = 10;
const gazeBuffer = [];
let smoothX = null;
let smoothY = null;

/* ─── Canvas / image tracking ───────────────────────────────── */
const BLIP_RADIUS = 40;
const BLIP_INNER_RADIUS = 6;
const HEATMAP_ALPHA = 0.06;   // alpha of each heatmap stamp
let imgRect = null;            // bounding rect of the uploaded image in the viewport
let animFrameId = null;
let heatmapCanvas = null;      // off-screen canvas for accumulated heatmap
let heatmapCtx = null;

/* ─── Video preview state ────────────────────────────────────── */
let videoVisible = false;

/* ─── DOM refs ───────────────────────────────────────────────── */
const sectionCalibration  = document.getElementById('section-calibration');
const sectionUpload       = document.getElementById('section-upload');
const sectionTracking     = document.getElementById('section-tracking');
const stateBadge          = document.getElementById('state-badge');
const startCalibBtn       = document.getElementById('start-calibration-btn');
const calibProgressWrap   = document.getElementById('calib-progress-wrap');
const calibProgressBar    = document.getElementById('calib-progress-bar');
const calibProgressLabel  = document.getElementById('calib-progress-label');
const dropZone            = document.getElementById('drop-zone');
const fileInput           = document.getElementById('file-input');
const uploadedImg         = document.getElementById('uploaded-img');
const workspace           = document.getElementById('workspace');
const gazeCanvas          = document.getElementById('gaze-canvas');
const gazeCtx             = gazeCanvas.getContext('2d');
const globalGazeCanvas    = document.getElementById('global-gaze-canvas');
const globalGazeCtx       = globalGazeCanvas.getContext('2d');
const clearBtn            = document.getElementById('clear-btn');
const videoToggleBtn      = document.getElementById('video-toggle-btn');
const videoToggleLabel    = document.getElementById('video-toggle-label');
const toast               = document.getElementById('toast');

/* ══════════════════════════════════════════════════════════════
   STATE TRANSITIONS
   ══════════════════════════════════════════════════════════════ */
function setState(newState) {
  currentState = newState;

  // Toggle section visibility
  [sectionCalibration, sectionUpload, sectionTracking].forEach(el => el.classList.remove('active'));

  const badgeStyles = {
    [AppState.CALIBRATION]: { text: 'Calibrating',  classes: 'bg-amber-900/40 text-amber-400' },
    [AppState.UPLOAD]:      { text: 'Ready',         classes: 'bg-slate-700 text-slate-400' },
    [AppState.TRACKING]:    { text: 'Tracking',      classes: 'bg-emerald-900/40 text-emerald-400' },
  };
  const badge = badgeStyles[newState];
  stateBadge.textContent = badge.text;
  stateBadge.className = `text-xs font-medium px-3 py-1 rounded-full ${badge.classes}`;

  switch (newState) {
    case AppState.CALIBRATION:
      sectionCalibration.classList.add('active');
      videoToggleBtn.classList.add('hidden');
      videoToggleBtn.classList.remove('flex');
      break;
    case AppState.UPLOAD:
      sectionUpload.classList.add('active');
      videoToggleBtn.classList.remove('hidden');
      videoToggleBtn.classList.add('flex');
      break;
    case AppState.TRACKING:
      sectionTracking.classList.add('active');
      videoToggleBtn.classList.remove('hidden');
      videoToggleBtn.classList.add('flex');
      break;
  }
}

/* ══════════════════════════════════════════════════════════════
   TOAST NOTIFICATION
   ══════════════════════════════════════════════════════════════ */
let toastTimer = null;
function showToast(msg, duration = 2500) {
  toast.textContent = msg;
  toast.style.opacity = '1';
  toast.style.pointerEvents = 'auto';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.pointerEvents = 'none';
  }, duration);
}

/* ══════════════════════════════════════════════════════════════
   CALIBRATION
   ══════════════════════════════════════════════════════════════ */
function startCalibration() {
  calibDotIndex = 0;
  calibClickCount = 0;
  calibProgressWrap.classList.remove('hidden');
  startCalibBtn.classList.add('hidden');
  updateCalibProgress();
  showCalibDot();
}

function showCalibDot() {
  // Remove existing dot if any
  if (calibDotEl) calibDotEl.remove();

  if (calibDotIndex >= CALIB_GRID.length) {
    finishCalibration();
    return;
  }

  const [rx, ry] = CALIB_GRID[calibDotIndex];
  const x = Math.round(rx * window.innerWidth);
  const y = Math.round(ry * window.innerHeight);

  calibDotEl = document.createElement('div');
  calibDotEl.className = 'calib-dot active';
  calibDotEl.style.left = `${x}px`;
  calibDotEl.style.top  = `${y}px`;
  document.body.appendChild(calibDotEl);

  calibDotEl.addEventListener('click', onCalibDotClick);
}

function onCalibDotClick(e) {
  e.stopPropagation();
  calibClickCount++;

  // Flash feedback
  calibDotEl.style.transform = 'translate(-50%,-50%) scale(0.8)';
  setTimeout(() => {
    if (calibDotEl) calibDotEl.style.transform = 'translate(-50%,-50%) scale(1)';
  }, 100);

  if (calibClickCount >= CLICKS_PER_DOT) {
    calibClickCount = 0;
    calibDotIndex++;
    updateCalibProgress();
    showCalibDot();
  }
}

function updateCalibProgress() {
  const total = CALIB_GRID.length;
  const done  = calibDotIndex;
  const pct   = Math.round((done / total) * 100);
  calibProgressBar.style.width  = `${pct}%`;
  calibProgressLabel.textContent = `${done} / ${total} dots`;
}

function finishCalibration() {
  if (calibDotEl) { calibDotEl.remove(); calibDotEl = null; }
  showToast('✅ Calibration complete! Now upload an image.', 3000);
  setState(AppState.UPLOAD);
}

/* ══════════════════════════════════════════════════════════════
   WEBGAZER INITIALISATION
   ══════════════════════════════════════════════════════════════ */
async function initWebGazer() {
  try {
    await webgazer
      .setRegression('ridge')
      .setTracker('TFFacemesh')
      .setGazeListener(onGaze)
      .begin();

    webgazer.showVideoPreview(false).showPredictionPoints(false);
    showToast('📷 Camera ready — follow the calibration dots.');
  } catch (err) {
    console.error('WebGazer init error:', err);
    showToast('⚠️ Camera access required for eye tracking.', 4000);
  }
}

/* ══════════════════════════════════════════════════════════════
   GAZE LISTENER + SMOOTHING
   ══════════════════════════════════════════════════════════════ */
function onGaze(data) {
  if (!data) return;

  gazeBuffer.push({ x: data.x, y: data.y });
  if (gazeBuffer.length > SMOOTH_WINDOW) gazeBuffer.shift();

  const sumX = gazeBuffer.reduce((s, p) => s + p.x, 0);
  const sumY = gazeBuffer.reduce((s, p) => s + p.y, 0);
  smoothX = sumX / gazeBuffer.length;
  smoothY = sumY / gazeBuffer.length;

  // Stamp heatmap if we're in tracking mode and have a loaded image
  if (currentState === AppState.TRACKING && heatmapCtx && imgRect) {
    stampHeatmap(smoothX, smoothY);
  }
}

/* ══════════════════════════════════════════════════════════════
   IMAGE UPLOAD
   ══════════════════════════════════════════════════════════════ */
function handleFile(file) {
  if (!file || !file.type.match(/image\/(jpeg|png)/)) {
    showToast('⚠️ Please upload a JPG or PNG image.');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    uploadedImg.onload = () => {
      setState(AppState.TRACKING);
      initTrackingCanvas();
      showToast('🎯 Tracking started — look around the image!');
    };
    uploadedImg.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// Drag-and-drop
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  handleFile(file);
});

// Browse input
fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));

/* ══════════════════════════════════════════════════════════════
   TRACKING CANVAS
   ══════════════════════════════════════════════════════════════ */
function initTrackingCanvas() {
  // Use a small delay to let the image render and layout settle
  requestAnimationFrame(() => {
    imgRect = uploadedImg.getBoundingClientRect();

    gazeCanvas.width  = imgRect.width;
    gazeCanvas.height = imgRect.height;
    gazeCanvas.style.width  = `${imgRect.width}px`;
    gazeCanvas.style.height = `${imgRect.height}px`;

    // Align canvas with the image inside the (centred) workspace
    const workspaceRect = workspace.getBoundingClientRect();
    gazeCanvas.style.left = `${imgRect.left - workspaceRect.left}px`;
    gazeCanvas.style.top  = `${imgRect.top  - workspaceRect.top}px`;

    // Off-screen heatmap accumulation canvas
    heatmapCanvas = document.createElement('canvas');
    heatmapCanvas.width  = imgRect.width;
    heatmapCanvas.height = imgRect.height;
    heatmapCtx = heatmapCanvas.getContext('2d');

    if (animFrameId) cancelAnimationFrame(animFrameId);
    drawLoop();
  });
}

function drawLoop() {
  gazeCtx.clearRect(0, 0, gazeCanvas.width, gazeCanvas.height);

  // Draw accumulated heatmap
  if (heatmapCanvas) {
    gazeCtx.drawImage(heatmapCanvas, 0, 0);
  }

  // Draw live gaze blip on top of the image
  if (imgRect && smoothX !== null && smoothY !== null) {
    const cx = smoothX - imgRect.left;
    const cy = smoothY - imgRect.top;
    // Only draw if the blip overlaps the canvas area
    if (cx > -BLIP_RADIUS && cx < gazeCanvas.width + BLIP_RADIUS &&
        cy > -BLIP_RADIUS && cy < gazeCanvas.height + BLIP_RADIUS) {
      drawBlipAt(gazeCtx, cx, cy);
    }
  }

  animFrameId = requestAnimationFrame(drawLoop);
}

/** Stamp a semi-transparent blip onto the persistent heatmap canvas */
function stampHeatmap(wx, wy) {
  if (!imgRect) return;
  const cx = wx - imgRect.left;
  const cy = wy - imgRect.top;
  if (cx < 0 || cx > heatmapCanvas.width || cy < 0 || cy > heatmapCanvas.height) return;

  const r = gazeBuffer.length > 0 ? BLIP_RADIUS * 1.2 : BLIP_RADIUS;
  const grad = heatmapCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0,   `rgba(52,211,153,${HEATMAP_ALPHA * 2})`);
  grad.addColorStop(0.4, `rgba(52,211,153,${HEATMAP_ALPHA})`);
  grad.addColorStop(1,   'rgba(52,211,153,0)');
  heatmapCtx.beginPath();
  heatmapCtx.arc(cx, cy, r, 0, Math.PI * 2);
  heatmapCtx.fillStyle = grad;
  heatmapCtx.fill();
}

/* ══════════════════════════════════════════════════════════════
   CLEAR / RESET
   ══════════════════════════════════════════════════════════════ */
function clearSession() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  // Clear canvases
  gazeCtx.clearRect(0, 0, gazeCanvas.width, gazeCanvas.height);
  if (heatmapCtx) heatmapCtx.clearRect(0, 0, heatmapCanvas.width, heatmapCanvas.height);
  heatmapCanvas = null;
  heatmapCtx = null;

  // Reset gaze smoothing
  gazeBuffer.length = 0;
  smoothX = null;
  smoothY = null;
  imgRect = null;

  // Reset image
  uploadedImg.src = '';
  fileInput.value = '';

  setState(AppState.UPLOAD);
  showToast('🔄 Cleared — drop a new image to continue.');
}

clearBtn.addEventListener('click', clearSession);

/* ══════════════════════════════════════════════════════════════
   VIDEO PREVIEW TOGGLE
   ══════════════════════════════════════════════════════════════ */
videoToggleBtn.addEventListener('click', () => {
  videoVisible = !videoVisible;
  webgazer.showVideoPreview(videoVisible);
  videoToggleLabel.textContent = videoVisible ? 'Hide Camera' : 'Show Camera';

  // Sync the video container visibility (WebGazer may create it dynamically)
  const vc = document.getElementById('webgazerVideoContainer');
  if (vc) {
    vc.style.display = videoVisible ? 'block' : 'none';
  }
});

/* ══════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
   ══════════════════════════════════════════════════════════════ */
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return; // don't capture inside inputs

  // R → recalibrate (re-run calibration)
  if (e.key === 'r' || e.key === 'R') {
    if (currentState === AppState.TRACKING || currentState === AppState.UPLOAD) {
      // Reset WebGazer regression
      webgazer.clearData();
      gazeBuffer.length = 0;
      smoothX = null; smoothY = null;

      // Go back to calibration UI
      calibDotIndex = 0;
      calibClickCount = 0;
      calibProgressBar.style.width = '0%';
      calibProgressLabel.textContent = '0 / 9 dots';
      calibProgressWrap.classList.add('hidden');
      startCalibBtn.classList.remove('hidden');

      setState(AppState.CALIBRATION);
      showToast('🔄 Recalibration started. Follow the green dots.', 3000);
    }
  }

  // C → clear heatmap (keep image)
  if (e.key === 'c' || e.key === 'C') {
    if (currentState === AppState.TRACKING && heatmapCtx) {
      heatmapCtx.clearRect(0, 0, heatmapCanvas.width, heatmapCanvas.height);
      showToast('🧹 Heatmap cleared.');
    }
  }
});

/* ══════════════════════════════════════════════════════════════
   RESIZE HANDLING
   ══════════════════════════════════════════════════════════════ */
window.addEventListener('resize', () => {
  if (currentState === AppState.TRACKING && uploadedImg.src) {
    // Re-snap canvas to image
    requestAnimationFrame(() => {
      imgRect = uploadedImg.getBoundingClientRect();
      gazeCanvas.width  = imgRect.width;
      gazeCanvas.height = imgRect.height;
      gazeCanvas.style.width  = `${imgRect.width}px`;
      gazeCanvas.style.height = `${imgRect.height}px`;

      // Re-align canvas with the (possibly re-centred) image
      const workspaceRect = workspace.getBoundingClientRect();
      gazeCanvas.style.left = `${imgRect.left - workspaceRect.left}px`;
      gazeCanvas.style.top  = `${imgRect.top  - workspaceRect.top}px`;

      if (heatmapCanvas) {
        const newHM = document.createElement('canvas');
        newHM.width  = imgRect.width;
        newHM.height = imgRect.height;
        const newCtx = newHM.getContext('2d');
        newCtx.drawImage(heatmapCanvas, 0, 0, imgRect.width, imgRect.height);
        heatmapCanvas = newHM;
        heatmapCtx = newCtx;
      }
    });
  }
});

/* ══════════════════════════════════════════════════════════════
   GLOBAL GAZE BLIP (visible in calibration and upload states)
   ══════════════════════════════════════════════════════════════ */

/** Draw an emerald radial-gradient blip centred on (cx, cy) using the given context. */
function drawBlipAt(ctx, cx, cy) {
  const blip = ctx.createRadialGradient(cx, cy, BLIP_INNER_RADIUS, cx, cy, BLIP_RADIUS);
  blip.addColorStop(0,   'rgba(52,211,153,0.85)');
  blip.addColorStop(0.3, 'rgba(52,211,153,0.45)');
  blip.addColorStop(1,   'rgba(52,211,153,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, BLIP_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = blip;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, BLIP_INNER_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fill();
}

function resizeGlobalGazeCanvas() {
  globalGazeCanvas.width  = window.innerWidth;
  globalGazeCanvas.height = window.innerHeight;
}

resizeGlobalGazeCanvas();
window.addEventListener('resize', resizeGlobalGazeCanvas);

function drawGlobalBlip() {
  globalGazeCtx.clearRect(0, 0, globalGazeCanvas.width, globalGazeCanvas.height);

  // In TRACKING state the blip is drawn directly on the image canvas; only
  // draw the global overlay during calibration and upload states.
  if (currentState !== AppState.TRACKING && smoothX !== null && smoothY !== null) {
    drawBlipAt(globalGazeCtx, smoothX, smoothY);
  }

  requestAnimationFrame(drawGlobalBlip);
}

drawGlobalBlip();

/* ══════════════════════════════════════════════════════════════
   BOOT
   ══════════════════════════════════════════════════════════════ */
startCalibBtn.addEventListener('click', startCalibration);

// Start WebGazer immediately so camera permission is requested early
initWebGazer();
