import { createBackend } from "./backends.js?v=s4-matfix8";
import { LiveKitPublisher } from "./livekit-publish.js";
import {
  disposeSyntheticMedia,
  getSyntheticPublishTracks,
  isSyntheticPreviewRunning,
  startSyntheticPreview,
  stopSyntheticPreview,
} from "./synthetic-media.js";
import { getMatteProfile } from "./backends.js?v=s4-matte9-ab";

// A/B profile from URL (?profile=v7|v8|v8b)
try {
  const _p = new URLSearchParams(location.search).get("profile");
  if (_p) window.__MATTE_PROFILE = _p.toLowerCase();
} catch (_) {}


const resolutionEl = document.getElementById("resolution");
const cameraSelectEl = document.getElementById("cameraSelect");
const backendEl = document.getElementById("backend");
const btnCamera = document.getElementById("btnCamera");
const btnSmokeVideo = document.getElementById("btnSmokeVideo");
const smokeVideo = document.getElementById("smokeVideo");
const smokeStatusEl = document.getElementById("smokeStatus");
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

const outCtx = previewCanvas.getContext("2d", { alpha: true });
if (!outCtx) {
  throw new Error("2D context unavailable");
}

/** Offscreen canvas for S4 matted record — transparent bg (S2 compose). Preview stays opaque for LiveKit. */
const recordCanvas = document.createElement("canvas");
const recordCtx = recordCanvas.getContext("2d", { alpha: true });
if (!recordCtx) {
  throw new Error("record 2d context unavailable");
}
let recordCaptureStream = null;


/** @type {MediaStream | null} */
let stream = null;
/** Night loopback: WebM/file as fake cam (captureStream from <video>). */
let fileCamActive = false;
/** @type {string | null} */
let fileCamObjectUrl = null;
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

function humanizeGumError(e, deviceLabel) {
  const name = e?.name || "Error";
  const message = e instanceof Error ? e.message : String(e);
  const dev = deviceLabel ? ` [${deviceLabel}]` : "";
  if (name === "NotReadableError" || /Could not start video source/i.test(message)) {
    return `Caméra déjà utilisée${dev} — ferme Teams / autre onglet / Caméra Windows (${name}: ${message})`;
  }
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return `Permission refusée${dev} — autorise Caméra+Micro dans le cadenas Edge (${name}: ${message})`;
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return `Aucune caméra trouvée${dev} (${name}: ${message})`;
  }
  if (name === "OverconstrainedError") {
    return `Contraintes caméra impossibles${dev} — essaie 720p (${name}: ${message})`;
  }
  if (name === "NotSupportedError") {
    return `getUserMedia non supporté ici${dev} (${name}: ${message})`;
  }
  return `Caméra: ${name}: ${message}${dev}`;
}

function paintStagePlaceholder(label) {
  const w = previewCanvas.width || 1280;
  const h = previewCanvas.height || 720;
  outCtx.fillStyle = "#0a0a0c";
  outCtx.fillRect(0, 0, w, h);
  outCtx.strokeStyle = "#5a6578";
  outCtx.lineWidth = 2;
  outCtx.strokeRect(4, 4, w - 8, h - 8);
  outCtx.fillStyle = "#9ab";
  outCtx.font = "28px system-ui";
  outCtx.fillText(label || "Preview — démarre la caméra", 24, h / 2);
}

function setSmokeStatus(msg, isError = false) {
  if (smokeStatusEl) {
    smokeStatusEl.textContent = msg;
    smokeStatusEl.classList.toggle("err", !!isError);
  }
}

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
  if (recordCanvas.width !== w || recordCanvas.height !== h) {
    recordCanvas.width = w;
    recordCanvas.height = h;
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
  // frameTimes = per-frame process ms. Slow frames → low FPS.
  // FPS p5 (worst) ≈ 1000 / p95(frameMs), NOT 1000 / p5(frameMs).
  const sorted = [...frameTimes].sort((a, b) => a - b);
  const p95Frame = percentile(sorted, 95);
  const fpsP5 = p95Frame > 0 ? 1000 / p95Frame : 0;
  const backendId = backend?.id ?? "—";
  const fb = fallbackEl.checked ? "ON (raw)" : "off";
  const src = fileCamActive ? "file" : "cam";
  const profile = (typeof getMatteProfile === "function" ? getMatteProfile() : (window.__MATTE_PROFILE || "v8"));
  overlayEl.textContent =
    `backend: ${backendId}\n` +
    `profile: ${profile}\n` +
    `src: ${src}\n` +
    `fallback: ${fb}\n` +
    `FPS avg: ${fps.toFixed(1)}\n` +
    `FPS p5 (worst): ${fpsP5.toFixed(1)}\n` +
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

function resetRecordCapture() {
  if (recordCaptureStream) {
    for (const t of recordCaptureStream.getTracks()) {
      t.stop();
    }
    recordCaptureStream = null;
  }
}

function useSyntheticPublish() {
  // Real camera / matting owns previewCanvas — never paint smoke over it.
  if (stream || loopRunning) {
    return false;
  }
  return lkSyntheticEl.checked;
}

function stopSyntheticIfAny(reason) {
  if (!isSyntheticPreviewRunning()) return;
  stopSyntheticPreview();
  disposeSyntheticMedia();
  console.log("[s3-harness] stopped synthetic:", reason);
}

function getPublishTracks() {
  if (useSyntheticPublish()) {
    ensureSyntheticPreviewForPublish();
    return getSyntheticPublishTracks();
  }
  stopSyntheticIfAny("publish-cam-path");
  const videoTrack = getCameraPublishVideoTrack();
  const srcAudio = stream?.getAudioTracks?.()[0] ?? null;
  let audioTrack = null;
  if (srcAudio && srcAudio.readyState === "live") {
    srcAudio.enabled = true;
    // Clone for SFU so MediaRecorder can keep using (or clone) the source track.
    audioTrack = srcAudio.clone();
  }
  console.log("[s4-harness] publish tracks", {
    videoId: videoTrack?.id,
    audioSrcId: srcAudio?.id,
    audioPubId: audioTrack?.id,
    audioMuted: srcAudio?.muted,
    audioReady: srcAudio?.readyState,
  });
  return { videoTrack, audioTrack };
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
  rawVideo.removeAttribute("src");
  rawVideo.load();
  if (fileCamObjectUrl) {
    URL.revokeObjectURL(fileCamObjectUrl);
    fileCamObjectUrl = null;
  }
  fileCamActive = false;
  btnLoop.disabled = true;
  btnStop.disabled = true;
  btnExport.disabled = exportSamples.length === 0;
  syncS4Controls(true);
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
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (audioErr) {
      console.warn("[s4-harness] mic denied, falling back video-only", audioErr);
      stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });
      setStatus(
        "Caméra OK sans micro — dual S4 aura vidéo seule (pas de sync A/V).",
        true,
      );
    }
    rawVideo.srcObject = stream;
    await rawVideo.play();
    await listCameras();
    syncCanvasSize();
    btnLoop.disabled = false;
    syncS4Controls(true);
    stopSyntheticIfAny("camera-start");
    lkSyntheticEl.checked = false;
    const hasMic = stream.getAudioTracks().length > 0;
    if (hasMic) {
      setStatus("Caméra + micro actifs. Choisir backend puis Start matting loop.");
    } else if (!statusEl.classList.contains("err")) {
      setStatus("Caméra active (sans micro). Choisir backend puis Start matting loop.");
    }
    // Immediate raw paint so Loïc sees something even before matting loop
    syncCanvasSize();
    if (rawVideo.readyState >= 2) {
      outCtx.drawImage(rawVideo, 0, 0, previewCanvas.width, previewCanvas.height);
    }
    const vtrack = stream.getVideoTracks()[0];
    setStatus(
      `Cam OK — ${vtrack?.label || "cam"} · ${previewCanvas.width}×${previewCanvas.height} · stage visible`,
    );
  } catch (e) {
    const opt = cameraSelectEl?.selectedOptions?.[0];
    const label = opt?.textContent || cameraSelectEl?.value || "";
    setStatus(humanizeGumError(e, label), true);
    paintStagePlaceholder("Erreur caméra — vois le statut rouge");
  }
}

async function ensureBackend() {
  const id = backendEl.value;
  if (backend?.id === id && backend.__ready) {
    return backend;
  }
  backend?.dispose?.();
  backend = createBackend(id);
  backend.__ready = false;
  if (backend.init) {
    setStatus(`Initialisation backend ${id}… (CDN/wasm — preview brute en attendant)`);
    try {
      const initPromise = backend.init();
      const timeout = new Promise((_, rej) =>
        setTimeout(() => rej(new Error("timeout 25s — CDN/wasm MediaPipe")), 25000),
      );
      await Promise.race([initPromise, timeout]);
      backend.__ready = true;
      frameTimes.length = 0; // steady-state FPS after CDN/warmup
      setStatus(`Backend ${id} prêt — silhouette attendue (fond vert sombre).`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(
        `MediaPipe échec: ${msg} — preview CAM BRUTE (pas de détourage). Vérifie réseau/CDN.`,
        true,
      );
      backend.dispose?.();
      backend = createBackend(id);
      backend.__ready = false;
    }
  } else {
    backend.__ready = true;
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
    // Always show cam while backend loads
    if (rawVideo.readyState >= 2) {
      outCtx.drawImage(rawVideo, 0, 0, w, h);
    }
    return;
  }
  active
    .processFrame({
      video: rawVideo,
      outCanvas: previewCanvas,
      outCtx,
      recordCtx,
      width: w,
      height: h,
      fallbackRaw: fb,
      opaqueFill: "#1a2e1a",
    })
    .catch((err) => {
      if (rawVideo.readyState >= 2) {
        outCtx.drawImage(rawVideo, 0, 0, w, h);
      }
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
    setStatus("Démarre la caméra ou Load file as cam d’abord.", true);
    return;
  }
  stopSyntheticIfAny("start-matting");
  lkSyntheticEl.checked = false;
  frameTimes.length = 0;
  resetCanvasCapture();
  // Paint raw immediately — never wait on CDN with a black canvas.
  loopRunning = true;
  btnStop.disabled = false;
  btnLoop.disabled = true;
  mattingLoop();
  setStatus("Preview cam brute… chargement MediaPipe.");
  syncS4Controls(true);
  await ensureBackend();
  if (!loopRunning) {
    return;
  }
  setStatus("Boucle matting en cours (overlay FPS).");
  syncS4Controls(true);
  if (liveKit.connected) {
    const tracks = getPublishTracks();
    if (tracks.videoTrack) {
      try {
        await liveKit.publishTracks(tracks);
        setLiveKitStatus("LiveKit: publishing matted canvas (+mic if any)");
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
  syncS4Controls(true);
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
      // 5th percentile FPS = inverse of 95th percentile frame time
      fpsP5Worst:
        sorted.length > 0 && percentile(sorted, 95) > 0
          ? Math.round((1000 / percentile(sorted, 95)) * 10) / 10
          : null,
      frameMsAvg: Math.round(avg * 100) / 100,
      frameMsP5Fast: Math.round(percentile(sorted, 5) * 100) / 100,
      frameMsP95Slow: Math.round(percentile(sorted, 95) * 100) / 100,
      sampleCount: frameTimes.length,
      source: fileCamActive ? "file" : "camera",
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
      if (stream || loopRunning) {
        lkSyntheticEl.checked = false;
        stopSyntheticIfAny("connect-with-cam");
      }
      const tracks = getPublishTracks();
      if (!tracks.videoTrack) {
        throw new Error("No video track — Start caméra + matting (ou smoke sans cam)");
      }
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


let smokeStream = null;

async function startSmokeVideo() {
  try {
    if (smokeStream) {
      for (const t of smokeStream.getTracks()) t.stop();
      smokeStream = null;
    }
    const deviceId = cameraSelectEl.value || undefined;
    const video = deviceId
      ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
      : { width: { ideal: 1280 }, height: { ideal: 720 } };
    setSmokeStatus("Demande getUserMedia (vidéo seule)…");
    smokeStream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    smokeVideo.srcObject = smokeStream;
    await smokeVideo.play();
    const tr = smokeStream.getVideoTracks()[0];
    setSmokeStatus(`Smoke OK — ${tr?.label || "cam"} · readyState=${smokeVideo.readyState}`);
  } catch (e) {
    const opt = cameraSelectEl?.selectedOptions?.[0];
    const label = opt?.textContent || "";
    setSmokeStatus(humanizeGumError(e, label), true);
  }
}

btnCamera.addEventListener("click", () => {
  void startCamera();
});
if (btnSmokeVideo) btnSmokeVideo.addEventListener("click", () => { void startSmokeVideo(); });
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

const btnS4Start = document.getElementById("btnS4Start");
const btnS4Stop = document.getElementById("btnS4Stop");
const s4StatusEl = document.getElementById("s4Status");
let s4Recording = false;
/** @type {{ raw?: any, matted?: any }} */
let s4Handles = {};

function setS4Status(msg, isError = false) {
  if (s4StatusEl) {
    s4StatusEl.textContent = msg;
    s4StatusEl.classList.toggle("err", !!isError);
  }
  setStatus(msg, isError);
  console.log("[s4-harness]", msg);
}

function stagePreviewReady() {
  const stage = document.getElementById("stage");
  const h = stage?.getBoundingClientRect?.().height || 0;
  return h > 100 && previewCanvas.width > 0 && rawVideo?.readyState >= 2;
}

function syncS4Controls(announce = false) {
  if (!btnS4Start || !btnS4Stop) return;
  const previewOk = stagePreviewReady();
  const ready = !!loopRunning && !!stream && !s4Recording && previewOk;
  btnS4Start.disabled = !ready;
  btnS4Stop.disabled = !s4Recording;
  if (btnLoop) {
    btnLoop.disabled = !(stream && !loopRunning);
  }
  if (!announce) return;
  if (!stream) {
    setS4Status("S4: idle — Démarrer caméra d’abord");
  } else if (!previewOk) {
    setS4Status("S4: preview invisible — Ctrl+F5 ?v=s4-matfix8 (cadre 16:9)", true);
  } else if (!loopRunning && !s4Recording) {
    setS4Status("S4: idle — Start matting d’abord, puis dual record ~60s (raw+matted)");
  } else if (loopRunning && !s4Recording) {
    const mic = stream?.getAudioTracks?.().length ? "cam+mic" : "vidéo seule";
    setS4Status(`S4: prêt dual (${mic}) — Start record ~60s, onglet au premier plan`);
  }
}


function describeAudioTracks(label, mediaStream) {
  const tracks = mediaStream?.getAudioTracks?.() || [];
  const rows = tracks.map((tr) => ({
    id: tr.id,
    label: tr.label,
    readyState: tr.readyState,
    muted: tr.muted,
    enabled: tr.enabled,
  }));
  console.log("[s4-harness] audio@" + label, rows);
  return rows;
}

function ensureLiveMic(raw) {
  const tracks = raw?.getAudioTracks?.() || [];
  if (!tracks.length) {
    throw new Error("pas de piste micro — relance caméra avec micro autorisé");
  }
  for (const tr of tracks) {
    if (tr.readyState === "ended") {
      throw new Error("piste micro ended — relance caméra");
    }
    tr.enabled = true;
  }
  return tracks;
}

/** Clone mic so LiveKit publish and MediaRecorder don't share one track consumer. */
function cloneMicTracks(raw) {
  return ensureLiveMic(raw).map((tr) => tr.clone());
}

function buildMattedStream(raw) {
  stopSyntheticIfAny("s4-matted-capture");
  if (!loopRunning) {
    throw new Error("matting loop not running — refuse smoke/idle canvas");
  }
  if (backend?.id === "mock") {
    throw new Error("backend=mock (ellipse) — choisis MediaPipe avant dual record");
  }
  // Transparent record canvas only — do not touch LiveKit preview captureStream.
  resetRecordCapture();
  const canvasStream = recordCanvas.captureStream(30);
  recordCaptureStream = canvasStream;
  const micClones = cloneMicTracks(raw);
  console.log("[s4-harness] matted from transparent recordCanvas", {
    w: recordCanvas.width,
    h: recordCanvas.height,
  });
  return new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...micClones,
  ]);
}

function onS4Gap(g) {
  const ms = Math.round(Number(g?.durationMs) || 0);
  const label = g?.label || "?";
  setS4Status(`S4: trou vidéo « ${label} » — ${ms} ms (onglet au premier plan !)`, true);
}

function onS4AudioIssue(i) {
  const reason = i?.reason || "?";
  const label = i?.label || "?";
  const tMs = i?.tMs != null ? Math.round(Number(i.tMs)) : "?";
  console.warn("[s4-harness] audio", i);
  setS4Status(`S4: audio « ${label} » — ${reason} @ ${tMs} ms`, true);
}

async function startS4Record() {
  if (!loopRunning) {
    setS4Status("S4: démarre le matting d’abord (Start matting loop)", true);
    syncS4Controls();
    return;
  }
  if (!stream) {
    setS4Status("S4: pas de cam — Démarrer caméra d’abord", true);
    return;
  }
  if (!window.S4Recorder?.startSession) {
    setS4Status("S4: startSession manquant — recharge s4-recorder.js v2 (:3320)", true);
    return;
  }
  try {
    s4Recording = true;
    s4Handles = {};
    syncS4Controls();
    if (backend?.id !== "mediapipe") {
      setS4Status(
        "S4: bascule Backend → MediaPipe (actuel: " + (backend?.id || "?") + ") — mock = disque faux",
        true,
      );
      return;
    }
    const cam = stream;
    describeAudioTracks("before-dual", cam);
    const micRows = describeAudioTracks("before-dual", cam);
    if (!micRows.length || micRows.some((r) => r.readyState !== "live")) {
      setS4Status("S4: micro pas live — relance caméra + autorise le mic", true);
      return;
    }
    // Dedicated clones for recorders (don't share the LiveKit-consumed track).
    const rawMic = cloneMicTracks(cam);
    const rawRec = new MediaStream([
      ...cam.getVideoTracks(),
      ...rawMic,
    ]);
    const matted = buildMattedStream(cam);
    if (!matted.getVideoTracks().length) {
      setS4Status("S4: canvas sans piste vidéo — relance matting", true);
      return;
    }
    describeAudioTracks("raw-rec", rawRec);
    describeAudioTracks("matted-rec", matted);
    const common = {
      apiBase: "http://127.0.0.1:3320",
      participant: "vision-host",
      durationSec: 60,
      partMiB: 5,
      timeslice: 1000,
      vBitrate: 2500000,
      onGap: onS4Gap,
      onAudioIssue: onS4AudioIssue,
    };
    setS4Status("S4: dual startSession raw+matted (MediaPipe) → :3320…");
    s4Handles.raw = await window.S4Recorder.startSession({
      ...common,
      stream: rawRec,
      label: "raw",
    });
    s4Handles.matted = await window.S4Recorder.startSession({
      ...common,
      stream: matted,
      label: "matted",
    });
    setS4Status("S4: attends 2 s → 1 clap sec, mains visibles à hauteur du visage (~40 cm)");
    await new Promise((r) => setTimeout(r, 2000));
    setS4Status("S4: recording dual… clap fait ? parle · onglet premier plan");
    const [rawRes, matRes] = await Promise.all([
      s4Handles.raw.done,
      s4Handles.matted.done,
    ]);
    try {
      await s4Handles.raw.exportResults?.();
      await s4Handles.matted.exportResults?.();
    } catch (ex) {
      console.warn("[s4-harness] exportResults", ex);
    }
    const rawGaps = Array.isArray(rawRes?.gaps) ? rawRes.gaps.length : (rawRes?.events || []).filter((e) => e.type === "gap").length;
    const matGaps = Array.isArray(matRes?.gaps) ? matRes.gaps.length : (matRes?.events || []).filter((e) => e.type === "gap").length;
    const audioBad =
      rawRes?.audioMissing ||
      matRes?.audioMissing ||
      rawRes?.completeOk === false ||
      matRes?.completeOk === false;
    if (audioBad) {
      setS4Status(
        "S4: prise incomplete (audio manquant) — bytes uploades pour diag — NE PAS valider",
        true,
      );
    } else {
      setS4Status(
        `S4: dual done — raw gaps≈${rawGaps}, matted gaps≈${matGaps} (voir Media MinIO / exportResults)`,
      );
    }
  } catch (e) {
    let detail = e instanceof Error ? e.message : String(e);
    let human = detail;
    if (/404|Failed to fetch|NetworkError/i.test(detail)) {
      human = "S4 indisponible — vérifie l’API Media sur :3320";
    } else if (/mimeType|MediaRecorder/i.test(detail)) {
      human = "S4: format WebM non supporté par ce navigateur";
    } else if (/stream|MediaStream/i.test(detail)) {
      human = "S4: flux invalide — relance caméra + matting";
    } else {
      human = "S4 a échoué — " + detail;
    }
    setS4Status(human, true);
  } finally {
    s4Recording = false;
    s4Handles = {};
    syncS4Controls();
  }
}

async function stopS4Record() {
  try {
    if (window.S4Recorder?.stopAll) {
      await window.S4Recorder.stopAll();
    } else {
      s4Handles.raw?.stop?.();
      s4Handles.matted?.stop?.();
    }
    setS4Status("S4: stopAll demandé");
  } catch (e) {
    setS4Status("S4: stop error — " + (e instanceof Error ? e.message : String(e)), true);
  }
}


const btnLoadFile = document.getElementById("btnLoadFile");
const fileCamInput = document.getElementById("fileCamInput");

async function loadFileAsCamFromBlob(fileOrUrl, label) {
  await stopAll();
  try {
    let url = fileOrUrl;
    let name = label || "file";
    if (typeof Blob !== "undefined" && fileOrUrl instanceof Blob) {
      if (fileCamObjectUrl) {
        URL.revokeObjectURL(fileCamObjectUrl);
      }
      fileCamObjectUrl = URL.createObjectURL(fileOrUrl);
      url = fileCamObjectUrl;
      name = fileOrUrl.name || name;
    }
    rawVideo.srcObject = null;
    rawVideo.loop = true;
    rawVideo.muted = true;
    rawVideo.playsInline = true;
    rawVideo.src = url;
    await rawVideo.play();
    for (let i = 0; i < 50 && (!rawVideo.videoWidth || rawVideo.readyState < 2); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (!rawVideo.videoWidth) {
      throw new Error("fichier vidéo sans dimensions — codec non supporté ?");
    }
    const capture =
      typeof rawVideo.captureStream === "function"
        ? rawVideo.captureStream(30)
        : typeof rawVideo.mozCaptureStream === "function"
          ? rawVideo.mozCaptureStream(30)
          : null;
    if (!capture) {
      throw new Error("captureStream non supporté sur <video> (Edge/Chrome requis)");
    }
    stream = capture;
    fileCamActive = true;
    syncCanvasSize();
    btnLoop.disabled = false;
    syncS4Controls(true);
    stopSyntheticIfAny("file-cam-start");
    lkSyntheticEl.checked = false;
    if (rawVideo.readyState >= 2) {
      outCtx.drawImage(rawVideo, 0, 0, previewCanvas.width, previewCanvas.height);
    }
    setStatus(
      `Fichier cam OK — ${name} · ${previewCanvas.width}×${previewCanvas.height} · loop (nuit matfix8)`,
    );
  } catch (e) {
    fileCamActive = false;
    setStatus(
      "Load file: " + (e instanceof Error ? e.message : String(e)),
      true,
    );
    paintStagePlaceholder("Erreur fichier — vois le statut rouge");
  }
}

if (btnLoadFile && fileCamInput) {
  btnLoadFile.addEventListener("click", () => fileCamInput.click());
  fileCamInput.addEventListener("change", () => {
    const f = fileCamInput.files?.[0];
    if (f) void loadFileAsCamFromBlob(f, f.name);
    fileCamInput.value = "";
  });
}

(async () => {
  const params = new URLSearchParams(location.search);
  const fileParam = params.get("file");
  if (fileParam) {
    try {
      const abs = fileParam.startsWith("http")
        ? fileParam
        : new URL(fileParam, location.href).href;
      setStatus(`Chargement ?file= …`);
      await loadFileAsCamFromBlob(abs, fileParam);
    } catch (e) {
      setStatus(
        "?file= échec: " + (e instanceof Error ? e.message : String(e)),
        true,
      );
    }
  }
})();

paintStagePlaceholder("Preview A/B — cadre 16:9 (cam ou Load file)");
if (overlayEl) overlayEl.textContent = "FPS: —\nstage v8 matfix8";
if (btnS4Start) btnS4Start.addEventListener("click", () => { void startS4Record(); });
if (btnS4Stop) btnS4Stop.addEventListener("click", () => { void stopS4Record(); });
syncS4Controls(true);


/** Playwright A/B helper — read live FPS summary without download click. */
window.__s3Metrics = function () {
  const sorted = [...frameTimes].sort((a, b) => a - b);
  const avg = frameTimes.length
    ? frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length
    : 0;
  const p95 = sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(0.95 * sorted.length)))]
    : 0;
  return {
    profile: typeof getMatteProfile === "function" ? getMatteProfile() : (window.__MATTE_PROFILE || "v8"),
    fpsAvg: avg > 0 ? Math.round((1000 / avg) * 10) / 10 : null,
    fpsP5Worst: p95 > 0 ? Math.round((1000 / p95) * 10) / 10 : null,
    frameMsAvg: Math.round(avg * 100) / 100,
    frameMsP95Slow: Math.round(p95 * 100) / 100,
    sampleCount: frameTimes.length,
    source: fileCamActive ? "file" : "camera",
    canvas: { width: previewCanvas.width, height: previewCanvas.height },
  };
};
window.__s3ClearFrameTimes = function () { frameTimes.length = 0; };
