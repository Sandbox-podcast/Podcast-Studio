#!/usr/bin/env python3
"""S3 server matte, CUDA EP (desktop-ai) or DML: (1) realtime N-stream throughput, (2) ds sweep 25-40s C/E2-fgr + stills.
Measures only. Writes JSON + PNG to OUT."""
from __future__ import annotations
import argparse, json, subprocess, threading, time, statistics, os
from pathlib import Path
import numpy as np
import onnxruntime as ort
from PIL import Image, ImageFilter

BASE = Path(r"C:\Users\azero\podcast-studio\s3-cuda")
SRC = BASE / "vision-host-raw-1791240416301.webm"
MODEL = BASE / "rvm_mobilenetv3_fp32.onnx"
FFMPEG = "ffmpeg"
OUT = BASE / "out"
EP = "cuda"
W, H, FPS = 1280, 720, 30

def pct(v, p):
    s = sorted(v)
    if not s: return None
    k = (len(s)-1)*p/100; f = int(k); c = min(f+1, len(s)-1)
    return round(s[f]+(s[c]-s[f])*(k-f), 2)

def decode(ss, dur):
    cmd = [FFMPEG, "-hide_banner", "-loglevel", "error", "-ss", str(ss), "-i", str(SRC), "-t", str(dur),
           "-an", "-vf", f"fps={FPS},scale={W}:{H}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    n = len(raw)//(W*H*3)
    return np.frombuffer(raw[:n*W*H*3], np.uint8).reshape(n, H, W, 3)

def session(dev):
    so = ort.SessionOptions(); so.enable_mem_pattern = False
    so.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    if EP == "cuda":
        prov = [("CUDAExecutionProvider", {"device_id": dev}), "CPUExecutionProvider"]
    else:
        prov = [("DmlExecutionProvider", {"device_id": dev})]
    s = ort.InferenceSession(str(MODEL), so, providers=prov)
    assert s.get_providers()[0] == ("CUDAExecutionProvider" if EP == "cuda" else "DmlExecutionProvider"), s.get_providers()
    return s

def erode_low(a, th=0.5):
    am = Image.fromarray((np.clip(a,0,1)*255).astype(np.uint8))
    er = np.array(am.filter(ImageFilter.MinFilter(3))).astype(np.float32)/255.0
    o = a.copy(); m = a < th; o[m] = er[m]; return o

def run1(sess, rec, src, dsr):
    fgr, pha, *rec2 = sess.run(None, {"src": src, "r1i": rec[0], "r2i": rec[1], "r3i": rec[2], "r4i": rec[3], "downsample_ratio": dsr})
    return fgr, pha, rec2

def gpu_sampler(stop, out):
    while not stop.wait(1.0):
        try:
            out.append(subprocess.check_output(["nvidia-smi", "--query-gpu=utilization.gpu,memory.used", "--format=csv,noheader,nounits"], text=True, timeout=5).strip())
        except Exception as e:
            out.append(f"ERR {e}")

def realtime(frames, n, dev, ds, secs, mode):
    """N independent streams, each paced at 30 fps; a frame that arrives while busy is dropped (live behaviour)."""
    sessions = [session(dev) for _ in range(n)]
    dsr = np.array([ds], np.float32)
    # warmup
    for s in sessions:
        rec = [np.zeros((1,1,1,1), np.float32)]*4
        for i in range(10):
            src = (frames[i].astype(np.float32)/255.0).transpose(2,0,1)[None]
            _, _, rec = run1(s, rec, src, dsr)
    stats = [dict(done=0, lat=[], inf=[]) for _ in range(n)]
    t_start = time.perf_counter() + 0.5
    t_end = t_start + secs
    def worker(k):
        s = sessions[k]; rec = [np.zeros((1,1,1,1), np.float32)]*4
        st = stats[k]; nf = len(frames)
        while True:
            now = time.perf_counter()
            if now >= t_end: break
            if now < t_start: time.sleep(t_start-now); continue
            idx = int((now - t_start)*FPS)  # latest available source frame
            arrival = t_start + idx/FPS
            src = (frames[idx % nf].astype(np.float32)/255.0).transpose(2,0,1)[None]
            ti = time.perf_counter()
            fgr, pha, rec = run1(s, rec, src, dsr)
            st["inf"].append((time.perf_counter()-ti)*1000)
            a = pha[0,0]
            if mode == "E2-fgr":
                a = erode_low(a)
                _ = (fgr[0].transpose(1,2,0)*255).clip(0,255).astype(np.uint8)
            st["lat"].append((time.perf_counter()-arrival)*1000)
            st["done"] += 1
            nxt = t_start + (idx+1)/FPS
            w = nxt - time.perf_counter()
            if w > 0: time.sleep(w)
    stop = threading.Event(); g = []
    threading.Thread(target=gpu_sampler, args=(stop, g), daemon=True).start()
    th = [threading.Thread(target=worker, args=(k,)) for k in range(n)]
    [t.start() for t in th]; [t.join() for t in th]; stop.set()
    per = []
    for st in stats:
        per.append(dict(fps=round(st["done"]/secs, 2), lat_p50=pct(st["lat"],50), lat_p95=pct(st["lat"],95),
                        inf_p50=pct(st["inf"],50), inf_p95=pct(st["inf"],95)))
    util = [int(x.split(",")[0]) for x in g if not x.startswith("ERR")]
    mem = [int(x.split(",")[1]) for x in g if not x.startswith("ERR")]
    return dict(n=n, ds=ds, mode=mode, secs=secs, streams=per,
                fps_min=min(p["fps"] for p in per), fps_mean=round(statistics.mean(p["fps"] for p in per), 2),
                lat_p95_max=max(p["lat_p95"] for p in per),
                gpu_util_mean=round(statistics.mean(util),1) if util else None, gpu_util_max=max(util) if util else None,
                gpu_mem_max_mb=max(mem) if mem else None)

def checker(h, w, cell=16):
    yy, xx = np.mgrid[0:h, 0:w]
    c = np.where(((xx//cell)+(yy//cell))%2==0, 200, 120).astype(np.float32)
    return np.stack([c,c,c], -1)

def sweep(frames, dev, grid, still_idx):
    """Sequential offline pass on 25-40s for C and E2-fgr at each ds; inference + post timed; stills on checker."""
    res = []; chk = checker(H, W)
    for mode, ds in grid:
        if True:
            s = session(dev); rec = [np.zeros((1,1,1,1), np.float32)]*4; dsr = np.array([ds], np.float32)
            inf, post = [], []; stills = {}
            t0 = time.perf_counter()
            for i, fr in enumerate(frames):
                src = (fr.astype(np.float32)/255.0).transpose(2,0,1)[None]
                ti = time.perf_counter(); fgr, pha, rec = run1(s, rec, src, dsr); inf.append((time.perf_counter()-ti)*1000)
                tp = time.perf_counter()
                a = pha[0,0]; f = (fgr[0].transpose(1,2,0)*255).clip(0,255)
                if mode == "E2-fgr": a = erode_low(a)
                post.append((time.perf_counter()-tp)*1000)
                if i in still_idx:
                    comp = (f*a[...,None] + chk*(1-a[...,None])).clip(0,255).astype(np.uint8)
                    stills[i] = comp
            wall = time.perf_counter()-t0
            n = len(frames)
            tag = f"{mode}-ds{ds}"
            for i, img in stills.items():
                Image.fromarray(img).save(OUT / f"still-{tag}-t{25 + i/FPS:.1f}.png")
            res.append(dict(mode=mode, ds=ds, frames=n, wall_s=round(wall,2),
                            s_per_min_total=round(wall/(n/FPS)*60, 2),
                            s_per_min_inf=round(sum(inf)/1000/(n/FPS)*60, 2),
                            inf_p50=pct(inf,50), inf_p95=pct(inf,95), post_p50=pct(post,50)))
            print(json.dumps(res[-1]), flush=True)
    return res

def child(a):
    frames = decode(25, 15)
    t0 = a.start_at
    r = realtime_one(frames, a.dev, a.rt_ds, a.secs, a.rt_mode, t0)
    (OUT/f"rt-n{a.n}-k{a.child}.json").write_text(json.dumps(r))

def realtime_one(frames, dev, ds, secs, mode, t_wall_start):
    s = session(dev); dsr = np.array([ds], np.float32); rec = [np.zeros((1,1,1,1), np.float32)]*4
    for i in range(10):
        src = (frames[i].astype(np.float32)/255.0).transpose(2,0,1)[None]; _, _, rec = run1(s, rec, src, dsr)
    rec = [np.zeros((1,1,1,1), np.float32)]*4
    while time.time() < t_wall_start: time.sleep(0.005)
    t_start = time.perf_counter(); t_end = t_start + secs
    st = dict(done=0, lat=[], inf=[]); nf = len(frames)
    while True:
        now = time.perf_counter()
        if now >= t_end: break
        idx = int((now - t_start)*FPS); arrival = t_start + idx/FPS
        src = (frames[idx % nf].astype(np.float32)/255.0).transpose(2,0,1)[None]
        ti = time.perf_counter(); fgr, pha, rec = run1(s, rec, src, dsr); st["inf"].append((time.perf_counter()-ti)*1000)
        a = pha[0,0]
        if mode == "E2-fgr":
            a = erode_low(a); _ = (fgr[0].transpose(1,2,0)*255).clip(0,255).astype(np.uint8)
        st["lat"].append((time.perf_counter()-arrival)*1000); st["done"] += 1
        w = t_start + (idx+1)/FPS - time.perf_counter()
        if w > 0: time.sleep(w)
    return dict(fps=round(st["done"]/secs, 2), lat_p50=pct(st["lat"],50), lat_p95=pct(st["lat"],95),
                inf_p50=pct(st["inf"],50), inf_p95=pct(st["inf"],95))

def realtime_mp(n, a):
    import sys
    for f in OUT.glob(f"rt-n{n}-k*.json"): f.unlink()
    start_at = time.time() + 20 + 2*n  # time for children to decode + warm up
    procs = [subprocess.Popen([sys.executable, __file__, "--child", str(k), "--n", str(n), "--start-at", str(start_at),
                               "--dev", str(a.dev), "--rt-ds", str(a.rt_ds), "--secs", str(a.secs), "--rt-mode", a.rt_mode, "--ep", EP])
             for k in range(n)]
    while time.time() < start_at: time.sleep(0.1)
    stop = threading.Event(); g = []
    threading.Thread(target=gpu_sampler, args=(stop, g), daemon=True).start()
    codes = [p.wait() for p in procs]; stop.set()
    per = []
    for k in range(n):
        f = OUT/f"rt-n{n}-k{k}.json"
        per.append(json.loads(f.read_text()) if f.exists() else dict(fps=None, error=f"exit {codes[k]}"))
    ok = [p for p in per if p.get("fps") is not None]
    util = [int(x.split(",")[0]) for x in g if not x.startswith("ERR")]
    mem = [int(x.split(",")[1]) for x in g if not x.startswith("ERR")]
    return dict(n=n, ds=a.rt_ds, mode=a.rt_mode, secs=a.secs, procs="one per stream", exit_codes=codes, streams=per,
                fps_min=min((p["fps"] for p in ok), default=None), fps_mean=round(statistics.mean(p["fps"] for p in ok), 2) if ok else None,
                lat_p95_max=max((p["lat_p95"] for p in ok), default=None),
                gpu_util_mean=round(statistics.mean(util),1) if util else None, gpu_util_max=max(util) if util else None,
                gpu_mem_max_mb=max(mem) if mem else None)

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dev", type=int, default=0)
    ap.add_argument("--ep", default="cuda")
    ap.add_argument("--ns", default="1,2,3,5")
    ap.add_argument("--secs", type=int, default=60)
    ap.add_argument("--rt-ds", type=float, default=0.4)
    ap.add_argument("--rt-mode", default="C")
    ap.add_argument("--grid", default="C:0.25,C:0.4,E2-fgr:0.4")
    ap.add_argument("--skip-rt", action="store_true")
    ap.add_argument("--skip-sweep", action="store_true")
    ap.add_argument("--child", type=int, default=None)
    ap.add_argument("--n", type=int, default=1)
    ap.add_argument("--start-at", type=float, default=0)
    a = ap.parse_args()
    EP = a.ep
    if EP == "cuda" and hasattr(ort, "preload_dlls"): ort.preload_dlls()
    OUT.mkdir(parents=True, exist_ok=True)
    if a.child is not None:
        child(a); raise SystemExit(0)
    meta = dict(start=time.strftime("%Y-%m-%d %H:%M:%S"), ort=ort.__version__, ep=EP, providers=ort.get_available_providers(), dev=a.dev)
    try: meta["gpu"] = subprocess.check_output(["nvidia-smi","--query-gpu=name,driver_version,utilization.gpu,memory.used","--format=csv,noheader"], text=True).strip()
    except Exception as e: meta["gpu"] = str(e)
    out = dict(meta=meta)
    frames = decode(25, 15)
    meta["frames_25_40"] = int(len(frames))
    if not a.skip_sweep:
        still_idx = {int(round((t-25)*FPS)) for t in (32.0, 33.2, 33.4, 33.6, 33.8, 34.0, 37.37)}
        grid = [(g.split(":")[0], float(g.split(":")[1])) for g in a.grid.split(",")]
        out["sweep"] = sweep(frames, a.dev, grid, still_idx)
        (OUT/"result-cuda.json").write_text(json.dumps(out, indent=1))
    if not a.skip_rt:
        out["realtime"] = []
        for n in [int(x) for x in a.ns.split(",")]:
            r = realtime_mp(n, a); out["realtime"].append(r)
            print(json.dumps({k: r[k] for k in ("n","fps_min","fps_mean","lat_p95_max","gpu_util_mean","exit_codes")}), flush=True)
            (OUT/"result-cuda.json").write_text(json.dumps(out, indent=1))
            time.sleep(5)
    meta["end"] = time.strftime("%Y-%m-%d %H:%M:%S")
    (OUT/"result-cuda.json").write_text(json.dumps(out, indent=1))
    print("DONE", flush=True)
