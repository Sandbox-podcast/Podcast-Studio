// S1 LAN pub2 sampler (classic script, loaded BEFORE the harness module so the RTCPeerConnection hook is in place).
// ?autojoin=1 clicks Join once the harness is ready; every ?sampleMs (2000) posts the publisher's own getStats to
// /api/sample: outbound-rtp video per rid (framesEncoded/framesSent/QLR/encoder), media-source video, selected ICE pair.
(() => {
  const Orig = window.RTCPeerConnection;
  window.__pcs = [];
  window.RTCPeerConnection = function (...a) { const pc = new Orig(...a); window.__pcs.push(pc); return pc; };
  window.RTCPeerConnection.prototype = Orig.prototype;
  Object.setPrototypeOf(window.RTCPeerConnection, Orig);
  const q = new URLSearchParams(location.search);
  const SAMPLE_MS = Number(q.get("sampleMs") ?? 2000);
  const post = (path, o) => fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(o), keepalive: true }).catch(() => {});
  const ev = (type, extra = {}) => post("/api/log", { at: new Date().toISOString(), ms: Date.now(), type, status: document.querySelector("#status")?.textContent ?? null, ...extra });
  window.addEventListener("error", (e) => ev("error", { msg: String(e.message) }));
  window.addEventListener("unhandledrejection", (e) => ev("rejection", { msg: String(e.reason?.message ?? e.reason) }));
  async function sample() {
    const out = [], src = [], ice = [];
    let pci = 0;
    for (const pc of window.__pcs) {
      pci++;
      if (pc.connectionState === "closed") continue;
      const rep = await pc.getStats();
      let selId = null;
      for (const s of rep.values()) if (s.type === "transport" && s.selectedCandidatePairId) selId = s.selectedCandidatePairId;
      for (const s of rep.values()) {
        if (s.type === "outbound-rtp" && s.kind === "video") out.push({ pc: pci, rid: s.rid ?? null, ssrc: s.ssrc, w: s.frameWidth ?? null, h: s.frameHeight ?? null,
          fps: s.framesPerSecond ?? null, bytesSent: s.bytesSent, framesSent: s.framesSent, framesEncoded: s.framesEncoded ?? null,
          totalEncodeTime: s.totalEncodeTime ?? null, keyFramesEncoded: s.keyFramesEncoded ?? null, active: s.active ?? null,
          qlr: s.qualityLimitationReason ?? null, qlrDurations: s.qualityLimitationDurations ?? null, qlrResChanges: s.qualityLimitationResolutionChanges ?? null,
          encoderImplementation: s.encoderImplementation ?? null, powerEfficientEncoder: s.powerEfficientEncoder ?? null, scalabilityMode: s.scalabilityMode ?? null,
          targetBitrate: s.targetBitrate ?? null, codec: rep.get(s.codecId)?.mimeType ?? null, srcId: s.mediaSourceId ? `pc${pci}:${s.mediaSourceId}` : null, ts: s.timestamp });
        if (s.type === "media-source" && s.kind === "video") src.push({ id: `pc${pci}:${s.id}`, fps: s.framesPerSecond ?? null, frames: s.frames ?? null, w: s.width ?? null, h: s.height ?? null, ts: s.timestamp });
        if (s.type === "candidate-pair" && (s.id === selId || (!selId && s.nominated && s.state === "succeeded"))) {
          const l = rep.get(s.localCandidateId) ?? {}, r = rep.get(s.remoteCandidateId) ?? {};
          ice.push({ pc: pci, state: s.state, rttMs: s.currentRoundTripTime != null ? s.currentRoundTripTime * 1000 : null,
            local: { type: l.candidateType, protocol: l.protocol, address: l.address ?? l.ip, port: l.port, relayProtocol: l.relayProtocol ?? null, networkType: l.networkType ?? null },
            remote: { type: r.candidateType, protocol: r.protocol, address: r.address ?? r.ip, port: r.port } });
        }
      }
    }
    post("/api/sample", { at: new Date().toISOString(), ms: Date.now(), status: document.querySelector("#status")?.textContent ?? null, out, src, ice });
  }
  window.addEventListener("load", () => {
    ev("load", { href: location.href });
    if (q.get("autojoin") === "1") {
      const tryJoin = () => { const b = document.querySelector("#join"); if (b && !b.disabled) { b.click(); ev("join-click"); } else setTimeout(tryJoin, 300); };
      setTimeout(tryJoin, 800);
    }
    setInterval(() => { sample().catch((e) => ev("sample-error", { msg: String(e?.message ?? e) })); }, SAMPLE_MS);
  });
})();
