/** ffprobe/ffmpeg analysis of a completed object. CLI: node analyze.mjs <file.mp4|.webm> [tag] → out/<tag>-analysis.json */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const j = (args) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', ...args, '-of', 'json'], { maxBuffer: 1 << 28 }).toString());
const lines = (s) => s.split('\n').filter((l) => l.trim());
// warnings that come from the PNG/scaler output side, not from the container or decoder
const OUTPUT_SIDE = /swscaler|deprecated pixel format|image2|No filtered frames/;

export function analyze(file, tag) {
  const fp = j(['-show_format', '-show_streams', file]);
  const pk = j(['-show_entries', 'packet=stream_index,pts_time,duration_time,flags', file]).packets;
  const span = {};
  for (const p of pk) {
    const s = (span[p.stream_index] ??= { n: 0, first: Infinity, end: -Infinity });
    const t = Number(p.pts_time), d = Number(p.duration_time || 0);
    s.n++; s.first = Math.min(s.first, t); s.end = Math.max(s.end, t + d);
  }
  const vi = fp.streams.find((s) => s.codec_type === 'video')?.index, ai = fp.streams.find((s) => s.codec_type === 'audio')?.index;
  const v = span[vi], a = span[ai];
  const dec = spawnSync('ffmpeg', ['-hide_banner', '-v', 'warning', '-i', file, '-f', 'null', '-'], { encoding: 'utf8' });
  const seek = spawnSync('ffmpeg', ['-hide_banner', '-v', 'warning', '-y', '-ss', '30', '-i', file, '-frames:v', '1', '-update', '1', `out/${tag}-seek30.png`], { encoding: 'utf8' });
  const seekPkt = j(['-select_streams', 'v:0', '-read_intervals', '30%+#1', '-show_entries', 'packet=pts_time,flags', file]).packets?.[0] ?? null;
  // decoded frame pts right after an accurate -ss 30 (what the user sees after seeking)
  const seekFrame = spawnSync('ffmpeg', ['-hide_banner', '-v', 'info', '-copyts', '-ss', '30', '-i', file, '-frames:v', '1', '-vf', 'showinfo', '-f', 'null', '-'], { encoding: 'utf8' });
  const showinfo = (seekFrame.stderr.match(/pts_time:\s*([\d.]+)/) || [])[1];
  const res = {
    file, formatName: fp.format.format_name, formatDuration: fp.format.duration ?? 'N/A', formatBitRate: fp.format.bit_rate ?? 'N/A', size: Number(fp.format.size),
    streams: fp.streams.map((s) => ({ index: s.index, type: s.codec_type, codec: s.codec_name, profile: s.profile, level: s.level, w: s.width, h: s.height, pixFmt: s.pix_fmt, avgFps: s.avg_frame_rate, sampleRate: s.sample_rate, channels: s.channels, duration: s.duration ?? 'N/A', start: s.start_time, bitRate: s.bit_rate ?? 'N/A' })),
    packets: Object.fromEntries(Object.entries(span).map(([k, s]) => [k, { n: s.n, firstPts: +s.first.toFixed(4), endPts: +s.end.toFixed(4), span: +(s.end - s.first).toFixed(4) }])),
    av: v && a ? { audioStartMinusVideoStartMs: +((a.first - v.first) * 1000).toFixed(1), audioEndMinusVideoEndMs: +((a.end - v.end) * 1000).toFixed(1), audioSpanMinusVideoSpanMs: +(((a.end - a.first) - (v.end - v.first)) * 1000).toFixed(1) } : null,
    fullDecode: { exit: dec.status, warnings: lines(dec.stderr).length, sample: lines(dec.stderr).slice(0, 6) },
    seek30: {
      exit: seek.status, containerOrDecoderWarnings: lines(seek.stderr).filter((l) => !OUTPUT_SIDE.test(l)).length, outputSideWarnings: lines(seek.stderr).filter((l) => OUTPUT_SIDE.test(l)).length,
      pngWritten: fs.existsSync(`out/${tag}-seek30.png`) && fs.statSync(`out/${tag}-seek30.png`).size > 0, keyframePacketAtOrBefore30: seekPkt, firstDecodedFramePtsAfterAccurateSeek: showinfo ? Number(showinfo) : null,
    },
  };
  return res;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const tag = process.argv[3] || 'adhoc';
  const r = analyze(process.argv[2], tag);
  fs.writeFileSync(`out/${tag}-analysis.json`, JSON.stringify(r, null, 2));
  console.log(JSON.stringify(r, null, 1));
}
