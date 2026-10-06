import AgoraRTC from "https://esm.sh/agora-rtc-sdk-ng@4.23.3";

const POLL_MS = 2000;

const els = {
  channel: document.getElementById("channel"),
  identity: document.getElementById("identity"),
  join: document.getElementById("join"),
  leave: document.getElementById("leave"),
  status: document.getElementById("status"),
  localVideo: document.getElementById("local-video"),
  remoteTiles: document.getElementById("remote-tiles"),
  statsBody: document.querySelector("#stats-table tbody"),
};

/** @type {import('agora-rtc-sdk-ng').IAgoraRTCClient | null} */
let client = null;
/** @type {[import('agora-rtc-sdk-ng').ILocalAudioTrack, import('agora-rtc-sdk-ng').ILocalVideoTrack] | null} */
let localTracks = null;
let localLabel = "";
let localUid = 0;
/** @type {ReturnType<typeof setInterval> | null} */
let statsTimer = null;
const byteSnapshots = new Map();
/** uid -> display */
const remoteLabels = new Map();

els.identity.value = `p-${Math.floor(Math.random() * 900 + 100)}`;

els.join.addEventListener("click", () => {
  joinChannel().catch((e) => {
    console.error(e);
    setStatus(`error: ${e.message ?? e}`);
    els.join.disabled = false;
    void leaveChannel();
  });
});
els.leave.addEventListener("click", () => leaveChannel());

async function joinChannel() {
  if (client) return;
  setStatus("connecting…");
  els.join.disabled = true;

  const channel = els.channel.value.trim() || "s1-lab";
  const identity = els.identity.value.trim() || `lab-${Date.now()}`;

  const q = new URLSearchParams({ channel, identity });
  const res = await fetch(`/api/join?${q}`);
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error ?? `join HTTP ${res.status}`);

  localLabel = identity;
  localUid = payload.uid;

  client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
  client.on("user-published", onUserPublished);
  client.on("user-unpublished", onUserUnpublished);
  client.on("user-left", onUserLeft);

  await client.join(payload.appId, payload.channel, payload.token, payload.uid);

  localTracks = await AgoraRTC.createMicrophoneAndCameraTracks(
    {},
    {
      encoderConfig: {
        width: 1280,
        height: 720,
        frameRate: 30,
        bitrateMax: 2000,
      },
    },
  );

  localTracks[1].play(els.localVideo, { mirror: true });
  await client.publish(localTracks);

  setStatus(`connected — ${channel} (uid ${payload.uid})`);
  els.leave.disabled = false;
  startStatsPolling();
}

async function leaveChannel() {
  stopStatsPolling();
  byteSnapshots.clear();
  clearStatsTable();
  els.remoteTiles.innerHTML = "";
  remoteLabels.clear();

  if (localTracks) {
    localTracks[0].close();
    localTracks[1].close();
    localTracks = null;
  }
  els.localVideo.innerHTML = "";

  if (client) {
    await client.leave();
    client.removeAllListeners();
    client = null;
  }

  setStatus("disconnected");
  els.join.disabled = false;
  els.leave.disabled = true;
}

async function onUserPublished(user, mediaType) {
  if (!client) return;
  await client.subscribe(user, mediaType);
  remoteLabels.set(user.uid, `uid-${user.uid}`);

  if (mediaType === "video") {
    const tileId = `remote-${user.uid}`;
    if (document.getElementById(tileId)) return;
    const wrap = document.createElement("div");
    wrap.className = "tile";
    wrap.id = tileId;
    const host = document.createElement("div");
    host.className = "video-host";
    const cap = document.createElement("span");
    cap.className = "label";
    cap.textContent = remoteLabels.get(user.uid) ?? String(user.uid);
    wrap.append(host, cap);
    els.remoteTiles.append(wrap);
    user.videoTrack?.play(host);
  }
  if (mediaType === "audio") {
    user.audioTrack?.play();
  }
}

function onUserUnpublished(user, mediaType) {
  if (mediaType === "video") {
    document.getElementById(`remote-${user.uid}`)?.remove();
  }
}

function onUserLeft(user) {
  document.getElementById(`remote-${user.uid}`)?.remove();
  remoteLabels.delete(user.uid);
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
  if (!client) return;
  const rows = [];
  const rtc = await client.getRTCStats();
  const rttMs = rtc?.RTT ?? rtc?.rtt ?? null;

  const localVideoStats = client.getLocalVideoStats();
  for (const stat of Object.values(localVideoStats)) {
    rows.push({
      participant: localLabel || String(localUid),
      track: "video",
      dir: "out",
      ...agoraVideoOut(stat, rttMs),
    });
  }

  const localAudioStats = client.getLocalAudioStats();
  for (const stat of Object.values(localAudioStats)) {
    rows.push({
      participant: localLabel || String(localUid),
      track: "audio",
      dir: "out",
      ...agoraAudioOut(stat, rttMs),
    });
  }

  const remoteVideoStats = client.getRemoteVideoStats();
  for (const [uid, stat] of Object.entries(remoteVideoStats)) {
    const label = remoteLabels.get(Number(uid)) ?? `uid-${uid}`;
    rows.push({
      participant: label,
      track: "video",
      dir: "in",
      ...agoraVideoIn(stat, rttMs),
    });
  }

  const remoteAudioStats = client.getRemoteAudioStats();
  for (const [uid, stat] of Object.entries(remoteAudioStats)) {
    const label = remoteLabels.get(Number(uid)) ?? `uid-${uid}`;
    rows.push({
      participant: label,
      track: "audio",
      dir: "in",
      ...agoraAudioIn(stat, rttMs),
    });
  }

  if (localTracks?.[1]) {
    const webrtc = await statsFromMediaStreamTrack(localTracks[1].getMediaStreamTrack(), "out");
    if (webrtc && rows[0]) {
      rows[0] = { ...rows[0], ...preferWebrtcVideo(rows[0], webrtc) };
    }
  }

  renderStatsTable(rows);
}

function agoraVideoOut(stat, rttMs) {
  return {
    bitrate: stat.sendBitrate != null ? formatBitrate(stat.sendBitrate) : "—",
    loss: stat.sendPacketsLost != null ? `${stat.sendPacketsLost}` : "—",
    jitter: "—",
    rtt: rttMs != null ? Number(rttMs).toFixed(1) : "—",
    resolution:
      stat.sendResolutionWidth && stat.sendResolutionHeight
        ? `${stat.sendResolutionWidth}×${stat.sendResolutionHeight}`
        : "—",
    fps: stat.sendFrameRate != null ? Number(stat.sendFrameRate).toFixed(1) : "—",
  };
}

function agoraVideoIn(stat, rttMs) {
  return {
    bitrate: stat.receiveBitrate != null ? formatBitrate(stat.receiveBitrate) : "—",
    loss: stat.receivePacketsLost != null ? `${stat.receivePacketsLost}` : "—",
    jitter: "—",
    rtt: rttMs != null ? Number(rttMs).toFixed(1) : "—",
    resolution:
      stat.receiveResolutionWidth && stat.receiveResolutionHeight
        ? `${stat.receiveResolutionWidth}×${stat.receiveResolutionHeight}`
        : "—",
    fps: stat.receiveFrameRate != null ? Number(stat.receiveFrameRate).toFixed(1) : "—",
  };
}

function agoraAudioOut(stat, rttMs) {
  return {
    bitrate: stat.sendBitrate != null ? formatBitrate(stat.sendBitrate) : "—",
    loss: stat.sendPacketsLost != null ? `${stat.sendPacketsLost}` : "—",
    jitter: "—",
    rtt: rttMs != null ? Number(rttMs).toFixed(1) : "—",
    resolution: "—",
    fps: "—",
  };
}

function agoraAudioIn(stat, rttMs) {
  return {
    bitrate: stat.receiveBitrate != null ? formatBitrate(stat.receiveBitrate) : "—",
    loss: stat.receivePacketsLost != null ? `${stat.receivePacketsLost}` : "—",
    jitter: "—",
    rtt: rttMs != null ? Number(rttMs).toFixed(1) : "—",
    resolution: "—",
    fps: "—",
  };
}

function preferWebrtcVideo(agoraRow, webrtc) {
  return {
    bitrate: agoraRow.bitrate !== "—" ? agoraRow.bitrate : webrtc.bitrate,
    loss: agoraRow.loss !== "—" ? agoraRow.loss : webrtc.loss,
    jitter: webrtc.jitter,
    rtt: agoraRow.rtt !== "—" ? agoraRow.rtt : webrtc.rtt,
    resolution: agoraRow.resolution !== "—" ? agoraRow.resolution : webrtc.resolution,
    fps: agoraRow.fps !== "—" ? agoraRow.fps : webrtc.fps,
  };
}

async function statsFromMediaStreamTrack(mediaTrack, direction) {
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

  return {
    bitrate: bitrate != null ? formatBitrate(bitrate) : "—",
    loss: loss != null ? `${loss.toFixed(2)}%` : "—",
    jitter: jitterMs != null ? jitterMs.toFixed(1) : "—",
    rtt: rttMs != null ? rttMs.toFixed(1) : "—",
    resolution:
      rtp.frameWidth && rtp.frameHeight ? `${rtp.frameWidth}×${rtp.frameHeight}` : "—",
    fps: rtp.framesPerSecond != null ? rtp.framesPerSecond.toFixed(1) : "—",
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
