import {
  Room,
  RoomEvent,
  Track,
  LocalVideoTrack,
  createLocalTracks,
  VideoPresets,
} from "https://esm.sh/livekit-client@2.9.1";

const POLL_MS = 2000;

const els = {
  room: document.getElementById("room"),
  identity: document.getElementById("identity"),
  mediaMode: document.getElementById("media-mode"),
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
    adaptiveStream: true,
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
  setStatus(`connected — ${roomName}`);

  const mode = els.mediaMode?.value ?? "canvas";
  if (mode === "camera") {
    const tracks = await createLocalTracks({
      audio: true,
      video: { resolution: VideoPresets.h720.resolution },
    });
    for (const track of tracks) {
      await room.localParticipant.publishTrack(track);
      if (track.kind === Track.Kind.Video) track.attach(els.localVideo);
    }
    setStatus(`connected — ${roomName} (camera)`);
  } else if (mode === "canvas") {
    await publishCanvasTrack();
    setStatus(`connected — ${roomName} (canvas, no cam)`);
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
  byteSnapshots.clear();
  clearStatsTable();
  removeAllRemoteTiles();
  els.localVideo.srcObject = null;

  if (room) {
    await room.disconnect();
    room = null;
  }

  setStatus("disconnected");
  els.join.disabled = false;
  els.leave.disabled = true;
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
  await room.localParticipant.publishTrack(local, { name: "canvas-smoke" });
  local.attach(els.localVideo);
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
  for (const stat of report.values()) {
    if (stat.type === kind && (stat.kind === "video" || stat.kind === "audio")) {
      return stat;
    }
  }
  return null;
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
