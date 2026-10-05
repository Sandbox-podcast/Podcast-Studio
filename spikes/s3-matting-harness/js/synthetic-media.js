/**
 * Synthetic video (canvas) + silent audio for LiveKit smoke without getUserMedia.
 */

/** @type {number} */
let rafId = 0;
/** @type {MediaStream | null} */
let videoCapture = null;
/** @type {AudioContext | null} */
let audioContext = null;
/** @type {OscillatorNode | null} */
let oscillator = null;
/** @type {HTMLCanvasElement | null} */
let boundCanvas = null;
/** @type {CanvasRenderingContext2D | null} */
let boundCtx = null;
let running = false;

/**
 * @param {{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; width: number; height: number }} target
 */
export function startSyntheticPreview(target) {
  if (running && boundCanvas === target.canvas) {
    return;
  }
  stopSyntheticPreview();
  boundCanvas = target.canvas;
  boundCtx = target.ctx;
  if (boundCanvas.width !== target.width || boundCanvas.height !== target.height) {
    boundCanvas.width = target.width;
    boundCanvas.height = target.height;
  }
  running = true;
  const t0 = performance.now();
  const loop = () => {
    if (!running || !boundCtx || !boundCanvas) {
      return;
    }
    rafId = requestAnimationFrame(loop);
    const t = (performance.now() - t0) / 1000;
    const w = boundCanvas.width;
    const h = boundCanvas.height;
    boundCtx.fillStyle = "#1a2030";
    boundCtx.fillRect(0, 0, w, h);
    const x = (Math.sin(t * 0.7) * 0.35 + 0.5) * w;
    const y = (Math.cos(t * 0.5) * 0.25 + 0.5) * h;
    const grad = boundCtx.createRadialGradient(x, y, 20, x, y, Math.min(w, h) * 0.45);
    grad.addColorStop(0, "#5ec8ff");
    grad.addColorStop(1, "rgba(94, 200, 255, 0)");
    boundCtx.fillStyle = grad;
    boundCtx.fillRect(0, 0, w, h);
    boundCtx.fillStyle = "#e8e8e8";
    boundCtx.font = `${Math.round(h * 0.06)}px system-ui,sans-serif`;
    boundCtx.fillText("S3 synthetic smoke (no camera)", 24, h * 0.12);
    boundCtx.font = `${Math.round(h * 0.04)}px ui-monospace,monospace`;
    boundCtx.fillText(`vision-s3 · ${w}×${h}`, 24, h * 0.18);
  };
  loop();
}

export function stopSyntheticPreview() {
  running = false;
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  boundCanvas = null;
  boundCtx = null;
}

function ensureVideoCapture() {
  if (!boundCanvas) {
    throw new Error("Synthetic preview not started");
  }
  if (!videoCapture) {
    videoCapture = boundCanvas.captureStream(30);
  }
  return videoCapture;
}

/** @type {MediaStreamTrack | null} */
let silentAudioTrack = null;

function getSilentAudioTrack() {
  if (silentAudioTrack && silentAudioTrack.readyState === "live") {
    return silentAudioTrack;
  }
  if (!audioContext) {
    audioContext = new AudioContext();
    const gain = audioContext.createGain();
    gain.gain.value = 0;
    oscillator = audioContext.createOscillator();
    oscillator.frequency.value = 440;
    const dest = audioContext.createMediaStreamDestination();
    oscillator.connect(gain);
    gain.connect(dest);
    oscillator.start();
    silentAudioTrack = dest.stream.getAudioTracks()[0] ?? null;
  }
  return silentAudioTrack;
}

/**
 * @returns {{ videoTrack: MediaStreamTrack; audioTrack: MediaStreamTrack | null }}
 */
export function getSyntheticPublishTracks() {
  const stream = ensureVideoCapture();
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) {
    throw new Error("Synthetic video track unavailable");
  }
  return {
    videoTrack,
    audioTrack: getSilentAudioTrack(),
  };
}

export function disposeSyntheticMedia() {
  stopSyntheticPreview();
  if (videoCapture) {
    for (const t of videoCapture.getTracks()) {
      t.stop();
    }
    videoCapture = null;
  }
  if (oscillator) {
    try {
      oscillator.stop();
    } catch {
      /* ignore */
    }
    oscillator = null;
  }
  silentAudioTrack = null;
  if (audioContext) {
    void audioContext.close();
    audioContext = null;
  }
}

export function isSyntheticPreviewRunning() {
  return running;
}
