import {
  Room,
  RoomEvent,
  Track,
  LocalVideoTrack,
  VideoPresets,
  VideoQuality,
} from "https://esm.sh/livekit-client@2.9.1";
// createLocalTracks / getUserMedia only loaded for mode=camera (never on page load).

const POLL_MS = 2000;

const els = {
  room: document.getElementById("room"),
  identity: document.getElementById("identity"),
  mediaMode: document.getElementById("media-mode"),
  simulcastLayers: document.getElementById("simulcast-layers"),
  hqRec: document.getElementById("hq-rec"),
  join: document.getElementById("join"),
  leave: document.getElementById("leave"),
  status: document.getElementById("status"),
  localVideo: document.getElementById("local-video"),
  remoteTiles: document.getElementById("remote-tiles"),
  statsBody: document.querySelector("#stats-table tbody"),
};

/** @type {Room | null} */
let room = null;
/** @type {ReturnType<typeof setInterval> | null} */
let statsTimer = null;
/** key -> { bytes, at } for bitrate */
const byteSnapshots = new Map();
/** @type {number | null} */
let canvasAnim = null;
/** @type {MediaStreamTrack | null} */
let canvasVideoTrack = null;

els.identity.value = `p-${Math.floor(Math.random() * 900 + 100)}`;

function parseUrlFlags() {
  const q = new URLSearchParams(location.search);
  const layers = q.get("layers");
  if (layers === "2" || layers === "3") {
    if (els.simulcastLayers) els.simulcastLayers.value = layers;
  }
  if (q.get("hqRec") === "1" && els.hqRec) els.hqRec.checked = true;
  const mode = q.get("mode");
  if (mode && els.mediaMode) {
    const opt = [...els.mediaMode.options].find((o) => o.value === mode);
    if (opt) els.mediaMode.value = mode;
  }
}
parseUrlFlags();

function layerCount() {
  const v = els.simulcastLayers?.value ?? "3";
  return v === "2" ? 2 : 3;
}

/**
 * LiveKit publish options. `videoSimulcastLayers` lists the LOWER layers only; the top layer is the
 * source resolution (720p cam / take4 file).
 *   layers=3 -> [h180, h360] + source  (= livekit-client default for 16:9 720p)
 *   layers=2 -> [h180] + source
 */
function simulcastPublishOptions(name) {
  const n = layerCount();
  // ?codec=h264|vp8|vp9|av1 (default: livekit-client default = vp8)
  const codec = urlFlag("codec");
  return {
    name,
    simulcast: true,
    ...(codec ? { videoCodec: codec } : {}),
    source: Track.Source.Camera,
    videoEncoding: { maxBitrate: 1_700_000, maxFramerate: 30 },
    videoSimulcastLayers: n === 2 ? [VideoPresets.h180] : [VideoPresets.h180, VideoPresets.h360],
  };
}

function urlFlag(name, dflt = null) {
  return new URLSearchParams(location.search).get(name) ?? dflt;
}

/** Exact tracks published to the SFU (cam or take4 captureStream) — the S4 recorder records THIS stream. */
window.__publishedStream = null;
function setPublishedStream(tracks) {
  window.__publishedStream = new MediaStream(tracks.filter(Boolean));
}

// --- HQ rec hook: Media's S4Recorder (same tab, same published MediaStream) ---
// ON  = S4Recorder.startSession({stream: publishedStream, ...}); end = stopAll() + exportResults()
// OFF = never call startSession. Recorder script/API base: ?s4=http://127.0.0.1:3320 (default).
const S4_BASE = urlFlag("s4", "http://127.0.0.1:3320");
/** @type {any} */
let s4Handle = null;

async function loadS4Recorder() {
  if (window.S4Recorder) return true;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `${S4_BASE}/s4-recorder.js`;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${s.src}`));
    document.head.appendChild(s);
  });
  return !!window.S4Recorder;
}

window.__s4Health = async function __s4Health() {
  try {
    const r = await fetch(`${S4_BASE}/api/health`, { cache: "no-store" });
    const body = await r.text();
    return { ok: r.ok, status: r.status, body: body.slice(0, 500) };
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e) };
  }
};

/** @param {{cond?: string, durationSec?: number, vBitrate?: number}} [opts] */
window.__startHqRec = async function __startHqRec(opts = {}) {
  const t0 = Date.now();
  try {
    if (s4Handle) return { ok: true, already: true };
    const stream = window.__publishedStream;
    if (!stream || !stream.getVideoTracks().length) return { ok: false, error: "no published stream" };
    const health = await window.__s4Health();
    if (!health.ok) return { ok: false, error: "s4 health failed", health };
    await loadS4Recorder();
    if (!window.S4Recorder?.startSession) return { ok: false, error: "S4Recorder.startSession missing" };
    const cond = opts.cond ?? urlFlag("cond", "manual");
    const participant = cond.startsWith("ab-") ? cond : `ab-${cond}`;
    s4Handle = await window.S4Recorder.startSession({
      stream,
      label: "raw",
      participant,
      apiBase: S4_BASE,
      durationSec: opts.durationSec ?? 120,
      timeslice: 1000,
      vBitrate: opts.vBitrate ?? 2_500_000,
    });
    if (els.hqRec) els.hqRec.checked = true;
    console.log("[hq-rec] S4 session started", participant);
    return { ok: true, participant, startedAtMs: t0, health };
  } catch (e) {
    s4Handle = null;
    return { ok: false, error: String(e?.message ?? e) };
  }
};

window.__stopHqRec = async function __stopHqRec() {
  const t0 = Date.now();
  try {
    if (!s4Handle) return { ok: false, error: "not recording" };
    await window.S4Recorder.stopAll();
    let results = await s4Handle.exportResults();
    try { results = JSON.parse(JSON.stringify(results ?? null)); } catch { results = String(results); }
    s4Handle = null;
    if (els.hqRec) els.hqRec.checked = false;
    console.log("[hq-rec] S4 session stopped");
    return { ok: true, stoppedAtMs: t0, results };
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e) };
  }
};

els.join.addEventListener("click", () => {
  joinRoom().catch((e) => {
    console.error(e);
    setStatus(`error: ${e.message ?? e}`);
    els.join.disabled = false;
    void leaveRoom();
  });
});
els.leave.addEventListener("click", () => leaveRoom());

async function joinRoom() {
  if (room) return;
  setStatus("connecting…");
  els.join.disabled = true;

  const roomName = els.room.value.trim() || "s1-lab";
  const identity = els.identity.value.trim() || `lab-${Date.now()}`;

  const { token, url } = await fetchToken(roomName, identity);
  if (!url) {
    setStatus("error: LIVEKIT_URL not configured on server");
    els.join.disabled = false;
    return;
  }

  room = new Room({
    // ?adaptive=0 lets an A/B subscriber pin a simulcast layer via setVideoQuality
    adaptiveStream: urlFlag("adaptive", "1") !== "0",
    dynacast: true,
  });

  room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
    attachRemoteTrack(track, participant.identity);
  });
  room.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
    detachRemoteTrack(track, participant.identity);
  });
  room.on(RoomEvent.ParticipantDisconnected, (participant) => {
    removeRemoteTiles(participant.identity);
  });
  room.on(RoomEvent.Disconnected, () => {
    setStatus("disconnected");
  });

  await room.connect(url, token);
  window.__lkRoom = room;
  setStatus(`connected — ${roomName}`);

  // Chromium hides encoderImplementation/decoderImplementation/powerEfficientEncoder unless the page is
  // capturing. ?unlockStats=1 holds a disabled (unpublished) mic track so file/none pages expose them.
  if (urlFlag("unlockStats") === "1" && !window.__unlockTrack) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      window.__unlockTrack = s.getAudioTracks()[0];
      window.__unlockTrack.enabled = false;
    } catch (e) {
      console.warn("[unlockStats] getUserMedia failed", e?.message ?? e);
    }
  }

  const mode = els.mediaMode?.value ?? "canvas";
  if (mode === "camera") {
    const { createLocalTracks, VideoPresets } = await import(
      "https://esm.sh/livekit-client@2.9.1"
    );
    const tracks = await createLocalTracks({
      audio: true,
      video: { resolution: VideoPresets.h720.resolution },
    });
    for (const track of tracks) {
      if (track.kind === Track.Kind.Video) {
        await room.localParticipant.publishTrack(track, simulcastPublishOptions("camera"));
        track.attach(els.localVideo);
      } else {
        await room.localParticipant.publishTrack(track, { name: "mic" });
      }
    }
    setPublishedStream(tracks.map((tr) => tr.mediaStreamTrack));
    setStatus(`connected — ${roomName} (camera, layers=${layerCount()})`);
    if (els.hqRec?.checked) await window.__startHqRec();
  } else if (mode === "file") {
    await publishFileTrack("/media/take4-raw.webm");
    setStatus(`connected — ${roomName} (file, layers=${layerCount()})`);
    if (els.hqRec?.checked) await window.__startHqRec();
  } else if (mode === "canvas") {
    await publishCanvasTrack();
    setStatus(`connected — ${roomName} (canvas, layers=${layerCount()})`);
    if (els.hqRec?.checked) await window.__startHqRec();
  } else {
    setStatus(`connected — ${roomName} (subscribe-only, no publish)`);
  }

  for (const p of room.remoteParticipants.values()) {
    for (const pub of p.trackPublications.values()) {
      if (pub.track) attachRemoteTrack(pub.track, p.identity);
    }
  }

  els.leave.disabled = false;
  startStatsPolling();
}

async function leaveRoom() {
  stopStatsPolling();
  stopCanvas();
  stopFile();
  if (s4Handle) { try { await window.__stopHqRec(); } catch {} }
  window.__publishedStream = null;
  if (window.__unlockTrack) { window.__unlockTrack.stop(); window.__unlockTrack = null; }
  byteSnapshots.clear();
  clearStatsTable();
  removeAllRemoteTiles();
  els.localVideo.srcObject = null;

  if (room) {
    await room.disconnect();
    room = null;
  }
  window.__lkRoom = null;

  setStatus("disconnected");
  els.join.disabled = false;
  els.leave.disabled = true;
}



/** @type {HTMLVideoElement | null} */
let fileVideoEl = null;

async function publishFileTrack(src) {
  stopFile();
  const video = document.createElement("video");
  video.src = src;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  video.style.display = "none";
  document.body.appendChild(video);
  fileVideoEl = video;
  await new Promise((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error(`file media failed: ${src}`));
  });
  await video.play();
  const vTrack = video.captureStream().getVideoTracks()[0];
  if (!vTrack) throw new Error("no video from file CaptureStream");

  const audioUrl = "/media/take4-20s.wav";
  const audioEl = document.createElement("audio");
  audioEl.src = audioUrl;
  audioEl.loop = true;
  audioEl.crossOrigin = "anonymous";
  audioEl.style.display = "none";
  document.body.appendChild(audioEl);
  window.__fileAudioEl = audioEl;
  await new Promise((resolve, reject) => {
    audioEl.onloadeddata = () => resolve();
    audioEl.onerror = () => reject(new Error(`WAV failed: ${audioUrl}`));
  });
  await audioEl.play();
  let aTrack = typeof audioEl.captureStream === "function"
    ? audioEl.captureStream().getAudioTracks()[0]
    : null;
  if (!aTrack) {
    video.muted = false;
    aTrack = video.captureStream().getAudioTracks()[0] || null;
  }

  const localV = new LocalVideoTrack(vTrack, undefined, false);
  await room.localParticipant.publishTrack(localV, simulcastPublishOptions("file-take4"));
  localV.attach(els.localVideo);
  if (aTrack) await room.localParticipant.publishTrack(aTrack, { name: "file-take4-wav-audio" });
  setPublishedStream([vTrack, aTrack]);
  console.log("[file-publish] layers=", layerCount());
}

/** Pin all remote video publications to LOW|MEDIUM|HIGH (needs ?adaptive=0). */
window.__pinLayer = function __pinLayer(q = "HIGH") {
  if (!room) return 0;
  let n = 0;
  for (const p of room.remoteParticipants.values()) {
    for (const pub of p.trackPublications.values()) {
      if (pub.kind === Track.Kind.Video && typeof pub.setVideoQuality === "function") {
        pub.setVideoQuality(VideoQuality[q] ?? VideoQuality.HIGH);
        n++;
      }
    }
  }
  return n;
};

// --- Subscriber-side rec of the RECEIVED video track (for tools/distinct_fps.py) ---
/** @type {MediaRecorder | null} */
let subRec = null;
/** @type {Blob[]} */
let subChunks = [];
window.__startSubRec = function __startSubRec(opts = {}) {
  if (subRec && subRec.state !== "inactive") return { ok: true, already: true };
  let mst = null, from = null;
  for (const p of room?.remoteParticipants.values() ?? []) {
    for (const pub of p.trackPublications.values()) {
      if (pub.kind === Track.Kind.Video && pub.track?.mediaStreamTrack) { mst = pub.track.mediaStreamTrack; from = p.identity; break; }
    }
    if (mst) break;
  }
  if (!mst) return { ok: false, error: "no received video track" };
  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp8") ? "video/webm;codecs=vp8" : "video/webm";
  subChunks = [];
  subRec = new MediaRecorder(new MediaStream([mst]), { mimeType: mime, videoBitsPerSecond: opts.vBitrate ?? 2_500_000 });
  subRec.ondataavailable = (e) => { if (e.data?.size) subChunks.push(e.data); };
  subRec.start(1000);
  const s = mst.getSettings?.() ?? {};
  return { ok: true, mime, from, settings: { width: s.width ?? null, height: s.height ?? null, frameRate: s.frameRate ?? null } };
};
/** Stops and triggers a browser download named `filename` (runner saves it via Playwright download event). */
window.__stopSubRec = function __stopSubRec(filename = "sub-rx.webm") {
  return new Promise((resolve) => {
    if (!subRec || subRec.state === "inactive") { resolve({ ok: false, error: "not recording" }); return; }
    subRec.onstop = () => {
      const blob = new Blob(subChunks, { type: subRec.mimeType || "video/webm" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      subRec = null;
      resolve({ ok: true, bytes: blob.size, chunks: subChunks.length });
    };
    subRec.stop();
  });
};

function stopFile() {
  if (fileVideoEl) {
    try { fileVideoEl.pause(); } catch {}
    try { fileVideoEl.removeAttribute("src"); fileVideoEl.load(); } catch {}
    fileVideoEl.remove();
    fileVideoEl = null;
  }
  if (window.__fileAudioEl) {
    try { window.__fileAudioEl.pause(); } catch {}
    try { window.__fileAudioEl.removeAttribute("src"); window.__fileAudioEl.load(); } catch {}
    window.__fileAudioEl.remove();
    window.__fileAudioEl = null;
  }
}

async function publishCanvasTrack() {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");

  const draw = (t) => {
    const hue = (t / 40) % 360;
    ctx.fillStyle = `hsl(${hue} 55% 18%)`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#e8eaed";
    ctx.font = "48px system-ui,sans-serif";
    ctx.fillText("S1 canvas smoke (no cam)", 48, 120);
    ctx.font = "28px system-ui,sans-serif";
    ctx.fillText(new Date().toISOString(), 48, 180);
    ctx.fillText(`identity: ${room?.localParticipant?.identity ?? "?"}`, 48, 220);
    canvasAnim = requestAnimationFrame(draw);
  };
  canvasAnim = requestAnimationFrame(draw);

  const stream = canvas.captureStream(15);
  canvasVideoTrack = stream.getVideoTracks()[0];
  const local = new LocalVideoTrack(canvasVideoTrack, undefined, false);
  await room.localParticipant.publishTrack(local, simulcastPublishOptions("canvas-smoke"));
  local.attach(els.localVideo);
  setPublishedStream([canvasVideoTrack]);
}

function stopCanvas() {
  if (canvasAnim != null) {
    cancelAnimationFrame(canvasAnim);
    canvasAnim = null;
  }
  if (canvasVideoTrack) {
    canvasVideoTrack.stop();
    canvasVideoTrack = null;
  }
}

async function fetchToken(roomName, identity) {
  const q = new URLSearchParams({ room: roomName, identity });
  const res = await fetch(`/api/token?${q}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `token HTTP ${res.status}`);
  }
  return res.json();
}

function attachRemoteTrack(track, identity) {
  if (track.kind !== Track.Kind.Video && track.kind !== Track.Kind.Audio) return;
  if (track.kind === Track.Kind.Audio) {
    const el = track.attach();
    el.style.display = "none";
    document.body.appendChild(el);
    return;
  }

  const tileId = `remote-${identity}-${track.sid ?? track.kind}`;
  if (document.getElementById(tileId)) return;

  const wrap = document.createElement("div");
  wrap.className = "tile";
  wrap.id = tileId;
  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  track.attach(video);
  const label = document.createElement("span");
  label.className = "label";
  label.textContent = identity;
  wrap.append(video, label);
  els.remoteTiles.append(wrap);
}

function detachRemoteTrack(track, identity) {
  track.detach();
  if (track.kind === Track.Kind.Video) {
    const tileId = `remote-${identity}-${track.sid ?? track.kind}`;
    document.getElementById(tileId)?.remove();
  }
}

function removeRemoteTiles(identity) {
  els.remoteTiles.querySelectorAll(".tile").forEach((tile) => {
    if (tile.querySelector(".label")?.textContent === identity) tile.remove();
  });
}

function removeAllRemoteTiles() {
  els.remoteTiles.innerHTML = "";
}

function setStatus(text) {
  els.status.textContent = text;
}

function startStatsPolling() {
  stopStatsPolling();
  statsTimer = setInterval(() => {
    collectStats().catch((e) => console.warn("stats", e));
  }, POLL_MS);
  collectStats().catch(() => {});
}

function stopStatsPolling() {
  if (statsTimer) clearInterval(statsTimer);
  statsTimer = null;
}

async function collectStats() {
  if (!room) return;
  const rows = [];

  const localPubs = room.localParticipant.trackPublications;
  for (const pub of localPubs.values()) {
    const track = pub.track;
    if (!track) continue;
    const metrics = await statsFromLiveKitTrack(track, "out");
    if (metrics) {
      rows.push({
        participant: room.localParticipant.identity,
        track: track.kind,
        dir: "out",
        ...metrics,
      });
    }
  }

  for (const participant of room.remoteParticipants.values()) {
    for (const pub of participant.trackPublications.values()) {
      const track = pub.track;
      if (!track || !pub.isSubscribed) continue;
      const metrics = await statsFromLiveKitTrack(track, "in");
      if (metrics) {
        rows.push({
          participant: participant.identity,
          track: track.kind,
          dir: "in",
          ...metrics,
        });
      }
    }
  }

  renderStatsTable(rows);
}

/**
 * @param {import('livekit-client').Track} track
 * @param {'in' | 'out'} direction
 */
async function statsFromLiveKitTrack(track, direction) {
  if (!track.mediaStreamTrack) return null;
  const report = await getStatsReport(track);
  if (!report) return null;

  const rtp = pickRtpReport(report, direction);
  if (!rtp) return null;

  const key = `${track.sid ?? track.kind}-${direction}`;
  const bytesField = direction === "out" ? "bytesSent" : "bytesReceived";
  const bytes = rtp[bytesField] ?? 0;
  const bitrate = computeBitrate(key, bytes);

  const loss =
    rtp.packetsLost != null && rtp.packetsReceived != null
      ? (rtp.packetsLost / (rtp.packetsLost + rtp.packetsReceived)) * 100
      : rtp.packetsLost != null
        ? Number(rtp.packetsLost)
        : null;

  const jitterMs = rtp.jitter != null ? rtp.jitter * 1000 : null;
  const rttMs = pickRttMs(report);

  const width = rtp.frameWidth ?? null;
  const height = rtp.frameHeight ?? null;
  const fps = rtp.framesPerSecond ?? null;

  return {
    bitrate: bitrate != null ? formatBitrate(bitrate) : "—",
    loss: loss != null ? `${loss.toFixed(2)}%` : "—",
    jitter: jitterMs != null ? jitterMs.toFixed(1) : "—",
    rtt: rttMs != null ? rttMs.toFixed(1) : "—",
    resolution: width && height ? `${width}×${height}` : "—",
    fps: fps != null ? fps.toFixed(1) : "—",
  };
}

async function getStatsReport(track) {
  if (typeof track.getRTCStatsReport === "function") {
    return track.getRTCStatsReport();
  }
  const senderOrReceiver = track.sender ?? track.receiver;
  if (senderOrReceiver?.getStats) {
    return senderOrReceiver.getStats();
  }
  return null;
}

function pickRtpReport(report, direction) {
  const kind = direction === "out" ? "outbound-rtp" : "inbound-rtp";
  const bytesField = direction === "out" ? "bytesSent" : "bytesReceived";
  const candidates = [];
  for (const stat of report.values()) {
    if (stat.type === kind && (stat.kind === "video" || stat.kind === "audio")) {
      candidates.push(stat);
    }
  }
  if (!candidates.length) return null;
  // Prefer active / non-paused simulcast layers (dynacast pauses unused ones → 0 bps).
  candidates.sort((a, b) => {
    const aActive = a.active !== false && !a.ended;
    const bActive = b.active !== false && !b.ended;
    if (aActive !== bActive) return aActive ? -1 : 1;
    const ab = a[bytesField] ?? 0;
    const bb = b[bytesField] ?? 0;
    if (ab !== bb) return bb - ab;
    const af = a.framesPerSecond ?? 0;
    const bf = b.framesPerSecond ?? 0;
    return bf - af;
  });
  return candidates[0];
}

function pickRttMs(report) {
  for (const stat of report.values()) {
    if (stat.type === "candidate-pair" && stat.state === "succeeded" && stat.currentRoundTripTime != null) {
      return stat.currentRoundTripTime * 1000;
    }
    if (stat.type === "remote-inbound-rtp" && stat.roundTripTime != null) {
      return stat.roundTripTime * 1000;
    }
  }
  return null;
}

function computeBitrate(key, bytes) {
  const now = Date.now();
  const prev = byteSnapshots.get(key);
  byteSnapshots.set(key, { bytes, at: now });
  if (!prev) return null;
  const dt = (now - prev.at) / 1000;
  if (dt <= 0) return null;
  const db = bytes - prev.bytes;
  if (db < 0) return null;
  return (8 * db) / dt;
}

function formatBitrate(bps) {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} Kbps`;
  return `${bps.toFixed(0)} bps`;
}

function renderStatsTable(rows) {
  els.statsBody.innerHTML = rows
    .map(
      (r) => `<tr>
      <td>${escapeHtml(r.participant)}</td>
      <td>${escapeHtml(r.track)}</td>
      <td>${r.dir}</td>
      <td>${r.bitrate}</td>
      <td>${r.loss}</td>
      <td>${r.jitter}</td>
      <td>${r.rtt}</td>
      <td>${r.resolution}</td>
      <td>${r.fps}</td>
    </tr>`,
    )
    .join("");
}

function clearStatsTable() {
  els.statsBody.innerHTML = "";
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
