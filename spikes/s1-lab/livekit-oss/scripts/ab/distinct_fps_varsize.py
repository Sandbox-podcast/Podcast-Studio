#!/usr/bin/env python3
"""Variable-resolution-safe re-implementation of tools/distinct_fps.py metrics (RTC lane, box-only).

Media's tool reads width/height once (stream header = first frame) and lets ffmpeg's default
`autoscale` silently rescale every later frame to that size (bicubic) before MAD diffing.
Modes here:
  native : decode with -noautoscale, read each frame at its OWN size (sizes from ffprobe);
           MAD only between same-size neighbours; a size change counts as 1 distinct frame.
  fixed:WxH : explicit `scale=W:H:flags=area` for every frame, then the same algorithm as the tool.
Metrics/names mirror distinct_fps.py (exact md5, near-dup MAD < threshold, 1 s windows on exact hashes),
plus windows on near-distinct frames.
"""
import argparse, hashlib, json, subprocess, sys
from pathlib import Path
import numpy as np

def frames_meta(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
        "frame=pts_time,width,height", "-of", "json", str(path)])
    fr = json.loads(out)["frames"]
    return [(float(f["pts_time"]) if f.get("pts_time") not in (None, "N/A") else None, int(f["width"]), int(f["height"])) for f in fr]

def decode(path, mode, meta):
    if mode == "native":
        cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path), "-an", "-fps_mode", "passthrough",
               "-noautoscale", "-vf", "format=gray", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"]
        sizes = [(w, h) for _, w, h in meta]
    else:
        W, H = map(int, mode.split(":")[1].split("x"))
        cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path), "-an", "-fps_mode", "passthrough",
               "-vf", f"scale={W}:{H}:flags=area,format=gray", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"]
        sizes = [(W, H)] * len(meta)
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    for (w, h) in sizes:
        buf = p.stdout.read(w * h)
        if len(buf) < w * h:
            break
        yield (w, h), buf
    rest = p.stdout.read()
    p.wait()
    if rest:
        print(f"WARNING {path.name} {mode}: {len(rest)} trailing bytes (size list mismatch)", file=sys.stderr)

def analyze(path, mode, thresh):
    meta = frames_meta(path)
    pts = [m[0] for m in meta]
    hashes, near_new, sizes = [], [], []
    prev = None; prev_sz = None; near_run = max_near = 1; size_changes = 0
    for (sz, buf) in decode(path, mode, meta):
        hashes.append(hashlib.md5(buf).hexdigest()); sizes.append(sz)
        if prev is None:
            near_new.append(True)
        elif sz != prev_sz:
            near_new.append(True); size_changes += 1; near_run = 1
        else:
            a = np.frombuffer(buf, np.uint8).astype(np.float32); b = np.frombuffer(prev, np.uint8).astype(np.float32)
            dup = float(np.mean(np.abs(a - b))) < thresh
            near_new.append(not dup)
            near_run = near_run + 1 if dup else 1
            max_near = max(max_near, near_run)
        prev, prev_sz = buf, sz
    n = len(hashes); pts = pts[:n]
    t0, t1 = pts[0], pts[-1]
    dts = sorted(pts[i + 1] - pts[i] for i in range(n - 1)); med_dt = dts[(n - 1) // 2] if n > 1 else 1 / 30
    dur = (t1 - t0) + med_dt
    wex, wnear = {}, {}
    for i in range(n):
        k = int((pts[i] - t0) // 1.0)
        wex.setdefault(k, set()).add(hashes[i])
        wnear[k] = wnear.get(k, 0) + (1 if near_new[i] else 0)
    ce = list(len(s) for s in wex.values()); cn = list(wnear.values())
    seg = []
    for sz in sizes:
        if not seg or seg[-1][0] != sz: seg.append([sz, 0])
        seg[-1][1] += 1
    return {"path": path.name, "mode": mode, "threshold": thresh, "total_frames": n, "duration_s": round(dur, 3),
            "size_segments": [f"{s[0][0]}x{s[0][1]}:{s[1]}f" for s in seg], "size_changes": size_changes,
            "distinct_fps_exact": round(len(set(hashes)) / dur, 3), "distinct_fps_near": round(sum(near_new) / dur, 3),
            "longest_neardup_run_frames": max_near,
            "windows_1s_share_ge24_exact": round(sum(c >= 24 for c in ce) / len(ce), 4), "windows_1s_min_exact": min(ce),
            "windows_1s_share_ge24_near": round(sum(c >= 24 for c in cn) / len(cn), 4), "windows_1s_median_near": sorted(cn)[len(cn) // 2]}

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("videos", nargs="+", type=Path)
    ap.add_argument("--threshold", type=float, default=0.5); ap.add_argument("--modes", default="native,fixed:1280x720,fixed:320x180")
    ap.add_argument("--json-out", type=Path)
    a = ap.parse_args(); res = []
    for v in a.videos:
        for m in a.modes.split(","):
            r = analyze(v, m, a.threshold); res.append(r)
            print(f"{r['path']} [{m}] frames={r['total_frames']} segs={r['size_segments']} exact={r['distinct_fps_exact']} near={r['distinct_fps_near']} ge24_exact={r['windows_1s_share_ge24_exact']} ge24_near={r['windows_1s_share_ge24_near']} maxneardup={r['longest_neardup_run_frames']}f", flush=True)
    if a.json_out: a.json_out.write_text(json.dumps(res, indent=2))
