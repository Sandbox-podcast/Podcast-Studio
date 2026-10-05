/**
 * S4 lab browser recorder:
 * - Synthetic canvas (animated) + WebAudio oscillator → MediaStream
 * - MediaRecorder with timeslice → accumulate ≥5 MiB parts → presigned PUT
 * - Resume via ListParts after network recovery
 * - WebCodecs feasibility probe (no full muxer)
 */

const $ = (id) => document.getElementById(id);
const logEl = $('log');
const results = {
  participant: null,
  mimeType: null,
  mimeTypesSupported: [],
  webCodecs: null,
  recording: null,
  parts: [],
  cuts: [],
  integrity: null,
  sync: null,
  errors: [],
};

function log(...args) {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  logEl.textContent += line + '\n';
  logEl.scrollTop = logEl.scrollHeight;
  console.log('[s4]', ...args);
}

window.__s4 = {
  results,
  log,
  async getResults() { return structuredClone(results); },
  async waitUntilDone(timeoutMs = 600000) {
    const start = Date.now();
    while (!results.done) {
      if (Date.now() - start > timeoutMs) throw new Error('waitUntilDone timeout');
      await new Promise((r) => setTimeout(r, 200));
    }
    return structuredClone(results);
  },
};

const MIME_CANDIDATES = [
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1.4D401E,mp4a.40.2',
  'video/mp4',
  'audio/webm;codecs=opus',
];

function probeMimeTypes() {
  const supported = [];
  for (const m of MIME_CANDIDATES) {
    try {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) {
        supported.push(m);
      }
    } catch (_) { /* ignore */ }
  }
  results.mimeTypesSupported = supported;
  return supported;
}

async function probeWebCodecs() {
  const out = {
    VideoEncoder: typeof VideoEncoder !== 'undefined',
    AudioEncoder: typeof AudioEncoder !== 'undefined',
    videoConfigs: [],
    audioConfigs: [],
  };
  if (out.VideoEncoder && VideoEncoder.isConfigSupported) {
    const configs = [
      { codec: 'vp8', width: 1280, height: 720, bitrate: 2_500_000, framerate: 30 },
      { codec: 'vp09.00.10.08', width: 1280, height: 720, bitrate: 2_500_000, framerate: 30 },
      { codec: 'avc1.42E01E', width: 1280, height: 720, bitrate: 2_500_000, framerate: 30 },
      { codec: 'av01.0.04M.08', width: 1280, height: 720, bitrate: 2_500_000, framerate: 30 },
    ];
    for (const c of configs) {
      try {
        const r = await VideoEncoder.isConfigSupported(c);
        out.videoConfigs.push({ config: c, supported: !!r.supported, configReturned: r.config || null });
      } catch (e) {
        out.videoConfigs.push({ config: c, supported: false, error: String(e.message || e) });
      }
    }
  }
  if (out.AudioEncoder && AudioEncoder.isConfigSupported) {
    const configs = [
      { codec: 'opus', numberOfChannels: 1, sampleRate: 48000, bitrate: 128000 },
      { codec: 'mp4a.40.2', numberOfChannels: 1, sampleRate: 48000, bitrate: 128000 },
    ];
    for (const c of configs) {
      try {
        const r = await AudioEncoder.isConfigSupported(c);
        out.audioConfigs.push({ config: c, supported: !!r.supported, configReturned: r.config || null });
      } catch (e) {
        out.audioConfigs.push({ config: c, supported: false, error: String(e.message || e) });
      }
    }
  }
  results.webCodecs = out;
  return out;
}

function pickMime(preferred) {
  const supported = probeMimeTypes();
  if (preferred && supported.includes(preferred)) return preferred;
  return supported[0] || '';
}

function createSyntheticStream(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const w = canvas.width;
  const h = canvas.height;
  let frame = 0;
  let raf = 0;
  const startPerf = performance.now();

  function draw() {
    frame++;
    const t = (performance.now() - startPerf) / 1000;
    // High-detail animated scene to keep encoder busy / bitrate up
    ctx.fillStyle = `hsl(${(t * 40) % 360} 40% 18%)`;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      const x = (Math.sin(t * 1.7 + i) * 0.4 + 0.5) * w;
      const y = (Math.cos(t * 1.3 + i * 0.7) * 0.4 + 0.5) * h;
      ctx.fillStyle = `hsl(${(i * 9 + t * 80) % 360} 80% 55%)`;
      ctx.beginPath();
      ctx.arc(x, y, 18 + (i % 7) * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.font = '48px monospace';
    ctx.fillText(`S4 ${t.toFixed(3)}s f=${frame}`, 40, 80);
    // Noise-ish bars for entropy
    for (let x = 0; x < w; x += 8) {
      const n = (Math.sin(x * 0.05 + t * 20) * 0.5 + 0.5) * 80;
      ctx.fillStyle = `rgb(${n|0},${(255 - n)|0},${(x + frame) % 255})`;
      ctx.fillRect(x, h - 120, 6, 100);
    }
    raf = requestAnimationFrame(draw);
  }
  draw();

  const videoStream = canvas.captureStream(30);

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ac = new AudioCtx();
  const osc = ac.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = 440;
  const gain = ac.createGain();
  gain.gain.value = 0.15;
  const dest = ac.createMediaStreamDestination();
  osc.connect(gain).connect(dest);
  // LFO frequency for audible change over time
  const lfo = ac.createOscillator();
  lfo.frequency.value = 0.25;
  const lfoGain = ac.createGain();
  lfoGain.gain.value = 80;
  lfo.connect(lfoGain).connect(osc.frequency);
  osc.start();
  lfo.start();

  const combined = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);

  return {
    stream: combined,
    audioContext: ac,
    stop() {
      cancelAnimationFrame(raf);
      try { osc.stop(); } catch (_) {}
      try { lfo.stop(); } catch (_) {}
      try { ac.close(); } catch (_) {}
      for (const t of combined.getTracks()) t.stop();
    },
  };
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${path} → ${res.status}: ${text}`);
  return data;
}

async function sha256Hex(buf) {
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

class PartUploader {
  constructor({ partSize, key, uploadId, participant }) {
    this.partSize = partSize;
    this.key = key;
    this.uploadId = uploadId;
    this.participant = participant;
    this.buffer = [];
    this.bufferBytes = 0;
    this.nextPart = 1;
    this.manifest = []; // local: partNumber, byteStart, byteEnd, etag, tUploadStart, tUploadEnd, retries
    this.byteCursor = 0;
    this.allChunks = []; // keep local assembly for integrity
    this.uploadQueue = Promise.resolve();
    this.inflight = 0;
    this.stopped = false;
    this.online = true;
    this.pendingRetry = false;
  }

  setOnline(v) {
    this.online = v;
    log(`network online=${v}`);
    if (v && this.pendingRetry) {
      this.pendingRetry = false;
      this.uploadQueue = this.uploadQueue.then(() => this.resumeMissing());
    }
  }

  pushChunk(blob, meta = {}) {
    this.allChunks.push(blob);
    this.buffer.push(blob);
    this.bufferBytes += blob.size;
    this.uploadQueue = this.uploadQueue.then(() => this.drain(false));
  }

  async flushFinal() {
    this.stopped = true;
    await this.uploadQueue;
    await this.drain(true);
    await this.resumeMissing();
    // complete
    const remote = await api(`/api/multipart/list-parts?key=${encodeURIComponent(this.key)}&uploadId=${encodeURIComponent(this.uploadId)}`);
    const parts = remote.parts.map((p) => ({ PartNumber: p.PartNumber, ETag: p.ETag }));
    if (parts.length === 0) throw new Error('no parts to complete');
    const done = await api('/api/multipart/complete', {
      method: 'POST',
      body: JSON.stringify({ key: this.key, uploadId: this.uploadId, parts }),
    });
    return { done, parts, remote };
  }

  async drain(force) {
    while (this.bufferBytes >= this.partSize || (force && this.bufferBytes > 0)) {
      const take = force && this.bufferBytes < this.partSize ? this.bufferBytes : this.partSize;
      if (!force && this.bufferBytes < this.partSize) break;
      const partBlob = await this.takeBytes(take);
      const partNumber = this.nextPart++;
      const byteStart = this.byteCursor;
      const byteEnd = this.byteCursor + partBlob.size;
      this.byteCursor = byteEnd;
      await this.uploadOne(partNumber, partBlob, byteStart, byteEnd);
    }
  }

  async takeBytes(n) {
    const chunks = [];
    let need = n;
    while (need > 0 && this.buffer.length) {
      const head = this.buffer[0];
      if (head.size <= need) {
        chunks.push(head);
        this.buffer.shift();
        this.bufferBytes -= head.size;
        need -= head.size;
      } else {
        chunks.push(head.slice(0, need));
        this.buffer[0] = head.slice(need);
        this.bufferBytes -= need;
        need = 0;
      }
    }
    return new Blob(chunks, { type: chunks[0]?.type || 'application/octet-stream' });
  }

  async uploadOne(partNumber, blob, byteStart, byteEnd, attempt = 1) {
    const entry = {
      partNumber,
      byteStart,
      byteEnd,
      size: blob.size,
      etag: null,
      tUploadStart: performance.now(),
      tUploadEnd: null,
      attempts: attempt,
      status: 'pending',
      blob, // keep for retry (memory — lab only)
    };
    // replace if retrying same part
    const existing = this.manifest.findIndex((m) => m.partNumber === partNumber);
    if (existing >= 0) this.manifest[existing] = entry;
    else this.manifest.push(entry);
    results.parts = this.manifest.map(publicPart);

    if (!this.online) {
      entry.status = 'buffered-offline';
      this.pendingRetry = true;
      log(`part ${partNumber} buffered offline (${blob.size} B)`);
      return;
    }

    try {
      this.inflight++;
      const { url } = await api('/api/multipart/presign-part', {
        method: 'POST',
        body: JSON.stringify({ key: this.key, uploadId: this.uploadId, partNumber }),
      });
      const put = await fetch(url, { method: 'PUT', body: blob });
      if (!put.ok) throw new Error(`PUT part ${partNumber} HTTP ${put.status}`);
      const etag = put.headers.get('ETag') || put.headers.get('etag');
      if (!etag) throw new Error(`part ${partNumber}: missing ETag`);
      entry.etag = etag;
      entry.tUploadEnd = performance.now();
      entry.status = 'uploaded';
      entry.uploadMs = entry.tUploadEnd - entry.tUploadStart;
      log(`part ${partNumber} uploaded size=${blob.size} etag=${etag} ms=${entry.uploadMs.toFixed(0)}`);
    } catch (e) {
      entry.status = 'error';
      entry.error = String(e.message || e);
      entry.tUploadEnd = performance.now();
      log(`part ${partNumber} ERROR: ${entry.error}`);
      this.pendingRetry = true;
      // If network-looking failure, mark offline-ish; runner may also flip via CDP
      if (/Failed to fetch|NetworkError|ERR_INTERNET|offline/i.test(entry.error)) {
        this.online = false;
      }
    } finally {
      this.inflight--;
      results.parts = this.manifest.map(publicPart);
    }
  }

  async resumeMissing() {
    log('resume: list-parts…');
    let remote;
    try {
      remote = await api(`/api/multipart/list-parts?key=${encodeURIComponent(this.key)}&uploadId=${encodeURIComponent(this.uploadId)}`);
    } catch (e) {
      log('resume list-parts failed:', String(e.message || e));
      this.pendingRetry = true;
      return;
    }
    const have = new Set((remote.parts || []).map((p) => p.PartNumber));
    log(`resume: remote parts=[${[...have].sort((a,b)=>a-b).join(',')}]`);
    // Update etags from server for known parts
    for (const p of remote.parts || []) {
      const m = this.manifest.find((x) => x.partNumber === p.PartNumber);
      if (m) {
        m.etag = p.ETag;
        m.status = 'uploaded';
        m.size = p.Size ?? m.size;
      }
    }
    const missing = this.manifest
      .filter((m) => !have.has(m.partNumber) && m.blob)
      .sort((a, b) => a.partNumber - b.partNumber);
    for (const m of missing) {
      this.online = true;
      await this.uploadOne(m.partNumber, m.blob, m.byteStart, m.byteEnd, (m.attempts || 1) + 1);
    }
    results.parts = this.manifest.map(publicPart);
  }
}

function publicPart(m) {
  return {
    partNumber: m.partNumber,
    byteStart: m.byteStart,
    byteEnd: m.byteEnd,
    size: m.size,
    etag: m.etag,
    status: m.status,
    uploadMs: m.uploadMs ?? (m.tUploadEnd && m.tUploadStart ? m.tUploadEnd - m.tUploadStart : null),
    attempts: m.attempts,
    error: m.error || null,
  };
}

let active = null;

async function startRecording(opts = {}) {
  results.done = false;
  results.errors = [];
  results.parts = [];
  results.cuts = opts.cuts || results.cuts || [];
  const participant = opts.participant || $('participant').value || 'p1';
  const durationSec = Number(opts.durationSec ?? $('durationSec').value);
  const partSize = Math.max(5, Number(opts.partMiB ?? $('partMiB').value)) * 1024 * 1024;
  const videoBitsPerSecond = Number(opts.vBitrate ?? $('vBitrate').value);
  const timeslice = Number(opts.timeslice ?? $('timeslice').value);
  const preferredMime = opts.mimeType || null;

  results.participant = participant;
  $('status').textContent = 'starting';

  const supported = probeMimeTypes();
  log('MediaRecorder.isTypeSupported:', supported);
  const mimeType = pickMime(preferredMime);
  if (!mimeType) {
    results.errors.push('No supported MediaRecorder mimeType');
    results.done = true;
    throw new Error('No supported mimeType');
  }
  results.mimeType = mimeType;
  log('using mimeType', mimeType);

  const wc = await probeWebCodecs();
  log('WebCodecs probe', {
    VideoEncoder: wc.VideoEncoder,
    AudioEncoder: wc.AudioEncoder,
    videoOk: wc.videoConfigs.filter((c) => c.supported).map((c) => c.config.codec),
    audioOk: wc.audioConfigs.filter((c) => c.supported).map((c) => c.config.codec),
  });

  const canvas = $('cv');
  const synth = createSyntheticStream(canvas);
  const timeOrigin = performance.timeOrigin;
  const tStartPerf = performance.now();
  const wallStart = Date.now();

  const filename = `${participant}-${Date.now()}.webm`;
  const created = await api('/api/multipart/create', {
    method: 'POST',
    body: JSON.stringify({ filename, contentType: mimeType.split(';')[0] }),
  });
  log('MPU created', created);

  const uploader = new PartUploader({
    partSize,
    key: created.key,
    uploadId: created.uploadId,
    participant,
  });

  const recOpts = {
    mimeType,
    videoBitsPerSecond,
    audioBitsPerSecond: 128000,
    bitsPerSecond: videoBitsPerSecond + 128000,
  };
  let recorder;
  try {
    recorder = new MediaRecorder(synth.stream, recOpts);
  } catch (e) {
    try {
      recorder = new MediaRecorder(synth.stream, { mimeType, videoBitsPerSecond, audioBitsPerSecond: 128000 });
    } catch (e2) {
      recorder = new MediaRecorder(synth.stream, { mimeType });
    }
  }

  let firstChunkAt = null;
  let chunkCount = 0;
  let totalBytes = 0;

  recorder.ondataavailable = (ev) => {
    if (!ev.data || ev.data.size === 0) return;
    chunkCount++;
    totalBytes += ev.data.size;
    if (firstChunkAt == null) firstChunkAt = performance.now();
    uploader.pushChunk(ev.data, { chunkIndex: chunkCount });
  };

  recorder.onerror = (ev) => {
    const msg = String(ev.error?.message || ev.error || 'MediaRecorder error');
    results.errors.push(msg);
    log('recorder error', msg);
  };

  const stopped = new Promise((resolve) => {
    recorder.onstop = () => resolve();
  });

  recorder.start(timeslice);
  log(`recording started timeslice=${timeslice}ms partSize=${partSize} durationSec=${durationSec}`);

  results.recording = {
    source: 'canvas.captureStream(30) + WebAudio oscillator (sawtooth+LFO) via MediaStreamDestination',
    mimeType,
    videoBitsPerSecond,
    audioBitsPerSecond: 128000,
    timesliceMs: timeslice,
    partSizeBytes: partSize,
    durationSecTarget: durationSec,
    timeOrigin,
    tStartPerf,
    wallStartIso: new Date(wallStart).toISOString(),
    firstChunkAt: null,
    chromeFakeDeviceFlags: opts.chromeFakeDeviceFlags || false,
  };

  active = { recorder, synth, uploader, stopped };

  // Auto-stop after duration
  const stopTimer = setTimeout(() => {
    if (recorder.state !== 'inactive') recorder.stop();
  }, durationSec * 1000);

  $('btnStart').disabled = true;
  $('btnStop').disabled = false;
  $('status').textContent = 'recording';

  await stopped;
  clearTimeout(stopTimer);
  log('recorder stopped; flushing uploads…');
  $('status').textContent = 'flushing';

  results.recording.firstChunkAt = firstChunkAt;
  results.recording.tStopPerf = performance.now();
  results.recording.chunkCount = chunkCount;
  results.recording.totalBytesLocal = totalBytes;
  results.recording.elapsedMs = results.recording.tStopPerf - tStartPerf;
  results.recording.measuredBitrateBps = totalBytes > 0
    ? (totalBytes * 8) / (results.recording.elapsedMs / 1000)
    : 0;

  synth.stop();

  let completeOut = null;
  try {
    completeOut = await uploader.flushFinal();
    log('complete', completeOut.done);
  } catch (e) {
    results.errors.push(String(e.message || e));
    log('complete FAILED', String(e.message || e));
  }

  // Local assembly
  const assembled = new Blob(uploader.allChunks, { type: mimeType.split(';')[0] });
  const assembledBuf = await assembled.arrayBuffer();
  const localSha = await sha256Hex(assembledBuf);
  results.integrity = {
    localBytes: assembled.byteLength ?? assembled.size,
    localSha256: localSha,
    key: created.key,
    uploadId: created.uploadId,
    complete: completeOut?.done || null,
    remoteContentLength: completeOut?.done?.contentLength ?? null,
  };

  // Expose blob for Playwright download/compare
  window.__s4.lastBlob = assembled;
  window.__s4.lastBlobBuffer = assembledBuf;
  window.__s4.uploader = uploader;

  results.sync = {
    participant,
    timeOrigin,
    tStartPerf,
    firstChunkAt,
    wallStartMs: wallStart,
  };

  results.done = true;
  $('status').textContent = results.errors.length ? 'done-with-errors' : 'done';
  $('btnStart').disabled = false;
  $('btnStop').disabled = true;
  active = null;
  return results;
}

window.__s4.startRecording = startRecording;
window.__s4.setOnline = (v) => {
  if (active?.uploader) active.uploader.setOnline(v);
};
window.__s4.probe = async () => {
  const mime = probeMimeTypes();
  const wc = await probeWebCodecs();
  return { mime, webCodecs: wc };
};

$('btnProbe').onclick = async () => {
  const r = await window.__s4.probe();
  log('probe', r);
};
$('btnStart').onclick = () => startRecording().catch((e) => log('start failed', String(e.message || e)));
$('btnStop').onclick = () => {
  if (active?.recorder && active.recorder.state !== 'inactive') active.recorder.stop();
};

// Auto-probe on load
window.__s4.probe().then((r) => log('autoload probe', r)).catch((e) => log('probe err', e));
