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
  // Pass 1b instrumentation
  events: [],        // high-res timeline (cut/reconnect/list-parts/resend/catch-up)
  resumeTiming: [],  // one entry per cut, resumeMs = catchUpComplete - reconnect
};

/** High-resolution timestamp: performance.now() + wall clock ISO (Date.now()). */
function ts() {
  const perf = performance.now();
  const wallMs = Date.now();
  return { perf: Math.round(perf * 1000) / 1000, wallMs, iso: new Date(wallMs).toISOString() };
}

/** Record a structured event and emit one machine-parseable console line. */
function ev(type, data = {}) {
  const e = { type, ...ts(), ...data };
  results.events.push(e);
  console.log('[s4-ev] ' + JSON.stringify(e));
  return e;
}

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

/**
 * Pass 2b — OPFS durable buffer (origin private file system).
 * Layout: s4-rec/<sessionId>/
 *   manifest.json          {key, uploadId, partSize, byteCursor, nextPart, parts[]}  (atomic: createWritable swap+commit)
 *   chunk-<byteStart>.bin  each MediaRecorder timeslice chunk, written as soon as it arrives
 *   part-<n>.bin           each cut ≥5 MiB part, written BEFORE its PUT, deleted after confirmed PUT
 * Chunk files fully covered by a persisted part (byteEnd <= byteCursor) are deleted.
 */
const OPFS_ROOT = 's4-rec';
const pad = (n, w = 12) => String(n).padStart(w, '0');

class OpfsStore {
  static async base() {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle(OPFS_ROOT, { create: true });
  }
  static async open(sessionId) {
    const base = await OpfsStore.base();
    const dir = await base.getDirectoryHandle(sessionId, { create: true });
    return new OpfsStore(base, dir, sessionId);
  }
  static async listSessions() {
    const base = await OpfsStore.base();
    const out = [];
    for await (const [name, h] of base.entries()) if (h.kind === 'directory') out.push(name);
    return out;
  }
  static async wipeAll() {
    const root = await navigator.storage.getDirectory();
    try { await root.removeEntry(OPFS_ROOT, { recursive: true }); } catch (_) {}
  }
  constructor(base, dir, sessionId) { this.base = base; this.dir = dir; this.sessionId = sessionId; }
  async writeFile(name, data) {
    const t0 = performance.now();
    const fh = await this.dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(data);
    await w.close();
    return Math.round((performance.now() - t0) * 1000) / 1000;
  }
  async readFile(name) {
    try { return await (await this.dir.getFileHandle(name)).getFile(); } catch (_) { return null; }
  }
  async remove(name) { try { await this.dir.removeEntry(name); } catch (_) {} }
  async list() {
    const out = [];
    for await (const [name, h] of this.dir.entries()) if (h.kind === 'file') out.push(name);
    return out;
  }
  async writeManifest(m) { return this.writeFile('manifest.json', JSON.stringify(m)); }
  async readManifest() {
    const f = await this.readFile('manifest.json');
    if (!f) return null;
    try { return JSON.parse(await f.text()); } catch (_) { return null; }
  }
  async destroy() { try { await this.base.removeEntry(this.sessionId, { recursive: true }); } catch (_) {} }
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
    this.store = null;          // OpfsStore when durable
    this.persistQueue = Promise.resolve();
    this.chunkCursor = 0;       // bytes received from MediaRecorder
    this.persistedChunks = [];  // {name, byteStart, byteEnd}
    this.mimeType = null;
    this.opfsStats = { chunkWrites: [], partWrites: [], partDeletes: 0, manifestWrites: [] };
    this.uploadQueue = Promise.resolve();
    this.inflight = 0;
    this.stopped = false;
    this.online = true;
    this.pendingRetry = false;
    this.cuts = [];          // instrumentation, shared with results.resumeTiming
    this.currentCut = null;  // cut awaiting catch-up (or still offline)
    this._resumePromise = null;
    results.resumeTiming = this.cuts;
  }

  manifestObj() {
    return {
      v: 1, key: this.key, uploadId: this.uploadId, participant: this.participant,
      mimeType: this.mimeType, partSize: this.partSize,
      byteCursor: this.byteCursor, nextPart: this.nextPart, chunkCursor: this.chunkCursor,
      parts: this.manifest.map((m) => ({ partNumber: m.partNumber, byteStart: m.byteStart, byteEnd: m.byteEnd, size: m.size, status: m.status, etag: m.etag || null })),
      updatedIso: new Date().toISOString(),
    };
  }
  async writeManifestNow(reason) {
    if (!this.store) return;
    const ms = await this.store.writeManifest(this.manifestObj());
    this.opfsStats.manifestWrites.push(ms);
    return ms;
  }
  /** Persist one MediaRecorder chunk (runs on persistQueue, independent of PUTs). */
  persistChunk(blob, byteStart) {
    if (!this.store) return;
    this.persistQueue = this.persistQueue.then(async () => {
      const name = `chunk-${pad(byteStart)}.bin`;
      const ms = await this.store.writeFile(name, blob);
      this.persistedChunks.push({ name, byteStart, byteEnd: byteStart + blob.size });
      this.opfsStats.chunkWrites.push(ms);
      ev('opfs-chunk-write', { byteStart, size: blob.size, ms });
    }).catch((e) => ev('opfs-error', { op: 'chunk', error: String(e.message || e) }));
  }
  /** Persist a cut part BEFORE upload; then manifest; then drop consumed chunk files. */
  async persistPart(partNumber, blob, byteStart, byteEnd) {
    if (!this.store) return;
    const p = this.persistQueue.then(async () => {
      const ms = await this.store.writeFile(`part-${pad(partNumber, 5)}.bin`, blob);
      this.opfsStats.partWrites.push({ partNumber, size: blob.size, ms });
      const mms = await this.writeManifestNow('part-cut');
      let deleted = 0;
      const keep = [];
      for (const c of this.persistedChunks) {
        if (c.byteEnd <= this.byteCursor) { await this.store.remove(c.name); deleted++; } else keep.push(c);
      }
      this.persistedChunks = keep;
      ev('opfs-part-write', { partNumber, size: blob.size, ms, manifestMs: mms, chunkFilesDeleted: deleted });
    }).catch((e) => ev('opfs-error', { op: 'part', partNumber, error: String(e.message || e) }));
    this.persistQueue = p;
    await p;
  }
  /** After confirmed PUT: mark uploaded in manifest, delete part file. */
  persistUploaded(partNumber) {
    if (!this.store) return;
    this.persistQueue = this.persistQueue.then(async () => {
      await this.writeManifestNow('part-uploaded');
      await this.store.remove(`part-${pad(partNumber, 5)}.bin`);
      this.opfsStats.partDeletes++;
    }).catch((e) => ev('opfs-error', { op: 'uploaded', partNumber, error: String(e.message || e) }));
  }

  /** Parts not yet confirmed uploaded (buffered offline / error / pending). */
  notUploaded() {
    return this.manifest.filter((m) => m.status !== 'uploaded').map((m) => m.partNumber);
  }

  /** Called after any state change; closes the current cut once catch-up is done. */
  checkCatchUp(reason) {
    const cut = this.currentCut;
    if (!cut || cut.reconnect == null || cut.catchUpComplete) return;
    const still = cut.missingAtReconnect.filter((n) => {
      const m = this.manifest.find((x) => x.partNumber === n);
      return !m || m.status !== 'uploaded';
    });
    if (still.length > 0) return;
    const t = ts();
    cut.catchUpComplete = t;
    cut.resumeMs = Math.round((t.perf - cut.reconnect.perf) * 1000) / 1000;
    cut.notUploadedAtCatchUp = this.notUploaded();
    cut.catchUpReason = reason;
    cut.catchUpDuringFlush = !!this.stopped;
    cut.thresholdMs = 15000;
    cut.verdict = cut.resumeMs <= 15000 ? 'PASS' : 'FAIL';
    ev('catch-up-complete', {
      label: cut.label, resumeMs: cut.resumeMs, partsResent: cut.resent.filter((r) => r.ok).map((r) => r.partNumber),
      missingAtReconnect: cut.missingAtReconnect, reason,
    });
    console.log('[s4-resume] ' + JSON.stringify({
      label: cut.label,
      cutStartIso: cut.cutStart?.iso,
      reconnectIso: cut.reconnect.iso,
      catchUpCompleteIso: t.iso,
      resumeMs: cut.resumeMs,
      partsResent: cut.resent.filter((r) => r.ok).map((r) => r.partNumber),
      missingAtReconnect: cut.missingAtReconnect,
      thresholdMs: 15000,
      verdict: cut.verdict,
    }));
    this.currentCut = null;
  }

  setOnline(v, label) {
    if (!v) {
      const cut = {
        label: label || `cut-${this.cuts.length + 1}`,
        cutStart: ts(),
        notUploadedAtCutStart: this.notUploaded(),
        reconnect: null,
        missingAtReconnect: null,
        listParts: [],
        resent: [],
        catchUpComplete: null,
        resumeMs: null,
        verdict: null,
      };
      this.cuts.push(cut);
      this.currentCut = cut;
      ev('cut-start', { label: cut.label, notUploaded: cut.notUploadedAtCutStart });
    } else if (this.currentCut && this.currentCut.reconnect == null) {
      const cut = this.currentCut;
      cut.reconnect = ts();
      cut.missingAtReconnect = this.notUploaded();
      cut.offlineMs = Math.round((cut.reconnect.perf - cut.cutStart.perf) * 1000) / 1000;
      ev('reconnect', { label: cut.label, online: true, missingAtReconnect: cut.missingAtReconnect, offlineMs: cut.offlineMs });
    }
    this.online = v;
    log(`network online=${v}`);
    if (v) this.checkCatchUp('reconnect-nothing-missing');
    if (v && this.pendingRetry) {
      this.pendingRetry = false;
      this.uploadQueue = this.uploadQueue.then(() => this.resumeMissing());
    }
  }

  pushChunk(blob, meta = {}) {
    this.persistChunk(blob, this.chunkCursor);
    this.chunkCursor += blob.size;
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
    if (this.store) { await this.persistQueue; await this.store.destroy(); ev('opfs-session-destroyed', { key: this.key }); }
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
      // Register the part in the manifest BEFORE persisting, so manifest.byteCursor never
      // advances past a part the manifest doesn't know about (crash-consistency).
      this.manifest.push({ partNumber, byteStart, byteEnd, size: partBlob.size, etag: null,
        status: 'persisted-local', attempts: 0, blob: partBlob, tUploadStart: null, tUploadEnd: null });
      await this.persistPart(partNumber, partBlob, byteStart, byteEnd);
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
      results.parts = this.manifest.map(publicPart); // keep snapshot fresh (was stale since pass 1)
      this.pendingRetry = true;
      log(`part ${partNumber} buffered offline (${blob.size} B)`);
      return;
    }

    const cut = this.currentCut;
    const isResend = !!(cut && cut.reconnect && cut.missingAtReconnect?.includes(partNumber));
    let resendRec = null;
    if (isResend) {
      resendRec = { partNumber, attempt, size: blob.size, start: ts(), end: null, ok: false, error: null };
      cut.resent.push(resendRec);
      ev('resend-put-start', { label: cut.label, partNumber, attempt, size: blob.size });
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
      this.persistUploaded(partNumber);
      log(`part ${partNumber} uploaded size=${blob.size} etag=${etag} ms=${entry.uploadMs.toFixed(0)}`);
      if (resendRec) {
        resendRec.end = ts(); resendRec.ok = true;
        resendRec.ms = Math.round((resendRec.end.perf - resendRec.start.perf) * 1000) / 1000;
        ev('resend-put-end', { label: cut.label, partNumber, ok: true, ms: resendRec.ms });
      }
    } catch (e) {
      entry.status = 'error';
      entry.error = String(e.message || e);
      entry.tUploadEnd = performance.now();
      log(`part ${partNumber} ERROR: ${entry.error}`);
      if (resendRec) {
        resendRec.end = ts(); resendRec.error = entry.error;
        ev('resend-put-end', { label: cut.label, partNumber, ok: false, error: entry.error });
      }
      this.pendingRetry = true;
      // If network-looking failure, mark offline-ish; runner may also flip via CDP
      if (/Failed to fetch|NetworkError|ERR_INTERNET|offline/i.test(entry.error)) {
        this.online = false;
      }
    } finally {
      this.inflight--;
      results.parts = this.manifest.map(publicPart);
      this.checkCatchUp('part-uploaded');
    }
  }

  /** Single-flight: concurrent callers (queue + runner kick) share one pass. */
  resumeMissing() {
    if (this._resumePromise) return this._resumePromise;
    this._resumePromise = this._resumeMissing().finally(() => { this._resumePromise = null; });
    return this._resumePromise;
  }

  async _resumeMissing() {
    log('resume: list-parts…');
    const cut = (this.currentCut && this.currentCut.reconnect) ? this.currentCut : null;
    const lp = { request: ts(), response: null, remoteParts: null, error: null };
    if (cut) { cut.listParts.push(lp); ev('list-parts-request', { label: cut.label }); }
    let remote;
    try {
      remote = await api(`/api/multipart/list-parts?key=${encodeURIComponent(this.key)}&uploadId=${encodeURIComponent(this.uploadId)}`);
      lp.response = ts();
      lp.remoteParts = (remote.parts || []).map((p) => p.PartNumber);
      lp.ms = Math.round((lp.response.perf - lp.request.perf) * 1000) / 1000;
      if (cut) ev('list-parts-response', { label: cut.label, remoteParts: lp.remoteParts, ms: lp.ms });
    } catch (e) {
      lp.response = ts(); lp.error = String(e.message || e);
      if (cut) ev('list-parts-response', { label: cut.label, error: lp.error });
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
    this.checkCatchUp('resume-pass-done');
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
  results.events = [];
  results.resumeTiming = [];
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
  uploader.mimeType = mimeType;
  if (opts.opfs) {
    const sessionId = created.key.split('/').pop().replace(/[^a-zA-Z0-9._-]/g, '_');
    uploader.store = await OpfsStore.open(sessionId);
    const ms = await uploader.writeManifestNow('create');
    ev('opfs-session-open', { sessionId, manifestMs: ms });
  }
  results.opfs = uploader.store ? uploader.opfsStats : null;

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
    if (opts.tap && typeof window.__s4Tap === 'function') {
      // Ground truth for crash tests: ship every produced chunk to the runner.
      const idx = chunkCount; const blob = ev.data;
      const fr = new FileReader();
      fr.onload = () => { const r = String(fr.result); const i = r.indexOf('base64,'); window.__s4Tap(idx, i >= 0 ? r.slice(i + 7) : ''); };
      fr.readAsDataURL(blob);
    }
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
  window.__s4.uploader = uploader;

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

/**
 * Restore every OPFS session left by a crashed page:
 * manifest → list-parts → re-PUT missing persisted parts → upload tail (chunks past byteCursor) → complete.
 */
async function recoverAll() {
  const T0 = ts();
  const out = { startIso: T0.iso, sessions: [] };
  const names = await OpfsStore.listSessions();
  for (const sid of names) {
    const s0 = ts();
    const store = await OpfsStore.open(sid);
    const m = await store.readManifest();
    const rep = { sessionId: sid, manifest: m ? { key: m.key, uploadId: m.uploadId, byteCursor: m.byteCursor, nextPart: m.nextPart, parts: m.parts.map((p) => [p.partNumber, p.status]) } : null,
      files: await store.list(), remoteBefore: null, resentParts: [], lostParts: [], tail: null, completed: null, errors: [] };
    if (!m) { rep.errors.push('no manifest'); out.sessions.push(rep); continue; }
    try {
      const qs = `key=${encodeURIComponent(m.key)}&uploadId=${encodeURIComponent(m.uploadId)}`;
      const lp0 = ts();
      const remote = await api(`/api/multipart/list-parts?${qs}`);
      const have = new Set(remote.parts.map((p) => p.PartNumber));
      rep.remoteBefore = [...have];
      rep.listPartsMs = Math.round((ts().perf - lp0.perf) * 1000) / 1000;
      const putPart = async (n, blob) => {
        const t = ts();
        const { url } = await api('/api/multipart/presign-part', { method: 'POST', body: JSON.stringify({ key: m.key, uploadId: m.uploadId, partNumber: n }) });
        const r = await fetch(url, { method: 'PUT', body: blob });
        if (!r.ok) throw new Error(`recover PUT ${n} HTTP ${r.status}`);
        return Math.round((ts().perf - t.perf) * 1000) / 1000;
      };
      let contiguousEnd = 0;
      for (const p of [...m.parts].sort((a, b) => a.partNumber - b.partNumber)) {
        if (have.has(p.partNumber)) { contiguousEnd = p.byteEnd; continue; }
        const f = await store.readFile(`part-${pad(p.partNumber, 5)}.bin`);
        if (!f || f.size !== p.size) { rep.lostParts.push(p.partNumber); break; }
        const ms = await putPart(p.partNumber, f);
        rep.resentParts.push({ partNumber: p.partNumber, size: f.size, ms });
        contiguousEnd = p.byteEnd;
      }
      // Guard: parts must cover exactly [0, byteCursor) or the object would have a hole.
      rep.partsCoverTo = contiguousEnd;
      if (rep.lostParts.length === 0 && contiguousEnd !== m.byteCursor) {
        throw new Error(`manifest gap: parts cover 0..${contiguousEnd} but byteCursor=${m.byteCursor}; refusing to complete`);
      }
      // Tail: chunk files past byteCursor, must be contiguous from byteCursor.
      const chunkNames = (await store.list()).filter((n) => n.startsWith('chunk-')).sort();
      const pieces = [];
      let cursor = m.byteCursor;
      let tailGap = null;
      if (rep.lostParts.length === 0) {
        for (const n of chunkNames) {
          const start = Number(n.slice(6, 6 + 12));
          const f = await store.readFile(n);
          const end = start + f.size;
          if (end <= cursor) continue;
          if (start > cursor) { tailGap = { expectedAt: cursor, nextChunkAt: start }; break; }
          pieces.push(f.slice(cursor - start));
          cursor = end;
        }
      }
      const tailBlob = new Blob(pieces);
      rep.tail = { fromByte: m.byteCursor, bytes: tailBlob.size, chunkFiles: chunkNames.length, gap: tailGap, parts: [] };
      let pn = m.nextPart;
      for (let off = 0; off < tailBlob.size; off += m.partSize) {
        const slice = tailBlob.slice(off, Math.min(off + m.partSize, tailBlob.size));
        const ms = await putPart(pn, slice);
        rep.tail.parts.push({ partNumber: pn, size: slice.size, ms });
        pn++;
      }
      const remote2 = await api(`/api/multipart/list-parts?${qs}`);
      const parts = remote2.parts.map((p) => ({ PartNumber: p.PartNumber, ETag: p.ETag }));
      const done = await api('/api/multipart/complete', { method: 'POST', body: JSON.stringify({ key: m.key, uploadId: m.uploadId, parts }) });
      rep.completed = { key: m.key, contentLength: done.contentLength, partCount: parts.length };
      rep.recoveredBytes = done.contentLength;
      rep.expectedPersistedBytes = cursor; // bytes 0..cursor were recoverable from S3+OPFS
      await store.destroy();
    } catch (e) {
      rep.errors.push(String(e.message || e));
    }
    rep.sessionMs = Math.round((ts().perf - s0.perf) * 1000) / 1000;
    out.sessions.push(rep);
  }
  out.totalMs = Math.round((ts().perf - T0.perf) * 1000) / 1000;
  out.remainingSessions = await OpfsStore.listSessions();
  ev('opfs-recover-done', { totalMs: out.totalMs, sessions: out.sessions.length });
  return out;
}
window.__s4.recoverAll = recoverAll;
window.__s4.opfsWipe = () => OpfsStore.wipeAll();
window.__s4.opfsList = () => OpfsStore.listSessions();

window.__s4.startRecording = startRecording;
window.__s4.setOnline = (v, label) => {
  if (active?.uploader) active.uploader.setOnline(v, label);
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
