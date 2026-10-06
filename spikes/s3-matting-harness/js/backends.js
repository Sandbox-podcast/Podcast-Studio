/**
 * Pluggable matting backends for S3 spike harness (not product code).
 * Profiles via ?profile=v7|v8|v8b or window.__MATTE_PROFILE:
 *   v7  — confidence mask + bilinear upsample only (no blur/temporal/threshold)
 *   v8  — blur after upsample + temporal + threshold (default)
 *   v8b — blur+temporal+threshold on 256 mask BEFORE upsample (cheap)
 */

const MEDIAPIPE_VISION_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

/** Selfie general 256×256 (not landscape 144×256). */
const SELFIE_GENERAL_MODEL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

/** Zero confidence below this to kill weak leaks (screen/decor). */
const MASK_CONFIDENCE_THRESHOLD = 0.4;
/** Temporal blend: new*BLEND_NEW + old*(1-BLEND_NEW). */
const MASK_BLEND_NEW = 0.65;
/** Soft edge blur (px) when upsampling mask to canvas resolution. */
const MASK_EDGE_BLUR_PX = 2.5;

/**
 * @returns {'v7'|'v8'|'v8b'}
 */
export function getMatteProfile() {
  try {
    if (typeof window !== "undefined" && window.__MATTE_PROFILE) {
      const p = String(window.__MATTE_PROFILE).toLowerCase();
      if (p === "v7" || p === "v8" || p === "v8b") return p;
    }
    if (typeof location !== "undefined") {
      const p = new URLSearchParams(location.search).get("profile");
      if (p) {
        const x = p.toLowerCase();
        if (x === "v7" || x === "v8" || x === "v8b") return x;
      }
    }
  } catch (_) {}
  return "v8";
}

/**
 * @typedef {Object} MattingBackend
 * @property {string} id
 * @property {() => Promise<void>} [init]
 * @property {(ctx: BackendFrameContext) => Promise<void>} processFrame
 * @property {() => void} [dispose]
 */

/**
 * @typedef {Object} BackendFrameContext
 * @property {HTMLVideoElement} video
 * @property {HTMLCanvasElement} outCanvas
 * @property {CanvasRenderingContext2D} outCtx
 * @property {number} width
 * @property {number} height
 * @property {boolean} fallbackRaw
 * @property {CanvasRenderingContext2D} [recordCtx]
 * @property {string} [opaqueFill]
 */

/**
 * Paint matted person onto ctx.
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLVideoElement} video
 * @param {HTMLCanvasElement | null} maskCanvas
 * @param {{ width: number, height: number, opaqueFill?: string, fallbackRaw?: boolean }} opts
 */
function paintMatted(ctx, video, maskCanvas, opts) {
  const { width, height, opaqueFill, fallbackRaw } = opts;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (!opaqueFill) {
    ctx.clearRect(0, 0, width, height);
  }
  if (video.readyState < 2) {
    if (opaqueFill) {
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#fbbf24";
      ctx.font = "16px system-ui";
      ctx.fillText("Caméra: en attente de frames…", 16, 32);
    }
    return;
  }
  ctx.drawImage(video, 0, 0, width, height);
  if (fallbackRaw || !maskCanvas) {
    return;
  }
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(maskCanvas, 0, 0, width, height);
  ctx.restore();
  if (opaqueFill) {
    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = opaqueFill;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}

/** @returns {MattingBackend} */
export function createMockBackend() {
  return {
    id: "mock",
    async processFrame({ video, outCtx, recordCtx, width, height, fallbackRaw, opaqueFill }) {
      const fill = opaqueFill ?? "#1e3a5f";
      let maskCanvas = null;
      if (!fallbackRaw && video.readyState >= 2) {
        const t = performance.now() * 0.002;
        const cx = width * (0.35 + 0.08 * Math.sin(t));
        const cy = height * (0.45 + 0.06 * Math.cos(t * 1.3));
        const rx = width * 0.22;
        const ry = height * 0.38;
        maskCanvas = document.createElement("canvas");
        maskCanvas.width = width;
        maskCanvas.height = height;
        const mctx = maskCanvas.getContext("2d");
        if (mctx) {
          mctx.clearRect(0, 0, width, height);
          mctx.fillStyle = "#fff";
          mctx.beginPath();
          mctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          mctx.fill();
        }
      }
      paintMatted(outCtx, video, maskCanvas, { width, height, opaqueFill: fill, fallbackRaw });
      if (recordCtx) {
        paintMatted(recordCtx, video, maskCanvas, { width, height, opaqueFill: "", fallbackRaw });
      }
    },
  };
}

/** @returns {MattingBackend} */
export function createWebGpuStubBackend() {
  return {
    id: "webgpu",
    async init() {},
    async processFrame({ video, outCtx, width, height, fallbackRaw }) {
      if (fallbackRaw) {
        outCtx.drawImage(video, 0, 0, width, height);
        return;
      }
      outCtx.drawImage(video, 0, 0, width, height);
      outCtx.fillStyle = "rgba(255, 80, 80, 0.35)";
      outCtx.font = "24px system-ui";
      outCtx.fillText("WebGPU stub — TODO", 16, 40);
    },
  };
}

/** @returns {MattingBackend} */
export function createWasmStubBackend() {
  return {
    id: "wasm",
    async init() {},
    async processFrame({ video, outCtx, width, height, fallbackRaw }) {
      if (fallbackRaw) {
        outCtx.drawImage(video, 0, 0, width, height);
        return;
      }
      outCtx.drawImage(video, 0, 0, width, height);
      outCtx.fillStyle = "rgba(80, 200, 120, 0.35)";
      outCtx.font = "24px system-ui";
      outCtx.fillText("WASM stub — TODO", 16, 40);
    },
  };
}

/** @returns {MattingBackend} */
export function createMediaPipeBackend() {
  /** @type {import('@mediapipe/tasks-vision').ImageSegmenter | null} */
  let segmenter = null;
  let lastVideoTime = -1;
  let lastError = "";
  /** @type {HTMLCanvasElement | null} */
  let lastMaskCanvas = null;
  /** @type {Float32Array | null} */
  let prevMaskFloat = null;
  let prevMw = 0;
  let prevMh = 0;

  async function createSegmenter(vision, ImageSegmenter, delegate) {
    return ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: SELFIE_GENERAL_MODEL,
        delegate,
      },
      runningMode: "VIDEO",
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    });
  }

  /**
   * @param {import('@mediapipe/tasks-vision').MPMask} mask
   * @param {number} width
   * @param {number} height
   * @param {'v7'|'v8'|'v8b'} profile
   */
  function drawConfidenceMask(mask, width, height, profile) {
    const floatArray = mask.getAsFloat32Array();
    const mw = mask.width;
    const mh = mask.height;
    const useTemporal = profile === "v8" || profile === "v8b";
    const useThreshold = profile === "v8" || profile === "v8b";
    const blurAfterUpsample = profile === "v8";
    const blurBeforeUpsample = profile === "v8b";

    const blended = new Float32Array(floatArray.length);
    if (
      useTemporal &&
      prevMaskFloat &&
      prevMw === mw &&
      prevMh === mh &&
      prevMaskFloat.length === floatArray.length
    ) {
      const a = MASK_BLEND_NEW;
      const b = 1 - a;
      for (let i = 0; i < floatArray.length; i++) {
        blended[i] = floatArray[i] * a + prevMaskFloat[i] * b;
      }
    } else {
      blended.set(floatArray);
    }
    if (useTemporal) {
      prevMaskFloat = blended;
      prevMw = mw;
      prevMh = mh;
    } else {
      prevMaskFloat = null;
      prevMw = 0;
      prevMh = 0;
    }

    const tmp = document.createElement("canvas");
    tmp.width = mw;
    tmp.height = mh;
    const tctx = tmp.getContext("2d");
    if (!tctx) return null;
    const imageData = tctx.createImageData(mw, mh);
    const thr = useThreshold ? MASK_CONFIDENCE_THRESHOLD : 0;
    for (let i = 0; i < blended.length; i++) {
      let c = blended[i];
      if (useThreshold) {
        if (c < thr) {
          c = 0;
        } else {
          c = (c - thr) / (1 - thr);
        }
      }
      const v = Math.min(255, Math.max(0, Math.round(c * 255)));
      const o = i * 4;
      imageData.data[o] = 255;
      imageData.data[o + 1] = 255;
      imageData.data[o + 2] = 255;
      imageData.data[o + 3] = v;
    }
    tctx.putImageData(imageData, 0, 0);

    // v8b: blur on low-res mask before upsample
    let srcForUpsample = tmp;
    if (blurBeforeUpsample && MASK_EDGE_BLUR_PX > 0) {
      const soft = document.createElement("canvas");
      soft.width = mw;
      soft.height = mh;
      const sctx = soft.getContext("2d");
      if (sctx) {
        // Scale blur to low-res (~2.5px at 720 ≈ 0.5px at 256)
        const lowBlur = Math.max(0.4, MASK_EDGE_BLUR_PX * (mw / Math.max(width, 1)));
        sctx.filter = `blur(${lowBlur.toFixed(2)}px)`;
        sctx.drawImage(tmp, 0, 0);
        sctx.filter = "none";
        srcForUpsample = soft;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (blurAfterUpsample && MASK_EDGE_BLUR_PX > 0) {
      ctx.filter = `blur(${MASK_EDGE_BLUR_PX}px)`;
    }
    ctx.drawImage(srcForUpsample, 0, 0, width, height);
    ctx.filter = "none";
    return canvas;
  }

  return {
    id: "mediapipe",
    async init() {
      const { FilesetResolver, ImageSegmenter } = await import(
        /* webpackIgnore: true */ `${MEDIAPIPE_VISION_CDN}/vision_bundle.mjs`
      );
      const vision = await FilesetResolver.forVisionTasks(
        `${MEDIAPIPE_VISION_CDN}/wasm`
      );
      try {
        segmenter = await createSegmenter(vision, ImageSegmenter, "GPU");
      } catch (gpuErr) {
        console.warn("[mediapipe] GPU delegate failed, trying CPU", gpuErr);
        segmenter = await createSegmenter(vision, ImageSegmenter, "CPU");
      }
      lastVideoTime = -1;
      lastError = "";
      prevMaskFloat = null;
      prevMw = 0;
      prevMh = 0;
    },
    async processFrame({ video, outCtx, recordCtx, width, height, fallbackRaw, opaqueFill }) {
      const fill = opaqueFill ?? "#1a2e1a";
      const profile = getMatteProfile();
      let maskCanvas = null;
      if (!fallbackRaw && segmenter && video.readyState >= 2) {
        const t = video.currentTime;
        if (t !== lastVideoTime) {
          lastVideoTime = t;
          try {
            const result = segmenter.segmentForVideo(video, performance.now());
            const masks = result.confidenceMasks;
            lastMaskCanvas =
              masks && masks.length > 0
                ? drawConfidenceMask(masks[0], width, height, profile)
                : null;
            lastError = "";
          } catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
          }
        }
        maskCanvas = lastMaskCanvas;
      }
      paintMatted(outCtx, video, maskCanvas, {
        width,
        height,
        opaqueFill: fill,
        fallbackRaw: fallbackRaw || !segmenter,
      });
      if (!segmenter && !fallbackRaw) {
        outCtx.fillStyle = "rgba(251,191,36,0.9)";
        outCtx.font = "14px system-ui";
        outCtx.fillText("MediaPipe pas prêt — preview brute", 16, height - 16);
      }
      if (lastError) {
        outCtx.fillStyle = "rgba(239,68,68,0.95)";
        outCtx.font = "14px system-ui";
        outCtx.fillText("MediaPipe frame: " + lastError.slice(0, 80), 16, height - 16);
      }
      // Profile badge for A/B screenshots
      outCtx.fillStyle = "rgba(0,0,0,0.55)";
      outCtx.fillRect(width - 72, 8, 64, 22);
      outCtx.fillStyle = "#7dd3fc";
      outCtx.font = "bold 14px system-ui";
      outCtx.fillText(profile, width - 60, 24);
      if (recordCtx) {
        paintMatted(recordCtx, video, maskCanvas, {
          width,
          height,
          opaqueFill: "",
          fallbackRaw: fallbackRaw || !segmenter,
        });
      }
    },
    dispose() {
      segmenter?.close();
      segmenter = null;
      lastMaskCanvas = null;
      prevMaskFloat = null;
      prevMw = 0;
      prevMh = 0;
    },
  };
}

/**
 * @param {string} id
 * @returns {MattingBackend}
 */
export function createBackend(id) {
  switch (id) {
    case "mock":
      return createMockBackend();
    case "mediapipe":
      return createMediaPipeBackend();
    case "webgpu":
      return createWebGpuStubBackend();
    case "wasm":
      return createWasmStubBackend();
    default: {
      const _exhaustive = id;
      void _exhaustive;
      return createMockBackend();
    }
  }
}
