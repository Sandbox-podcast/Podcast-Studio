#!/usr/bin/env python3
"""Count DISTINCT video fps — shared Media / RTC / Vision method (v2, fixes issue #10).

Live criterion: ≥24 DISTINCT fps (not 30 container ticks with duplicates).
Exact MD5 of decoded gray plane + near-dup (mean abs diff) for lossy
re-encodes (e.g. MediaRecorder of an SFU-received track).

v2 (issue #10):
  * Variable-size streams (simulcast/SVC layer switches): frames are decoded at their OWN size
    (`-noautoscale`, per-frame sizes from ffprobe). MAD only between same-size neighbours; a size
    change counts as a distinct frame. `--size-mode first` reproduces v1 (every frame rescaled to
    the first frame's size by ffmpeg's implicit autoscale).
  * 1 s windows now use NEAR-distinct frames (same basis as distinct_fps_near) for share ≥24,
    min, median, p5 and count <24. Exact-hash window stats are kept as *_exact fields.

Near-dup default --threshold 0.5 (gray 0–255), calibrated on take-4 talking-head
crops + intentional AA duplicates re-encoded VP8 @150 kbps 320x180 and
@1.5 Mbps 720p (see tools/testdata/mad_calibration.json):
  true-dup MAD @1.5M: p50≈0.31 p95≈0.92; @150k: p50≈0.26 p95≈1.30
  true-distinct consecutive MAD: p50≈1.02 min≈0.10
  t=0.5 → ~87% catch on 1.5M dups, ~8% false-dup on talking head
  (exact hash catches 0% of lossy AA pairs — near-dup is required for RTC).

Usage:
  python3 distinct_fps.py video.webm [more.webm...]
  python3 distinct_fps.py --threshold 0.5 --json-out report.json a.webm b.webm
  python3 distinct_fps.py --size-mode first a.webm        # v1-compatible decode
  python3 distinct_fps.py --dump-pairs pairs.json a.webm  # per-frame MAD + window counts

Requires: python3, ffmpeg, ffprobe, numpy.
"""
from __future__ import annotations
import argparse, hashlib, json, subprocess
from pathlib import Path

import numpy as np


def frames_meta(path: Path) -> list[tuple[float | None, int, int]]:
    """(pts_time, width, height) per decoded frame, in decode/presentation order."""
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "frame=pts_time,width,height", "-of", "json", str(path)])
    res = []
    for f in json.loads(out).get("frames", []):
        t = f.get("pts_time")
        res.append((float(t) if t not in (None, "N/A") else None, int(f["width"]), int(f["height"])))
    return res


def decode_gray(path: Path, sizes: list[tuple[int, int]], native: bool):
    # passthrough: WebM VFR often advertises r_frame_rate=1000/1; without it ffmpeg duplicates ticks.
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path), "-an", "-fps_mode", "passthrough"]
    if native:
        cmd += ["-noautoscale"]  # keep each frame at its own size (v1 silently rescaled to frame 0)
    cmd += ["-vf", "format=gray", "-f", "rawvideo", "-pix_fmt", "gray", "-"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    for w, h in sizes:
        buf = proc.stdout.read(w * h)
        if len(buf) < w * h:
            break
        yield (w, h), buf
    proc.stdout.read(); proc.wait()


def mad(a: bytes, b: bytes) -> float:
    return float(np.mean(np.abs(np.frombuffer(a, np.uint8).astype(np.float32)
                                - np.frombuffer(b, np.uint8).astype(np.float32))))


def win_stats(counts: list[int], suffix: str) -> dict:
    s = sorted(counts)
    return {f"windows_1s_share_ge24{suffix}": round(sum(c >= 24 for c in s) / len(s), 4),
            f"windows_1s_lt24_count{suffix}": int(sum(c < 24 for c in s)),
            f"windows_1s_min{suffix}": int(s[0]),
            f"windows_1s_p5{suffix}": float(np.percentile(s, 5)),
            f"windows_1s_median{suffix}": float(np.median(s))}


def analyze(path: Path, thresh: float, size_mode: str = "native", dump: list | None = None) -> dict:
    meta = frames_meta(path)
    if not meta:
        raise SystemExit(f"no frames: {path}")
    native = size_mode == "native"
    sizes = [(w, h) for _, w, h in meta] if native else [(meta[0][1], meta[0][2])] * len(meta)
    hashes, near_new, mads, fsz = [], [], [], []
    prev = prev_sz = prev_h = None
    run = max_run = near_run = max_near_run = 1
    max_run_i = max_near_i = 0
    size_changes = 0
    for i, (sz, buf) in enumerate(decode_gray(path, sizes, native)):
        hx = hashlib.md5(buf).hexdigest()
        hashes.append(hx); fsz.append(sz)
        if prev is None:
            near_new.append(True); mads.append(None)
        elif sz != prev_sz:
            near_new.append(True); mads.append(None); size_changes += 1; near_run = 1; run = 1
        else:
            m = mad(buf, prev); mads.append(m)
            is_dup = m < thresh
            near_new.append(not is_dup)
            if hx == prev_h:
                run += 1
                if run > max_run:
                    max_run, max_run_i = run, i - run + 1
            else:
                run = 1
            if is_dup:
                near_run += 1
                if near_run > max_near_run:
                    max_near_run, max_near_i = near_run, i - near_run + 1
            else:
                near_run = 1
        prev, prev_sz, prev_h = buf, sz, hx
    n = len(hashes)
    pts = [m[0] for m in meta[:n]]
    if any(p is None for p in pts):  # fallback: synthesize from index at 30 fps
        pts = [i / 30.0 for i in range(n)]
    t0, t1 = pts[0], pts[-1]
    med_dt = sorted(pts[i + 1] - pts[i] for i in range(n - 1))[(n - 1) // 2] if n > 1 else 1 / 30.0
    dur = (t1 - t0) + med_dt
    container_fps = (n - 1) / max(t1 - t0, 1e-9) if n > 1 else 0.0
    n_exact, n_near = len(set(hashes)), sum(near_new)

    def run_ms(start, length):
        return 0.0 if length <= 1 else (pts[start + length - 1] - pts[start]) * 1000.0

    wex: dict[int, set] = {}; wnear: dict[int, int] = {}
    for i in range(n):
        k = int((pts[i] - t0) // 1.0)
        wex.setdefault(k, set()).add(hashes[i])
        wnear[k] = wnear.get(k, 0) + int(near_new[i])
    keys = sorted(wnear)
    near_counts = [wnear[k] for k in keys]; ex_counts = [len(wex[k]) for k in keys]
    seg = []
    for sz in fsz:
        if not seg or seg[-1][0] != sz:
            seg.append([sz, 0])
        seg[-1][1] += 1
    if dump is not None:
        dump.append({"path": str(path), "pts": pts, "mad_prev": mads, "near_new": near_new,
                     "sizes": [f"{w}x{h}" for w, h in fsz], "window_keys": keys, "window_near": near_counts})
    r = {"path": str(path), "size_mode": size_mode, "size_segments": [f"{s[0][0]}x{s[0][1]}:{s[1]}f" for s in seg],
         "size_changes": size_changes, "total_frames": n, "duration_s": round(dur, 4),
         "container_fps_pts": round(container_fps, 3), "near_dup_threshold": thresh,
         "distinct_frames_exact": n_exact, "distinct_fps_exact": round(n_exact / dur, 3),
         "distinct_frames_near": n_near, "distinct_fps_near": round(n_near / dur, 3),
         "longest_repeat_run_frames": max_run, "longest_repeat_run_ms": round(run_ms(max_run_i, max_run), 1),
         "longest_neardup_run_frames": max_near_run, "longest_neardup_run_ms": round(run_ms(max_near_i, max_near_run), 1),
         "windows_1s_count": len(keys), "windows_1s_basis": "near"}
    r.update(win_stats(near_counts, ""))
    r.update(win_stats(ex_counts, "_exact"))
    return r


def summary_line(r: dict) -> str:
    return (f"{Path(r['path']).name}: frames={r['total_frames']} dur={r['duration_s']}s size_mode={r['size_mode']} "
            f"segs={len(r['size_segments'])} container_fps={r['container_fps_pts']} "
            f"distinct_fps_exact={r['distinct_fps_exact']} distinct_fps_near={r['distinct_fps_near']} "
            f"thresh={r['near_dup_threshold']} max_neardup={r['longest_neardup_run_frames']}f/{r['longest_neardup_run_ms']}ms "
            f"win(near)≥24={r['windows_1s_share_ge24']} median={r['windows_1s_median']} p5={r['windows_1s_p5']} "
            f"min={r['windows_1s_min']} lt24={r['windows_1s_lt24_count']}/{r['windows_1s_count']}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("videos", nargs="+", type=Path)
    ap.add_argument("--threshold", type=float, default=0.5,
                    help="near-dup mean abs diff on gray 0-255 (default 0.5, RTC-calibrated)")
    ap.add_argument("--size-mode", choices=["native", "first"], default="native",
                    help="native (default): each frame at its own size; first: v1 behaviour (rescale to frame 0)")
    ap.add_argument("--json-out", type=Path, default=None)
    ap.add_argument("--dump-pairs", type=Path, default=None, help="write per-frame MAD/near flags + window counts")
    args = ap.parse_args()
    results, dump = [], ([] if args.dump_pairs else None)
    for p in args.videos:
        if not p.exists():
            raise SystemExit(f"missing: {p}")
        r = analyze(p, args.threshold, args.size_mode, dump)
        results.append(r)
        print(summary_line(r), flush=True)
    blob = {"threshold": args.threshold, "size_mode": args.size_mode, "videos": results}
    if args.json_out:
        args.json_out.write_text(json.dumps(blob, indent=2))
    else:
        print(json.dumps(blob, indent=2))
    if args.dump_pairs:
        args.dump_pairs.write_text(json.dumps(dump))


if __name__ == "__main__":
    main()
