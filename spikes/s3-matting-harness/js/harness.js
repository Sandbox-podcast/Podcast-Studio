import { createBackend } from "./backends.js";
import { LiveKitPublisher } from "./livekit-publish.js";
import {
  disposeSyntheticMedia,
  getSyntheticPublishTracks,
  isSyntheticPreviewRunning,
  startSyntheticPreview,
  stopSyntheticPreview,
} from "./synthetic-media.js";

const resolutionEl = document.getElementById("resolution");
const cameraSelectEl = document.getElementById("cameraSelect");
const backendEl = document.getElementById("backend");
const btnCamera = document.getElementById("btnCamera");
const btnLoop = document.getElementById("btnLoop");
const btnStop = document.getElementById("btnStop");
const btnExport = document.getElementById("btnExport");
const fallbackEl = document.getElementById("fallback");
const rawVideo = document.getElementById("rawVideo");
const previewCanvas = document.getElementById("previewCanvas");
const overlayEl = document.getElementById("overlay");
const statusEl = document.getElementById("status");
const stageEl = document.getElementById("stage");
const lkEnableEl = document.getElementById("lkEnable");
const lkUrlEl = document.getElementById("lkUrl");
const lkRoomEl = document.getElementById("lkRoom");
const lkIdentityEl = document.getElementById("lkIdentity");
const lkTokenUrlEl = document.getElementById("lkTokenUrl");
const lkPastedTokenEl = document.getElementById("lkPastedToken");
const lkConnectEl = document.getElementById("lkConnect");
const lkDisconnectEl = document.getElementById("lkDisconnect");
const lkStatusEl = document.getElementById("lkStatus");
const lkSyntheticEl = document.getElementById("lkSynthetic");

const outCtx = previewCanvas.getContext("2d", { alpha: false });
if (!outCtx) {
  throw new Error("2D context unavailable");
}

/** @type {MediaStream | null} */
let stream = null;
/** @type {import('./backends.js').MattingBackend | null} */
let backend = null;
let rafId = 0;
let loopRunning = false;

const frameTimes = [];
const MAX_SAMPLES = 600;
const exportSamples = [];

/** @type {MediaStream | null} */
let canvasCaptureStream = null;

const liveKit = new LiveKitPublisher((phase, detail) => {
  const extra = detail ? ` — ${detail}` : "";
  lkStatusEl.textContent = `LiveKit: ${phase}${extra}`;
});

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("err", isError);
}

function resolutionConstraints() {
  const mode = resolutionEl.value;
  if (mode === "1080") {
    return {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30, max: 30 },
    };
  }
  return {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 30 },
  };
}

function targetCanvasSize() {
  if (resolutionEl.value === "1080") {
    return { width: 1920, height: 1080 };
  }
  return { width: 1280, height: 720 };
}

function syncCanvasSize() {
  const preset = targetCanvasSize();
  const w = rawVideo.videoWidth || preset.width;
  const h = rawVideo.videoHeight || preset.height;
  if (previewCanvas.width !== w || previewCanvas.height !== h) {
    previewCanvas.width = w;
    previewCanvas.height = h;
  }
}

function ensureSyntheticPreviewForPublish() {
  const { width, height } = targetCanvasSize();
  startSyntheticPreview({ canvas: previewCanvas, ctx: outCtx, width, height });
}

function percentile(sorted, p) {
  if (sorted.length === 0) {
    return 0;
  }
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * sorted.length))
  );
  return sorted[idx];
}

function updateOverlay(fps, frameMs) {
  const sorted = [...frameTimes].sort((a, b) => a - b);
  const p5Frame = percentile(sorted, 5);
  const fpsP5 = p5Frame > 0 ? 1000 / p5Frame : 0;
  const backendId = backend?.id ?? "—";
  const fb = fallbackEl.checked ? "ON (raw)" : "off";
  overlayEl.textContent =
    `backend: ${backendId}\n` +
    `fallback: ${fb}\n` +
    `FPS avg: ${fps.toFixed(1)}\n` +
    `FPS p5: ${fpsP5.toFixed(1)}\n` +
    `frame ms: ${frameMs.toFixed(2)}\n` +
    `res: ${previewCanvas.width}×${previewCanvas.height}\n` +
    `samples: ${frameTimes.length}`;
}

async function listCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videos = devices.filter((d) => d.kind === "videoinput");
  cameraSelectEl.innerHTML = '<option value="">(default)</option>';
  for (const d of videos) {
    const opt = document.createElement("option");
    opt.value = d.deviceId;
    opt.textContent = d.label || `Camera ${d.deviceId.slice(0, 8)}`;
    cameraSelectEl.appendChild(opt);
  }
}

function resetCanvasCapture() {
  if (canvasCaptureStream) {
    for (const t of canvasCaptureStream.getTracks()) {
      t.stop();
    }
    canvasCaptureStream = null;
  }
}

function useSyntheticPublish() {
  return lkSyntheticEl.checked;
}

function getPublishTracks() {
  if (useSyntheticPublish()) {
    ensureSyntheticPreviewForPublish();
    return getSyntheticPublishTracks();
  }
  const videoTrack = getCameraPublishVideoTrack();
  return { videoTrack, audioTrack: null };
}

function getCameraPublishVideoTrack() {
  if (!stream) {
    return null;
  }
  const useRaw = fallbackEl.checked || !loopRunning;
  if (useRaw) {
    return stream.getVideoTracks()[0] ?? null;
  }
  if (!canvasCaptureStream) {
    canvasCaptureStream = previewCanvas.captureStream(30);
  }
  return canvasCaptureStream.getVideoTracks()[0] ?? null;
}

function setLiveKitFieldsEnabled(enabled) {
  for (const el of [
    lkUrlEl,
    lkRoomEl,
    lkIdentityEl,
    lkTokenUrlEl,
    lkPastedTokenEl,
    lkConnectEl,
    lkSyntheticEl,
  ]) {
    el.disabled = !enabled;
  }
  lkDisconnectEl.disabled = !enabled || !liveKit.connected;
}

function setLiveKitStatus(text) {
  lkStatusEl.textContent = text;
}

async function stopAll() {
  if (liveKit.connected) {
    await liveKit.disconnect();
    lkDisconnectEl.disabled = true;
    lkConnectEl.disabled = !lkEnableEl.checked;
  }
  if (!liveKit.connected && isSyntheticPreviewRunning() && useSyntheticPublish()) {
    stopSyntheticPreview();
    disposeSyntheticMedia();
  }
  loopRunning = false;
  resetCanvasCapture();
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  backend?.dispose?.();
  backend = null;
  if (stream) {
    for (const t of stream.getTracks()) {
      t.stop();
    }
    stream = null;
  }
  rawVideo.srcObject = null;
  btnLoop.disabled = true;
  btnStop.disabled = true;
  btnExport.disabled = exportSamples.length === 0;
}

async function startCamera() {
  await stopAll();
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("getUserMedia non disponible.", true);
    return;
  }
  const deviceId = cameraSelectEl.value;
  const videoConstraints = {
    ...resolutionConstraints(),
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: false,
    });
    rawVideo.srcObject = stream;
    await rawVideo.play();
    await listCameras();
    syncCanvasSize();
    btnLoop.disabled = false;
    setStatus("Caméra active. Choisir backend puis Start matting loop.");
  } catch (e) {
    setStatus(`Caméra: ${e instanceof Error ? e.message : String(e)}`, true);
  }
}

async function ensureBackend() {
  const id = backendEl.value;
  if (backend?.id === id) {
    return backend;
  }
  backend?.dispose?.();
  backend = createBackend(id);
  if (backend.init) {
    setStatus(`Initialisation backend ${id}…`);
    try {
      await backend.init();
      setStatus(`Backend ${id} prêt.`);
    } catch (e) {
      setStatus(
        `Backend ${id} échec init: ${e instanceof Error ? e.message : String(e)} — essayer Mock.`,
        true
      );
      backend = createBackend("mock");
    }
  }
  return backend;
}

function pushSample(fps, frameMs) {
  const sample = {
    t: new Date().toISOString(),
    backend: backend?.id,
    fallback: fallbackEl.checked,
    width: previewCanvas.width,
    height: previewCanvas.height,
    fpsAvg: Math.round(fps * 10) / 10,
    frameMs: Math.round(frameMs * 100) / 100,
  };
  exportSamples.push(sample);
  if (exportSamples.length > MAX_SAMPLES) {
    exportSamples.shift();
  }
  btnExport.disabled = exportSamples.length === 0;
}

function mattingLoop() {
  if (!loopRunning) {
    return;
  }
  rafId = requestAnimationFrame(mattingLoop);
  const t0 = performance.now();
  syncCanvasSize();
  const w = previewCanvas.width;
  const h = previewCanvas.height;
  const fb = fallbackEl.checked;
  stageEl.classList.toggle("fallback-on", fb);

  const active = backend;
  if (!active) {
    return;
  }
  active
    .processFrame({
      video: rawVideo,
      outCanvas: previewCanvas,
      outCtx,
      width: w,
      height: h,
      fallbackRaw: fb,
    })
    .catch((err) => {
      setStatus(`Frame error: ${err instanceof Error ? err.message : String(err)}`, true);
    })
    .finally(() => {
      const dt = performance.now() - t0;
      frameTimes.push(dt);
      if (frameTimes.length > MAX_SAMPLES) {
        frameTimes.shift();
      }
      const avg =
        frameTimes.reduce((a, b) => a + b, 0) / Math.max(1, frameTimes.length);
      const fps = avg > 0 ? 1000 / avg : 0;
      updateOverlay(fps, dt);
      if (frameTimes.length % 30 === 0) {
        pushSample(fps, dt);
      }
    });
}

async function startLoop() {
  if (!stream) {
    return;
  }
  await ensureBackend();
  frameTimes.length = 0;
  resetCanvasCapture();
  loopRunning = true;
  btnStop.disabled = false;
  btnLoop.disabled = true;
  mattingLoop();
  setStatus("Boucle matting en cours (overlay FPS).");
  if (liveKit.connected && !useSyntheticPublish()) {
    const tracks = getPublishTracks();
    if (tracks.videoTrack) {
      try {
        await liveKit.publishTracks(tracks);
      } catch (e) {
        setLiveKitStatus(
          `LiveKit: republish failed — ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }
}

function stopLoop() {
  loopRunning = false;
  resetCanvasCapture();
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  btnLoop.disabled = !!stream;
  btnStop.disabled = true;
  setStatus("Boucle arrêtée.");
  if (liveKit.connected && !useSyntheticPublish()) {
    const tracks = getPublishTracks();
    if (tracks.videoTrack) {
      void liveKit.publishTracks(tracks).catch(() => {
        setLiveKitStatus("LiveKit: republish raw failed");
      });
    }
  }
}

function exportJson() {
  const sorted = [...frameTimes].sort((a, b) => a - b);
  const avg =
    frameTimes.length > 0
      ? frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length
      : 0;
  const payload = {
    harness: "s3-matting-harness",
    note: "Spike PREP — paste summary into spikes/S3-matting.md; not official pass/fail",
    exportedAt: new Date().toISOString(),
    resolutionPreset: resolutionEl.value === "1080" ? "1080p" : "720p",
    backend: backend?.id,
    fallbackLast: fallbackEl.checked,
    canvas: { width: previewCanvas.width, height: previewCanvas.height },
    summary: {
      fpsAvg: avg > 0 ? Math.round((1000 / avg) * 10) / 10 : null,
      frameMsAvg: Math.round(avg * 100) / 100,
      frameMsP5: Math.round(percentile(sorted, 5) * 100) / 100,
      sampleCount: frameTimes.length,
    },
    samples: exportSamples,
    userAgent: navigator.userAgent,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `s3-matting-metrics-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

fallbackEl.addEventListener("change", () => {
  stageEl.classList.toggle("fallback-on", fallbackEl.checked);
  if (liveKit.connected && !useSyntheticPublish()) {
    const tracks = getPublishTracks();
    if (tracks.videoTrack) {
      void liveKit.publishTracks(tracks).catch(() => {
        setLiveKitStatus("LiveKit: track switch failed");
      });
    }
  }
});

lkSyntheticEl.addEventListener("change", () => {
  if (!lkEnableEl.checked) {
    return;
  }
  if (useSyntheticPublish()) {
    ensureSyntheticPreviewForPublish();
  } else if (isSyntheticPreviewRunning() && !stream) {
    stopSyntheticPreview();
    disposeSyntheticMedia();
  }
  if (liveKit.connected) {
    void liveKit.publishTracks(getPublishTracks()).catch((e) => {
      setLiveKitStatus(
        `LiveKit: switch failed — ${e instanceof Error ? e.message : String(e)}`,
      );
    });
  }
});

lkEnableEl.addEventListener("change", () => {
  const on = lkEnableEl.checked;
  setLiveKitFieldsEnabled(on);
  if (!on) {
    void liveKit.disconnect().then(() => {
      setLiveKitStatus("LiveKit: désactivé");
      lkDisconnectEl.disabled = true;
    });
  }
});

lkConnectEl.addEventListener("click", () => {
  void (async () => {
    lkConnectEl.disabled = true;
    try {
      const tracks = getPublishTracks();
      await liveKit.connect(
        {
          livekitUrl: lkUrlEl.value,
          room: lkRoomEl.value.trim() || "s1-lab",
          identity: lkIdentityEl.value.trim() || "vision-s3",
          tokenUrl: lkTokenUrlEl.value.trim() || "http://127.0.0.1:5190/api/token",
          pastedToken: lkPastedTokenEl.value,
        },
        tracks,
      );
      lkDisconnectEl.disabled = false;
      lkConnectEl.disabled = true;
    } catch (e) {
      setLiveKitStatus(
        `LiveKit: error — ${e instanceof Error ? e.message : String(e)}`,
      );
      lkConnectEl.disabled = false;
    }
  })();
});

lkDisconnectEl.addEventListener("click", () => {
  void liveKit.disconnect().then(() => {
    lkDisconnectEl.disabled = true;
    lkConnectEl.disabled = !lkEnableEl.checked;
    setLiveKitStatus("LiveKit: idle");
    if (useSyntheticPublish() && !stream && !loopRunning) {
      stopSyntheticPreview();
      disposeSyntheticMedia();
    }
  });
});

setLiveKitFieldsEnabled(false);

btnCamera.addEventListener("click", () => {
  void startCamera();
});
btnLoop.addEventListener("click", () => {
  void startLoop();
});
btnStop.addEventListener("click", stopLoop);
btnExport.addEventListener("click", exportJson);

resolutionEl.addEventListener("change", () => {
  if (stream) {
    setStatus("Résolution changée — redémarrer la caméra.");
  }
});

backendEl.addEventListener("change", () => {
  if (backend && backend.id !== backendEl.value) {
    backend.dispose?.();
    backend = null;
    if (loopRunning) {
      void ensureBackend();
    }
  }
});

if (navigator.mediaDevices?.addEventListener) {
  navigator.mediaDevices.addEventListener("devicechange", () => {
    void listCameras();
  });
}

void listCameras().catch(() => {
  setStatus("Énumération caméras après permission.", false);
});
