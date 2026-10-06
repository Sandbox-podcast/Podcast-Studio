// Codec support probe: VideoEncoder/AudioEncoder.isConfigSupported in Playwright Chromium vs system Google Chrome.
// localhost / headless / synthetic. No network needed (about:blank → secure context via data: is NOT secure, so use a local page).
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';

const PORT = Number(process.env.PROBE_PORT || 3331);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html' }); r.end('<!doctype html><title>probe</title>'); });
await new Promise((ok) => srv.listen(PORT, '127.0.0.1', ok));

const video = [
  ['avc1 baseline 3.1 (42E01F)', 'avc1.42E01F'],
  ['avc1 baseline 4.0 (42E028)', 'avc1.42E028'],
  ['avc1 constrained-baseline 4.0 (42C028)', 'avc1.42C028'],
  ['avc1 main 4.0 (4D4028)', 'avc1.4D4028'],
  ['avc1 high 4.0 (640028)', 'avc1.640028'],
  ['avc1 high 4.2 (64002A)', 'avc1.64002A'],
  ['vp8', 'vp8'],
  ['vp9 profile0 (vp09.00.40.08)', 'vp09.00.40.08'],
  ['av1 main 4.0 (av01.0.08M.08)', 'av01.0.08M.08'],
];
const audio = [
  ['opus', 'opus'],
  ['mp4a AAC-LC (mp4a.40.2)', 'mp4a.40.2'],
  ['mp4a HE-AAC (mp4a.40.5)', 'mp4a.40.5'],
];
const browsers = [
  { name: 'playwright-chromium', opts: {} },
  { name: 'google-chrome', opts: { channel: 'chrome' } },
];
const out = { at: new Date().toISOString(), label: 'localhost / headless / synthetic', results: [] };
for (const b of browsers) {
  const browser = await chromium.launch({ headless: true, ...b.opts });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/`);
  const r = await page.evaluate(async ({ video, audio }) => {
    const res = { ua: navigator.userAgent, hasVE: 'VideoEncoder' in self, hasAE: 'AudioEncoder' in self, hasMSTP: 'MediaStreamTrackProcessor' in self, video: [], audio: [] };
    const gl = (() => { try { const c = document.createElement('canvas').getContext('webgl'); const e = c && c.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : (c ? 'webgl (no debug info)' : 'no webgl'); } catch (e) { return String(e); } })();
    res.webglRenderer = gl;
    for (const [label, codec] of video) {
      const row = { label, codec };
      for (const hw of ['no-preference', 'prefer-hardware', 'prefer-software']) {
        const cfg = { codec, width: 1920, height: 1080, bitrate: 6_000_000, framerate: 30, hardwareAcceleration: hw, latencyMode: 'realtime' };
        if (codec.startsWith('avc1')) cfg.avc = { format: 'avc' };
        try { const s = await VideoEncoder.isConfigSupported(cfg); row[hw] = s.supported; } catch (e) { row[hw] = 'err:' + e.name; }
      }
      res.video.push(row);
    }
    for (const [label, codec] of audio) {
      const cfg = { codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 };
      try { const s = await AudioEncoder.isConfigSupported(cfg); res.audio.push({ label, codec, supported: s.supported }); } catch (e) { res.audio.push({ label, codec, supported: 'err:' + e.name }); }
    }
    return res;
  }, { video, audio });
  r.version = browser.version();
  out.results.push({ browser: b.name, ...r });
  await browser.close();
}
srv.close();
fs.writeFileSync('out/codec-matrix.json', JSON.stringify(out, null, 2));
for (const r of out.results) {
  console.log(`\n== ${r.browser} ${r.version} | webgl: ${r.webglRenderer} | MSTP:${r.hasMSTP}`);
  for (const v of r.video) console.log(`${v.label.padEnd(40)} any:${v['no-preference']} hw:${v['prefer-hardware']} sw:${v['prefer-software']}`);
  for (const a of r.audio) console.log(`${a.label.padEnd(40)} ${a.supported}`);
}
