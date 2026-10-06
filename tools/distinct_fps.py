#!/usr/bin/env python3
"""Count DISTINCT video fps — shared Media / RTC / Vision method.

Live criterion: ≥24 DISTINCT fps (not 30 container ticks with duplicates).
Exact MD5 of decoded gray plane + near-dup (mean abs diff) for lossy
re-encodes (e.g. MediaRecorder of an SFU-received track).

Near-dup default --threshold 0.5 (gray 0–255), calibrated on take-4 talking-head
crops + intentional AA duplicates re-encoded VP8 @150 kbps 320x180 and
@1.5 Mbps 720p (see tools/testdata/mad_calibration.json):
  true-dup MAD @1.5M: p50≈0.31 p95≈0.92; @150k: p50≈0.26 p95≈1.30
  true-distinct consecutive MAD: p50≈1.02 min≈0.10
  t=0.5 → ~87% catch on 1.5M dups, ~8% false-dup on talking head
  (exact hash catches 0% of lossy AA pairs — near-dup is required for RTC).
Raise toward 1.0–1.25 only if hunting aggressive low-bitrate dups and motion
is known high; lower if static heads falsely collapse distinct fps.

Usage:
  python3 distinct_fps.py video.webm [more.webm...]
  python3 distinct_fps.py --threshold 0.5 --json-out report.json a.webm b.webm

Requires: python3, ffmpeg, ffprobe; numpy recommended.
"""
from __future__ import annotations
import argparse, hashlib, json, subprocess, sys
from pathlib import Path

try:
    import numpy as np
except ImportError:
    np = None


def ffprobe_json(path: Path, entries: str, which: str = "stream") -> dict:
    return json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", entries, "-of", "json", str(path)]))


def probe_wh(path: Path):
    s = ffprobe_json(path, "stream=width,height")["streams"][0]
    return int(s["width"]), int(s["height"])


def probe_pts(path: Path) -> list[float]:
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "frame=pts_time", "-of", "csv=p=0", str(path)], text=True)
    pts = []
    for line in out.splitlines():
        tok = line.strip().rstrip(",").split(",")[0]
        if tok and tok != "N/A":
            pts.append(float(tok))
    return pts


def decode_gray(path: Path, w: int, h: int):
    fb = w * h
    # passthrough: WebM VFR often advertises r_frame_rate=1000/1; without this
    # ffmpeg emits duplicate ticks and inflates frame count ~30×.
    proc = subprocess.Popen([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path),
        "-an", "-fps_mode", "passthrough", "-vf", "format=gray",
        "-f", "rawvideo", "-pix_fmt", "gray", "-"],
        stdout=subprocess.PIPE)
    while True:
        buf = proc.stdout.read(fb)
        if not buf or len(buf) < fb:
            break
        yield buf
    proc.wait()


def mad(a: bytes, b: bytes) -> float:
    if np is not None:
        x = np.frombuffer(a, np.uint8).astype(np.float32)
        y = np.frombuffer(b, np.uint8).astype(np.float32)
        return float(np.mean(np.abs(x - y)))
    return sum(abs(a[i] - b[i]) for i in range(len(a))) / float(len(a))


def analyze(path: Path, thresh: float) -> dict:
    w, h = probe_wh(path)
    pts = probe_pts(path)
    hashes: list[str] = []
    near_new: list[bool] = []  # True = counts as distinct vs previous (near-dup test)
    prev = prev_h = None
    run = max_run = 1
    max_run_i = near_run = max_near_run = 1
    max_near_i = 0
    for i, buf in enumerate(decode_gray(path, w, h)):
        hx = hashlib.md5(buf).hexdigest()
        hashes.append(hx)
        if prev is None:
            near_new.append(True)
        else:
            is_dup = mad(buf, prev) < thresh
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
        prev, prev_h = buf, hx
    n = len(hashes)
    if n == 0:
        raise SystemExit(f"no frames: {path}")
    if len(pts) < n:
        # synthesize remaining pts from median dt
        dt = (pts[-1] - pts[0]) / max(len(pts) - 1, 1) if len(pts) > 1 else 1 / 30.0
        while len(pts) < n:
            pts.append(pts[-1] + dt if pts else len(pts) / 30.0)
    pts = pts[:n]
    t0, t1 = pts[0], pts[-1]
    med_dt = sorted(pts[i + 1] - pts[i] for i in range(n - 1))[(n - 1) // 2] if n > 1 else 1 / 30.0
    dur = (t1 - t0) + med_dt
    container_fps = (n - 1) / max(t1 - t0, 1e-9) if n > 1 else 0.0
    n_exact, n_near = len(set(hashes)), sum(near_new)

    def run_ms(start: int, length: int) -> float:
        if length <= 1:
            return 0.0
        return (pts[start + length - 1] - pts[start]) * 1000.0

    windows: dict[int, set] = {}
    for i, hx in enumerate(hashes):
        windows.setdefault(int((pts[i] - t0) // 1.0), set()).add(hx)
    counts = [len(s) for s in windows.values()] or [0]
    ge24 = sum(1 for c in counts if c >= 24)
    return {
        "path": str(path), "width": w, "height": h,
        "total_frames": n, "duration_s": round(dur, 4),
        "container_fps_pts": round(container_fps, 3),
        "near_dup_threshold": thresh,
        "distinct_frames_exact": n_exact,
        "distinct_fps_exact": round(n_exact / dur, 3),
        "distinct_frames_near": n_near,
        "distinct_fps_near": round(n_near / dur, 3),
        "longest_repeat_run_frames": max_run,
        "longest_repeat_run_ms": round(run_ms(max_run_i, max_run), 1),
        "longest_neardup_run_frames": max_near_run,
        "longest_neardup_run_ms": round(run_ms(max_near_i, max_near_run), 1),
        "windows_1s_count": len(counts),
        "windows_1s_share_ge24": round(ge24 / len(counts), 4),
        "windows_1s_min_distinct": int(min(counts)),
        "windows_1s_median_distinct": int(sorted(counts)[len(counts) // 2]),
    }


def summary_line(r: dict) -> str:
    return (f"{Path(r['path']).name}: frames={r['total_frames']} dur={r['duration_s']}s "
            f"container_fps={r['container_fps_pts']} "
            f"distinct_fps_exact={r['distinct_fps_exact']} "
            f"distinct_fps_near={r['distinct_fps_near']} "
            f"thresh={r['near_dup_threshold']} "
            f"max_repeat={r['longest_repeat_run_frames']}f/{r['longest_repeat_run_ms']}ms "
            f"max_neardup={r['longest_neardup_run_frames']}f/{r['longest_neardup_run_ms']}ms "
            f"win≥24={r['windows_1s_share_ge24']} (min={r['windows_1s_min_distinct']})")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("videos", nargs="+", type=Path)
    ap.add_argument("--threshold", type=float, default=0.5,
                    help="near-dup mean abs diff on gray 0-255 (default 0.5, RTC-calibrated)")
    ap.add_argument("--json-out", type=Path, default=None)
    args = ap.parse_args()
    results = []
    for p in args.videos:
        if not p.exists():
            raise SystemExit(f"missing: {p}")
        r = analyze(p, args.threshold)
        results.append(r)
        print(summary_line(r), flush=True)
    blob = {"threshold": args.threshold, "videos": results}
    text = json.dumps(blob, indent=2)
    if args.json_out:
        args.json_out.write_text(text)
    else:
        print(text)


if __name__ == "__main__":
    main()
