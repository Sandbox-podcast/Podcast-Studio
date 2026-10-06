/**
 * S4 spike — WebCodecs + fragmented MP4 recorder (localhost / headless / synthetic).
 * canvas 1920x1080@30 captureStream + WebAudio oscillator
 *   → MediaStreamTrackProcessor → VideoEncoder (avc1 if supported else vp9) + AudioEncoder (mp4a if supported else opus)
 *   → mediabunny Mp4OutputFormat({fastStart:'fragmented'}) → StreamTarget
 *   → group writes into ≥5 MiB parts → presigned multipart PUT to MinIO while recording.
 * Main-thread sketch (no worker), in-memory part buffer (no OPFS) — see RESULT.md.
 */
import { Output, Mp4OutputFormat, StreamTarget, EncodedVideoPacketSource, EncodedAudioPacketSource, EncodedPacket } from 'mediabunny';

const W = 1920, H = 1080, FPS = 30;
const PART_SIZE = 5 * 1024 * 1024;
const KEYFRAME_EVERY = 2 * FPS;         // forced keyframe every 2 s → fragment boundaries
const MAX_ENCODE_QUEUE = 10;            // drop frames (and count them) if the encoder falls behind
const log = (...a) => console.log('[s4wc]', ...a);

// ---------- synthetic source (same scene/audio as ../s4-lab/public/recorder.js for comparability) ----------
function createSyntheticStream(canvas, marker = false) {
  // marker mode (A/V sync check): every 2 s, a 100 ms white full-frame flash + a 100 ms 1 kHz beep scheduled at the same instant; silence otherwise
  let lastMark = -1, flashUntil = -1, ac, gain;
  const ctx = canvas.getContext('2d', { alpha: false });
  let frame = 0, raf = 0; const t0 = performance.now();
  function draw() {
    frame++; const t = (performance.now() - t0) / 1000;
    if (marker && Math.floor(t / 2) !== lastMark && t > 1) {
      lastMark = Math.floor(t / 2); flashUntil = t + 0.1;
      const now = ac.currentTime; gain.gain.setValueAtTime(0.5, now); gain.gain.setValueAtTime(0, now + 0.1);
      (window.__s4wc.marks ||= []).push(+t.toFixed(3));
    }
    if (marker && t < flashUntil) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); raf = requestAnimationFrame(draw); return; }
    ctx.fillStyle = `hsl(${(t * 40) % 360} 40% 18%)`; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) {
      const x = (Math.sin(t * 1.7 + i) * 0.4 + 0.5) * W, y = (Math.cos(t * 1.3 + i * 0.7) * 0.4 + 0.5) * H;
      ctx.fillStyle = `hsl(${(i * 9 + t * 80) % 360} 80% 55%)`; ctx.beginPath(); ctx.arc(x, y, 18 + (i % 7) * 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#fff'; ctx.font = '48px monospace'; ctx.fillText(`S4 ${t.toFixed(3)}s f=${frame}`, 40, 80);
    for (let x = 0; x < W; x += 8) {
      const n = (Math.sin(x * 0.05 + t * 20) * 0.5 + 0.5) * 80;
      ctx.fillStyle = `rgb(${n | 0},${(255 - n) | 0},${(x + frame) % 255})`; ctx.fillRect(x, H - 120, 6, 100);
    }
    raf = requestAnimationFrame(draw);
  }
  draw();
  const vs = canvas.captureStream(FPS);
  ac = new AudioContext({ sampleRate: 48000 });
  const osc = ac.createOscillator(); osc.type = marker ? 'sine' : 'sawtooth'; osc.frequency.value = marker ? 1000 : 440;
  gain = ac.createGain(); gain.gain.value = marker ? 0 : 0.15;
  const dest = ac.createMediaStreamDestination(); osc.connect(gain).connect(dest);
  const lfo = ac.createOscillator(); lfo.frequency.value = 0.25; const lg = ac.createGain(); lg.gain.value = marker ? 0 : 80; lfo.connect(lg).connect(osc.frequency);
  osc.start(); lfo.start();
  return {
    videoTrack: vs.getVideoTracks()[0], audioTrack: dest.stream.getAudioTracks()[0],
    stop() { cancelAnimationFrame(raf); try { osc.stop(); lfo.stop(); ac.close(); } catch (_) {} vs.getTracks().forEach((t) => t.stop()); dest.stream.getTracks().forEach((t) => t.stop()); },
  };
}

// ---------- codec choice ----------
async function pickVideoConfig(bitrate, prefer) {
  const cands = [
    { codec: 'avc1.640028', mb: 'avc', avc: { format: 'avc' } },   // High 4.0
    { codec: 'avc1.4D4028', mb: 'avc', avc: { format: 'avc' } },   // Main 4.0
    { codec: 'avc1.42E028', mb: 'avc', avc: { format: 'avc' } },   // Baseline 4.0
    { codec: 'vp09.00.40.08', mb: 'vp9' },
  ].filter((c) => !prefer || c.mb === prefer);
  for (const c of cands) {
    for (const hw of ['prefer-hardware', 'no-preference']) {
      const cfg = { codec: c.codec, width: W, height: H, framerate: FPS, bitrate, bitrateMode: 'variable', latencyMode: 'realtime', hardwareAcceleration: hw };
      if (c.avc) cfg.avc = c.avc;
      const s = await VideoEncoder.isConfigSupported(cfg);
      if (s.supported) return { config: s.config, mbCodec: c.mb };
    }
  }
  throw new Error('no supported video codec');
}
async function pickAudioConfig(sampleRate, numberOfChannels) {
  for (const c of [{ codec: 'mp4a.40.2', mb: 'aac' }, { codec: 'opus', mb: 'opus' }]) {
    const s = await AudioEncoder.isConfigSupported({ codec: c.codec, sampleRate, numberOfChannels, bitrate: 128000 });
    if (s.supported) return { config: s.config, mbCodec: c.mb };
  }
  throw new Error('no supported audio codec');
}

// ---------- presigned multipart uploader (pattern from ../s4-lab) ----------
class Uploader {
  constructor(filename) { this.filename = filename; this.parts = []; this.queue = []; this.busy = false; this.events = []; }
  async create() {
    const r = await fetch('/api/multipart/create', { method: 'POST', body: JSON.stringify({ filename: this.filename, contentType: 'video/mp4' }) }).then((x) => x.json());
    this.key = r.key; this.uploadId = r.uploadId; return r;
  }
  enqueue(partNumber, blob, meta) { this.queue.push({ partNumber, blob, meta }); this.pump(); }
  async pump() {
    if (this.busy) return; this.busy = true;
    while (this.queue.length) {
      const job = this.queue[0];
      for (let attempt = 1; ; attempt++) {
        try {
          const t0 = performance.now();
          const { url } = await fetch('/api/multipart/presign-part', { method: 'POST', body: JSON.stringify({ key: this.key, uploadId: this.uploadId, partNumber: job.partNumber }) }).then((x) => x.json());
          const r = await fetch(url, { method: 'PUT', body: job.blob });
          if (!r.ok) throw new Error('PUT ' + r.status);
          const etag = r.headers.get('ETag');
          this.parts.push({ PartNumber: job.partNumber, ETag: etag, Size: job.blob.size, putMs: +(performance.now() - t0).toFixed(1), attempt, uploadedAtRecMs: +(performance.now() - window.__s4wc.recStartPerf).toFixed(0), ...job.meta });
          log('part', job.partNumber, job.blob.size, 'B uploaded at rec+', this.parts.at(-1).uploadedAtRecMs, 'ms');
          break;
        } catch (e) { log('part retry', job.partNumber, String(e)); if (attempt >= 5) throw e; await new Promise((ok) => setTimeout(ok, 500 * attempt)); }
      }
      this.queue.shift();
    }
    this.busy = false; this.idleResolve?.();
  }
  idle() { return this.busy || this.queue.length ? new Promise((ok) => { this.idleResolve = ok; }) : Promise.resolve(); }
  async complete() {
    await this.idle();
    const parts = [...this.parts].sort((a, b) => a.PartNumber - b.PartNumber);
    return fetch('/api/multipart/complete', { method: 'POST', body: JSON.stringify({ key: this.key, uploadId: this.uploadId, parts }) }).then((x) => x.json());
  }
  async abort() { return fetch('/api/multipart/abort', { method: 'POST', body: JSON.stringify({ key: this.key, uploadId: this.uploadId }) }).then((x) => x.json()); }
}

// ---------- main ----------
export async function record({ durationSec = 60, videoBitrate = 4_500_000, prefer = null, marker = false, filename = `wc-${Date.now()}.mp4` } = {}) {
  const S = window.__s4wc; S.status = 'starting';
  const m = S.metrics = {
    framesIn: 0, framesEncodedIn: 0, framesDropped: 0, videoChunksOut: 0, keyframesOut: 0, videoBytes: 0,
    audioDataIn: 0, audioChunksOut: 0, audioBytes: 0, audioDroppedPreT0: 0,
    maxVideoQueue: 0, silenceFilledMs: 0, silenceFills: [], audioInputGaps: [], audioOutputGaps: [], videoInputGapsOver70ms: [], queueSamples: [], fragments: [], writes: 0, nonMonotonicWrites: 0, errors: [],
  };
  const canvas = document.getElementById('c'); canvas.width = W; canvas.height = H;
  const src = createSyntheticStream(canvas, marker);
  const aSettings = src.audioTrack.getSettings();

  const v = await pickVideoConfig(videoBitrate, prefer);
  const a = await pickAudioConfig(48000, 2);
  S.videoConfigRequested = v.config; S.audioConfigRequested = a.config;
  log('video config', JSON.stringify(v.config)); log('audio config', JSON.stringify(a.config), 'track settings', JSON.stringify(aSettings));

  // ---- muxer → parts ----
  const uploader = new Uploader(filename); await uploader.create(); S.key = uploader.key;
  let pending = [], pendingBytes = 0, partNumber = 0, written = 0;
  const localParts = [];
  const cutPart = (final) => {
    if (!pendingBytes || (!final && pendingBytes < PART_SIZE)) return;
    const blob = new Blob(pending, { type: 'video/mp4' }); partNumber++;
    localParts.push(blob);
    uploader.enqueue(partNumber, blob, { cutAtRecMs: +(performance.now() - S.recStartPerf).toFixed(0), fragmentsSoFar: m.fragments.length });
    pending = []; pendingBytes = 0;
  };
  const output = new Output({
    format: new Mp4OutputFormat({
      fastStart: 'fragmented', minimumFragmentDuration: 1,
      onMoof: (_d, position, timestamp) => m.fragments.push({ position, timestamp: +timestamp.toFixed(3) }),
    }),
    target: new StreamTarget(new WritableStream({
      write(chunk) {
        m.writes++;
        if (chunk.position !== written) m.nonMonotonicWrites++;
        written = chunk.position + chunk.data.byteLength;
        pending.push(chunk.data.slice()); pendingBytes += chunk.data.byteLength;
        // only cut at write (box) boundaries → parts end on moof/mdat boundaries
        if (pendingBytes >= PART_SIZE) cutPart(false);
      },
    })),
  });
  const vSource = new EncodedVideoPacketSource(v.mbCodec);
  const aSource = new EncodedAudioPacketSource(a.mbCodec);
  output.addVideoTrack(vSource); // no frameRate: VFR capture; a 1/30 timescale rounded jittery timestamps into duplicate PTS (run 1)
  output.addAudioTrack(aSource);
  await output.start();

  // ---- A/V timebase: we own it. t0 = first video frame timestamp (µs). Audio is aligned by first-sample ARRIVAL time
  // (performance.now()), not by raw timestamps: Chromium 131 puts WebAudio-track timestamps on another clock (Δ ≈ 2.5e5 s),
  // and Chrome 154 timestamps look like the same clock but a flash/beep marker test showed audio landing ~+320 ms late
  // when trusted (run 2). Arrival alignment measured +10 ms (Chromium) — see out/marker-*-avsync.json.
  let t0 = null, firstAudioTs = null, lastVideoTs = 0, lastAudioEnd = 0, audioBase = null, vArrival = null;
  let addChain = Promise.resolve();   // serialize packet adds (mediabunny wants per-track decode order; we keep global order)
  const toPacket = (chunk, base) => {
    const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
    return new EncodedPacket(data, chunk.type, (chunk.timestamp - base) / 1e6, (chunk.duration ?? 0) / 1e6);
  };
  let videoMetaSent = false, audioMetaSent = false, aSamples = 0, prevAInEnd = null, prevAOutEnd = null, prevVTs = null;
  const venc = new VideoEncoder({
    output: (chunk, meta) => {
      m.videoChunksOut++; m.videoBytes += chunk.byteLength; if (chunk.type === 'key') m.keyframesOut++;
      if (meta?.decoderConfig && !S.videoDecoderConfig) S.videoDecoderConfig = { ...meta.decoderConfig, description: meta.decoderConfig.description ? `<${meta.decoderConfig.description.byteLength} B>` : undefined };
      const pkt = toPacket(chunk, t0); const md = videoMetaSent ? undefined : meta; videoMetaSent = true;
      addChain = addChain.then(() => vSource.add(pkt, md)).catch((e) => m.errors.push('vadd ' + e));
    },
    error: (e) => m.errors.push('venc ' + e),
  });
  venc.configure(v.config);
  const aenc = new AudioEncoder({
    output: (chunk, meta) => {
      m.audioChunksOut++; m.audioBytes += chunk.byteLength;
      if (prevAOutEnd !== null && Math.abs(chunk.timestamp - prevAOutEnd) > 2000) m.audioOutputGaps.push({ at: +((chunk.timestamp - audioBase) / 1e6).toFixed(3), gapMs: +((chunk.timestamp - prevAOutEnd) / 1000).toFixed(1) });
      prevAOutEnd = chunk.timestamp + (chunk.duration ?? 0);
      if (meta?.decoderConfig && !S.audioDecoderConfig) S.audioDecoderConfig = { ...meta.decoderConfig, description: meta.decoderConfig.description ? `<${meta.decoderConfig.description.byteLength} B>` : undefined };
      const pkt = toPacket(chunk, audioBase); const md = audioMetaSent ? undefined : meta; audioMetaSent = true;
      addChain = addChain.then(() => aSource.add(pkt, md)).catch((e) => m.errors.push('aadd ' + e));
    },
    error: (e) => m.errors.push('aenc ' + e),
  });
  aenc.configure(a.config);

  const vReader = new MediaStreamTrackProcessor({ track: src.videoTrack }).readable.getReader();
  // larger audio queue: a main-thread stall otherwise overflows the default queue and AudioData are silently dropped (run 4: 105 ms lost in 2 stalls)
  const aReader = new MediaStreamTrackProcessor({ track: src.audioTrack, maxBufferSize: 100 }).readable.getReader();
  let stopping = false;
  S.recStartPerf = performance.now(); S.recStartWall = new Date().toISOString(); S.status = 'recording';

  const videoLoop = (async () => {
    let n = 0;
    while (!stopping) {
      const { value: frame, done } = await vReader.read(); if (done) break;
      m.framesIn++;
      if (prevVTs !== null && frame.timestamp - prevVTs > 70000) m.videoInputGapsOver70ms.push({ at: +((frame.timestamp - t0) / 1e6).toFixed(3), gapMs: +((frame.timestamp - prevVTs) / 1000).toFixed(1) });
      prevVTs = frame.timestamp;
      if (t0 === null) { t0 = frame.timestamp; S.t0us = t0; vArrival = performance.now(); }
      m.maxVideoQueue = Math.max(m.maxVideoQueue, venc.encodeQueueSize);
      if (venc.encodeQueueSize > MAX_ENCODE_QUEUE) { m.framesDropped++; frame.close(); continue; }
      const keyFrame = n % KEYFRAME_EVERY === 0; n++;
      lastVideoTs = frame.timestamp;
      venc.encode(frame, { keyFrame }); m.framesEncodedIn++; frame.close();
    }
  })();
  const audioLoop = (async () => {
    while (!stopping) {
      const { value: ad, done } = await aReader.read(); if (done) break;
      m.audioDataIn++;
      if (t0 === null) { m.audioDroppedPreT0++; ad.close(); continue; }
      if (firstAudioTs === null) {
        firstAudioTs = ad.timestamp; S.audioFormat = { format: ad.format, sampleRate: ad.sampleRate, ch: ad.numberOfChannels, frames: ad.numberOfFrames };
        const clockDeltaUs = ad.timestamp - t0, arrivalDeltaUs = (performance.now() - vArrival) * 1000;
        const sameClock = Math.abs(clockDeltaUs) < 5e6; // informational only
        audioBase = ad.timestamp - arrivalDeltaUs;
        S.audioClock = { sameClock, rawClockDeltaMs: +(clockDeltaUs / 1000).toFixed(1), arrivalDeltaMs: +(arrivalDeltaUs / 1000).toFixed(1), audioStartOnTimelineMs: +((ad.timestamp - audioBase) / 1000).toFixed(1) };
        log('audio clock', JSON.stringify(S.audioClock));
      }
      if (ad.timestamp < audioBase) { m.audioDroppedPreT0++; ad.close(); continue; }
      if (prevAInEnd !== null && Math.abs(ad.timestamp - prevAInEnd) > 2000) m.audioInputGaps.push({ at: +((ad.timestamp - audioBase) / 1e6).toFixed(3), gapMs: +((ad.timestamp - prevAInEnd) / 1000).toFixed(1) });
      prevAInEnd = ad.timestamp + ad.duration;
      // AudioEncoder output timestamps follow the SAMPLE COUNT, so any dropped input shifts all later audio earlier (A/V drift).
      // Gap-fill: if capture timestamps run > 15 ms ahead of the samples we have encoded, insert silence to re-align.
      const expected = firstAudioTs + aSamples / ad.sampleRate * 1e6, drift = ad.timestamp - expected;
      if (drift > 15000) {
        const n = Math.round(drift / 1e6 * ad.sampleRate), ch = ad.numberOfChannels;
        const sil = new AudioData({ format: 'f32-planar', sampleRate: ad.sampleRate, numberOfFrames: n, numberOfChannels: ch, timestamp: expected, data: new Float32Array(n * ch) });
        aenc.encode(sil); sil.close(); aSamples += n;
        m.silenceFilledMs += n / ad.sampleRate * 1000; m.silenceFills.push({ at: +((expected - audioBase) / 1e6).toFixed(3), ms: +(n / ad.sampleRate * 1000).toFixed(1) });
      }
      aSamples += ad.numberOfFrames;
      lastAudioEnd = ad.timestamp + ad.duration;
      aenc.encode(ad); ad.close();
    }
  })();
  const sampler = setInterval(() => m.queueSamples.push({ t: +((performance.now() - S.recStartPerf) / 1000).toFixed(1), vq: venc.encodeQueueSize, aq: aenc.encodeQueueSize, framesIn: m.framesIn, drop: m.framesDropped, bytes: written }), 1000);

  await new Promise((ok) => setTimeout(ok, durationSec * 1000));
  // ---- stop: end readers → flush encoders → drain adds → finalize muxer → last part → complete ----
  stopping = true; S.status = 'stopping';
  const recEndPerf = performance.now();
  src.stop(); try { await vReader.cancel(); await aReader.cancel(); } catch (_) {}
  await Promise.allSettled([videoLoop, audioLoop]);
  clearInterval(sampler);
  await venc.flush(); await aenc.flush(); venc.close(); aenc.close();
  await addChain;
  await output.finalize();
  cutPart(true);
  const recWallMs = recEndPerf - S.recStartPerf;
  const completed = await uploader.complete();
  S.uploadCompletedAtRecMs = +(performance.now() - S.recStartPerf).toFixed(0);

  // local copy + sha256 (for local vs remote)
  const localBlob = new Blob(localParts, { type: 'video/mp4' });
  const buf = await localBlob.arrayBuffer();
  const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('');
  await fetch(`/api/local-copy?name=${encodeURIComponent(filename.replace('.mp4', '-local.mp4'))}`, { method: 'POST', body: buf });

  S.result = {
    key: uploader.key, recStartWall: S.recStartWall, recWallMs: +recWallMs.toFixed(1),
    mediaVideoSpanSec: +((lastVideoTs - t0) / 1e6).toFixed(3), mediaAudioEndOnTimelineSec: +((lastAudioEnd - audioBase) / 1e6).toFixed(3), audioClock: S.audioClock,
    totalBytes: localBlob.size, measuredBitrateBps: Math.round(localBlob.size * 8 / (recWallMs / 1000)),
    videoBitrateBps: Math.round(m.videoBytes * 8 / (recWallMs / 1000)), audioBitrateBps: Math.round(m.audioBytes * 8 / (recWallMs / 1000)),
    localSha256: sha, parts: uploader.parts, completed,
    videoConfigRequested: S.videoConfigRequested, audioConfigRequested: S.audioConfigRequested,
    videoDecoderConfig: S.videoDecoderConfig, audioDecoderConfig: S.audioDecoderConfig, audioFormat: S.audioFormat,
    uploadCompletedAtRecMs: S.uploadCompletedAtRecMs, metrics: m,
  };
  S.status = 'done'; log('done', JSON.stringify({ bytes: localBlob.size, parts: uploader.parts.length, sha }));
  return S.result;
}

// Player-level check: does a <video> element get a finite duration and seek to 30 s?
export async function playerCheck(url, seekTo = 30) {
  const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; document.body.appendChild(v);
  const ev = (name, ms = 20000) => new Promise((ok, ko) => { const to = setTimeout(() => ko(new Error('timeout ' + name)), ms); v.addEventListener(name, () => { clearTimeout(to); ok(); }, { once: true }); v.addEventListener('error', () => { clearTimeout(to); ko(new Error('media error ' + v.error?.code + ' ' + v.error?.message)); }, { once: true }); });
  const r = { canPlayType: v.canPlayType('video/mp4; codecs="avc1.640028, opus"') || v.canPlayType('video/mp4') };
  try {
    v.src = url; await ev('loadedmetadata');
    r.duration = v.duration; r.seekableRanges = [...Array(v.seekable.length).keys()].map((i) => [v.seekable.start(i), v.seekable.end(i)]);
    const t = performance.now(); v.currentTime = seekTo; await ev('seeked');
    r.seekMs = +(performance.now() - t).toFixed(1); r.currentTimeAfterSeek = v.currentTime; r.readyState = v.readyState;
  } catch (e) { r.error = String(e); }
  v.remove(); return r;
}

window.__s4wc = { status: 'idle', record, playerCheck };
