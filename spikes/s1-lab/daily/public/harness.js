import Daily from "https://esm.sh/@daily-co/daily-js@0.74.0";

const POLL_MS = 2000;

const els = {
  room: document.getElementById("room"),
  identity: document.getElementById("identity"),
  join: document.getElementById("join"),
  leave: document.getElementById("leave"),
  status: document.getElementById("status"),
  localVideo: document.getElementById("local-video"),
  remoteTiles: document.getElementById("remote-tiles"),
  statsBody: document.querySelector("#stats-table tbody"),
};

/** @type {ReturnType<Daily['createCallObject']> | null} */
let call = null;
/** @type {ReturnType<typeof setInterval> | null} */
let statsTimer = null;
const byteSnapshots = new Map();
const remoteTileIds = new Map();

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
  if (call) return;
  setStatus("connecting…");
  els.join.disabled = true;

  const roomName = els.room.value.trim() || "s1-lab";
  const userName = els.identity.value.trim() || `lab-${Date.now()}`;

  const q = new URLSearchParams({ room: roomName, userName });
  const res = await fetch(`/api/join?${q}`);
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error ?? `join HTTP ${res.status}`);

  call = Daily.createCallObject({ subscribeToTracksAutomatically: true });

  call.on("track-started", onTrackStarted);
  call.on("track-stopped", onTrackStopped);
  call.on("participant-left", onParticipantLeft);
  call.on("left-meeting", () => setStatus("disconnected"));

  await call.join({ url: payload.roomUrl, userName });
  await call.setLocalVideo(true);
  await call.setLocalAudio(true);

  attachLocalVideo();
  syncRemoteTiles();

  setStatus(`connected — ${roomName}`);
  els.leave.disabled = false;
  startStatsPolling();
}

async function leaveRoom() {
  stopStatsPolling();
  byteSnapshots.clear();
  clearStatsTable();
  els.remoteTiles.innerHTML = "";
  remoteTileIds.clear();
  els.localVideo.srcObject = null;

  if (call) {
    await call.leave();
    call.destroy();
    call = null;
  }

  setStatus("disconnected");
  els.join.disabled = false;
  els.leave.disabled = true;
}

function onTrackStarted(ev) {
  if (!call || ev.participant?.local) {
    attachLocalVideo();
    return;
  }
  if (ev.track?.kind === "video") attachRemoteVideo(ev.participant.session_id, ev.participant.user_name, ev.track);
  if (ev.track?.kind === "audio" && !ev.participant.local) {
    const el = ev.track.attach();
    el.style.display = "none";
    document.body.appendChild(el);
  }
}

function onTrackStopped(ev) {
  if (ev.participant?.local) return;
  if (ev.track?.kind === "video") {
    const id = remoteTileIds.get(ev.participant.session_id);
    document.getElementById(id)?.remove();
    remoteTileIds.delete(ev.participant.session_id);
  }
}

function onParticipantLeft(ev) {
  const id = remoteTileIds.get(ev.participant.session_id);
  document.getElementById(id)?.remove();
  remoteTileIds.delete(ev.participant.session_id);
}

function attachLocalVideo() {
  if (!call) return;
  const videoTrack = call.participants()?.local?.tracks?.video?.persistentTrack;
  if (!videoTrack) return;
  const stream = new MediaStream([videoTrack]);
  els.localVideo.srcObject = stream;
}

function syncRemoteTiles() {
  if (!call) return;
  const participants = call.participants();
  for (const p of Object.values(participants)) {
    if (p.local) continue;
    const track = p.tracks?.video?.persistentTrack;
    if (track) attachRemoteVideo(p.session_id, p.user_name ?? p.session_id, track);
  }
}

function attachRemoteVideo(sessionId, label, track) {
  const tileId = `remote-${sessionId}`;
  if (document.getElementById(tileId)) return;
  remoteTileIds.set(sessionId, tileId);
  const wrap = document.createElement("div");
  wrap.className = "tile";
  wrap.id = tileId;
  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  const stream = new MediaStream([track]);
  video.srcObject = stream;
  const cap = document.createElement("span");
  cap.className = "label";
  cap.textContent = label ?? sessionId;
  wrap.append(video, cap);
  els.remoteTiles.append(wrap);
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
  if (!call) return;
  const rows = [];

  const network = await call.getNetworkStats();
  const latest = network?.stats?.latest ?? {};

  const participants = call.participants();
  for (const p of Object.values(participants)) {
    const name = p.user_name ?? (p.local ? "local" : p.session_id);
    const peerStats = latest[p.session_id];

    if (p.tracks?.video?.persistentTrack) {
      const webrtc = await statsFromMediaTrack(p.tracks.video.persistentTrack, p.local ? "out" : "in");
      const fromDaily = dailyVideoMetrics(peerStats, p.local);
      rows.push({
        participant: name,
        track: "video",
        dir: p.local ? "out" : "in",
        ...mergeMetrics(fromDaily, webrtc),
      });
    }

    if (p.tracks?.audio?.persistentTrack) {
      const webrtc = await statsFromMediaTrack(p.tracks.audio.persistentTrack, p.local ? "out" : "in");
      rows.push({
        participant: name,
        track: "audio",
        dir: p.local ? "out" : "in",
        ...mergeMetrics(dailyAudioMetrics(peerStats, p.local), webrtc),
      });
    }
  }

  renderStatsTable(rows);
}

function dailyVideoMetrics(peerStats, isLocal) {
  if (!peerStats) return emptyMetrics();
  const rttMs = peerStats.networkRoundTripTime != null ? peerStats.networkRoundTripTime * 1000 : null;
  const bitrateBps = isLocal
    ? peerStats.videoSendBitsPerSecond ?? peerStats.sendBitsPerSecond
    : peerStats.videoRecvBitsPerSecond ?? peerStats.recvBitsPerSecond;
  const loss = isLocal ? peerStats.videoSendPacketLoss : peerStats.videoRecvPacketLoss;
  return {
    bitrate: bitrateBps != null ? formatBitrate(Number(bitrateBps)) : "—",
    loss: loss != null ? `${(Number(loss) * 100).toFixed(2)}%` : "—",
    jitter: "—",
    rtt: rttMs != null ? rttMs.toFixed(1) : "—",
    resolution: "—",
    fps: "—",
  };
}

function dailyAudioMetrics(peerStats, isLocal) {
  if (!peerStats) return emptyMetrics();
  const rttMs = peerStats.networkRoundTripTime != null ? peerStats.networkRoundTripTime * 1000 : null;
  const bitrateBps = isLocal
    ? peerStats.audioSendBitsPerSecond ?? peerStats.sendBitsPerSecond
    : peerStats.audioRecvBitsPerSecond ?? peerStats.recvBitsPerSecond;
  const loss = isLocal ? peerStats.audioSendPacketLoss : peerStats.audioRecvPacketLoss;
  return {
    bitrate: bitrateBps != null ? formatBitrate(Number(bitrateBps)) : "—",
    loss: loss != null ? `${(Number(loss) * 100).toFixed(2)}%` : "—",
    jitter: "—",
    rtt: rttMs != null ? rttMs.toFixed(1) : "—",
    resolution: "—",
    fps: "—",
  };
}

function mergeMetrics(primary, webrtc) {
  if (!webrtc) return primary;
  return {
    bitrate: primary.bitrate !== "—" ? primary.bitrate : webrtc.bitrate,
    loss: primary.loss !== "—" ? primary.loss : webrtc.loss,
    jitter: webrtc.jitter !== "—" ? webrtc.jitter : primary.jitter,
    rtt: primary.rtt !== "—" ? primary.rtt : webrtc.rtt,
    resolution: webrtc.resolution !== "—" ? webrtc.resolution : primary.resolution,
    fps: webrtc.fps !== "—" ? webrtc.fps : primary.fps,
  };
}

function emptyMetrics() {
  return {
    bitrate: "—",
    loss: "—",
    jitter: "—",
    rtt: "—",
    resolution: "—",
    fps: "—",
  };
}

async function statsFromMediaTrack(mediaTrack, direction) {
  if (!mediaTrack?.getStats) return null;
  const report = await mediaTrack.getStats();
  const rtp = pickRtpReport(report, direction);
  if (!rtp) return null;

  const key = `${mediaTrack.id}-${direction}`;
  const bytesField = direction === "out" ? "bytesSent" : "bytesReceived";
  const bitrate = computeBitrate(key, rtp[bytesField] ?? 0);

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

function pickRtpReport(report, direction) {
  const kind = direction === "out" ? "outbound-rtp" : "inbound-rtp";
  for (const stat of report.values()) {
    if (stat.type === kind && (stat.kind === "video" || stat.kind === "audio")) return stat;
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
