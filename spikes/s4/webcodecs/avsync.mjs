/** A/V marker analysis: flash onsets (video luma) vs beep onsets (audio RMS) in a recorded file. node avsync.mjs <file> <tag> */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const [file, tag] = process.argv.slice(2);
const v = spawnSync('ffmpeg', ['-hide_banner', '-copyts', '-i', file, '-map', '0:v:0', '-vf', 'scale=64:36,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
const a = spawnSync('ffmpeg', ['-hide_banner', '-copyts', '-i', file, '-map', '0:a:0', '-af', 'asetnsamples=n=240:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
const parse = (txt, key) => { const out = []; let t = null; for (const l of txt.split('\n')) { const m = l.match(/pts_time:([\d.]+)/); if (m) t = Number(m[1]); const k = l.match(new RegExp(key + '=(-?[\\d.]+|-inf)')); if (k && t !== null) out.push([t, k[1] === '-inf' ? -200 : Number(k[1])]); } return out; };
const vs = parse(v.stdout, 'lavfi.signalstats.YAVG'), as = parse(a.stdout, 'lavfi.astats.Overall.RMS_level');
const onsets = (series, thr) => { const o = []; let on = false; for (const [t, x] of series) { if (!on && x > thr) { o.push(t); on = true; } else if (on && x < thr) on = false; } return o; };
const vOn = onsets(vs, 180), aOn = onsets(as, -30);
const pairs = vOn.map((tv) => { const ta = aOn.reduce((best, x) => (Math.abs(x - tv) < Math.abs(best - tv) ? x : best), Infinity); return { video: +tv.toFixed(4), audio: +ta.toFixed(4), audioMinusVideoMs: +((ta - tv) * 1000).toFixed(1) }; }).filter((p) => Math.abs(p.audioMinusVideoMs) < 1000);
const d = pairs.map((p) => p.audioMinusVideoMs).sort((x, y) => x - y);
const res = { file, label: 'localhost / headless / synthetic', videoFrames: vs.length, audioWindows5ms: as.length, videoOnsets: vOn.length, audioOnsets: aOn.length, pairs, medianAudioMinusVideoMs: d.length ? d[Math.floor(d.length / 2)] : null, minMs: d[0], maxMs: d.at(-1), resolutionNote: 'video onset quantized to frame (~33 ms); audio to 5 ms windows' };
fs.writeFileSync(`out/${tag}-avsync.json`, JSON.stringify(res, null, 2));
console.log(JSON.stringify({ ...res, pairs: undefined }), JSON.stringify(pairs.slice(0, 4)));
