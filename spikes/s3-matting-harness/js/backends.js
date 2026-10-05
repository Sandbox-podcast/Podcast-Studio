/**
 * Pluggable matting backends for S3 spike harness (not product code).
 */

const MEDIAPIPE_VISION_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

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
 */

/** @returns {MattingBackend} */
export function createMockBackend() {
  return {
    id: "mock",
    async processFrame({ video, outCtx, width, height, fallbackRaw }) {
      if (fallbackRaw) {
        outCtx.drawImage(video, 0, 0, width, height);
        return;
      }
      outCtx.drawImage(video, 0, 0, width, height);
      const t = performance.now() * 0.002;
      const cx = width * (0.35 + 0.08 * Math.sin(t));
      const cy = height * (0.45 + 0.06 * Math.cos(t * 1.3));
      const rx = width * 0.22;
      const ry = height * 0.38;
      outCtx.save();
      outCtx.globalCompositeOperation = "destination-in";
      outCtx.fillStyle = "#fff";
      outCtx.beginPath();
      outCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      outCtx.fill();
      outCtx.restore();
      outCtx.save();
      outCtx.globalCompositeOperation = "destination-over";
      outCtx.fillStyle = "#1e3a5f";
      outCtx.fillRect(0, 0, width, height);
      outCtx.restore();
    },
  };
}

/** @returns {MattingBackend} */
export function createWebGpuStubBackend() {
  return {
    id: "webgpu",
    async init() {
      // TODO(S3): load segmentation model + WebGPU inference path when model asset chosen.
    },
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
    async init() {
      // TODO(S3): WASM runtime + model bytes (ort/wasm or custom).
    },
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

  return {
    id: "mediapipe",
    async init() {
      const { FilesetResolver, ImageSegmenter } = await import(
        /* webpackIgnore: true */ `${MEDIAPIPE_VISION_CDN}/vision_bundle.mjs`
      );
      const vision = await FilesetResolver.forVisionTasks(
        `${MEDIAPIPE_VISION_CDN}/wasm`
      );
      segmenter = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
      lastVideoTime = -1;
    },
    async processFrame({ video, outCtx, width, height, fallbackRaw }) {
      if (fallbackRaw || !segmenter) {
        outCtx.drawImage(video, 0, 0, width, height);
        return;
      }
      if (video.readyState < 2) {
        return;
      }
      const t = video.currentTime;
      if (t === lastVideoTime) {
        return;
      }
      lastVideoTime = t;
      const result = segmenter.segmentForVideo(video, performance.now());
      outCtx.drawImage(video, 0, 0, width, height);
      const masks = result.confidenceMasks;
      if (masks && masks.length > 0) {
        const mask = masks[0];
        const maskCanvas = drawConfidenceMask(mask, width, height);
        if (maskCanvas) {
          outCtx.save();
          outCtx.globalCompositeOperation = "destination-in";
          outCtx.drawImage(maskCanvas, 0, 0, width, height);
          outCtx.restore();
          outCtx.save();
          outCtx.globalCompositeOperation = "destination-over";
          outCtx.fillStyle = "#1a2e1a";
          outCtx.fillRect(0, 0, width, height);
          outCtx.restore();
        }
      }
    },
    dispose() {
      segmenter?.close();
      segmenter = null;
    },
  };
}

/**
 * @param {import('@mediapipe/tasks-vision').MPMask} mask
 * @param {number} width
 * @param {number} height
 */
function drawConfidenceMask(mask, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }
  const floatArray = mask.getAsFloat32Array();
  const mw = mask.width;
  const mh = mask.height;
  const imageData = ctx.createImageData(mw, mh);
  for (let i = 0; i < floatArray.length; i++) {
    const v = Math.min(255, Math.max(0, floatArray[i] * 255));
    const o = i * 4;
    imageData.data[o] = v;
    imageData.data[o + 1] = v;
    imageData.data[o + 2] = v;
    imageData.data[o + 3] = 255;
  }
  const tmp = document.createElement("canvas");
  tmp.width = mw;
  tmp.height = mh;
  tmp.getContext("2d")?.putImageData(imageData, 0, 0);
  ctx.drawImage(tmp, 0, 0, width, height);
  return canvas;
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
