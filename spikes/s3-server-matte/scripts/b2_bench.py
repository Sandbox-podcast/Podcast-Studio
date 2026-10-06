#!/usr/bin/env python3
"""S3 edge treatments on C ds0.25 (CUDA): base / a=FG decontam (blur-fusion, Forte&Pitie 2021) / b=choke 1px+soft / c=a+b.
Stills only (32.0, 33.4, 33.6, 37.37 s). Composites on checker, #111, #eee + x2 crops. Measures only."""
import json, subprocess, time
from pathlib import Path
import numpy as np, onnxruntime as ort
from PIL import Image, ImageFilter
BASE = Path(r"C:\Users\azero\podcast-studio\s3-cuda"); OUT = BASE / "edges"; OUT.mkdir(exist_ok=True)
SRC = BASE / "vision-host-raw-1791240416301.webm"; MODEL = BASE / "rvm_mobilenetv3_fp32.onnx"
W, H, FPS, DS = 1280, 720, 30, 0.25
TS = [32.0, 33.4, 33.6, 37.37]

def decode():
    raw = subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-ss","25","-i",str(SRC),"-t","15","-an",
        "-vf",f"fps={FPS},scale={W}:{H}","-f","rawvideo","-pix_fmt","rgb24","-"], capture_output=True, check=True).stdout
    n = len(raw)//(W*H*3); return np.frombuffer(raw[:n*W*H*3], np.uint8).reshape(n,H,W,3)

def box(x, r):  # separable box blur, window r (like cv2.blur(x,(r,r))), edge-replicate
    if r <= 1: return x
    lo, hi = r//2, r - r//2 - 1
    def ax(a, axis):
        pad = [(0,0)]*a.ndim; pad[axis] = (lo+1, hi); p = np.pad(a, pad, mode="edge")
        c = np.cumsum(p, axis=axis, dtype=np.float32)
        n = a.shape[axis]
        return (np.take(c, range(r, r+n), axis=axis) - np.take(c, range(0, n), axis=axis)) / r
    return ax(ax(x, 0), 1)

def fb_blur(img, F, B, a, r):
    ba = box(a, r)
    bF = box(F*a, r) / (ba + 1e-5)
    bB = box(B*(1-a), r) / ((1-ba) + 1e-5)
    F2 = bF + a*(img - a*bF - (1-a)*bB)
    return np.clip(F2, 0, 1), bB

def fg_blur_fusion(img, a):
    a3 = a[..., None]
    F, bB = fb_blur(img, img, img, a3, 91)
    F, _ = fb_blur(img, F, bB, a3, 7)
    return F

def choke_soft(a):
    am = Image.fromarray((np.clip(a,0,1)*255).astype(np.uint8))
    am = am.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    return np.asarray(am, np.float32)/255.0

def checker():
    yy, xx = np.mgrid[0:H, 0:W]; c = np.where(((xx//16)+(yy//16))%2==0, 200, 120).astype(np.float32)/255
    return np.stack([c,c,c], -1)
BGS = {"checker": checker(), "dark": np.full((H,W,3), 0x11/255, np.float32), "light": np.full((H,W,3), 0xee/255, np.float32)}

def timeit(fn, *args, reps=20):
    fn(*args); ts = []
    for _ in range(reps):
        t = time.perf_counter(); fn(*args); ts.append((time.perf_counter()-t)*1000)
    ts.sort(); return round(ts[len(ts)//2], 2)

def crop_box(a, kind):
    if kind == "fingers":  # topmost alpha in left half (viewer's left hand)
        ys, xs = np.nonzero(a[:, :W//2] > 0.5)
    else:  # hair: topmost alpha in central band
        ys, xs = np.nonzero(a[:, W//3:2*W//3] > 0.5); xs = xs + W//3
    y0 = int(ys.min()); x0 = int(np.median(xs[ys < y0+40]))
    cw, ch = 320, 180
    x1 = max(0, min(W-cw, x0-cw//2)); y1 = max(0, min(H-ch, y0-30))
    return (x1, y1, x1+cw, y1+ch)


def choke_soft_n(a, k):
    am = Image.fromarray((np.clip(a,0,1)*255).astype(np.uint8))
    am = am.filter(ImageFilter.MinFilter(k)).filter(ImageFilter.GaussianBlur(0.8))
    return np.asarray(am, np.float32)/255.0

if __name__ == "__main__":
    OUT2 = BASE / "edges-b2"; OUT2.mkdir(parents=True, exist_ok=True)
    ort.preload_dlls()
    s = ort.InferenceSession(str(MODEL), providers=[("CUDAExecutionProvider", {"device_id": 0}), "CPUExecutionProvider"])
    assert s.get_providers()[0] == "CUDAExecutionProvider"
    frames = decode(); want = {int(round((t-25)*FPS)): t for t in TS}
    rec = [np.zeros((1,1,1,1), np.float32)]*4; dsr = np.array([DS], np.float32); got = {}
    for i in range(max(want)+1):
        src = (frames[i].astype(np.float32)/255).transpose(2,0,1)[None]
        fgr, pha, *rec = s.run(None, {"src": src, "r1i": rec[0], "r2i": rec[1], "r3i": rec[2], "r4i": rec[3], "downsample_ratio": dsr})
        if i in want: got[want[i]] = (fgr[0].transpose(1,2,0), pha[0,0])
    _, a = got[37.37]
    cost = {"b1_choke1px_soft": timeit(choke_soft_n, a, 3), "b2_choke2px_soft": timeit(choke_soft_n, a, 5)}
    CROPS = {37.37: {"fingers": (90,110,410,290)}, 32.0: {"hair": (545,46,865,226)}, 33.4: {"fasthand": (380,150,700,330)}}
    meta = dict(ds=DS, post="CPU PIL, Ryzen 7 9800X3D, single thread", cost_ms_per_frame_p50=cost, crops={str(k): v for k, v in CROPS.items()})
    for t, (fgr, a) in got.items():
        var = {"base": a, "b1": choke_soft_n(a, 3), "b2": choke_soft_n(a, 5)}
        for vn, al in var.items():
            for bn, bg in BGS.items():
                comp = (fgr*al[...,None] + bg*(1-al[...,None])).clip(0,1)
                im = Image.fromarray((comp*255).astype(np.uint8))
                im.resize((W//2, H//2), Image.LANCZOS).save(OUT2/f"{vn}-{bn}-t{t}.png")
                for k, bx in CROPS.get(t, {}).items():
                    im.crop(bx).resize((640, 360), Image.NEAREST).save(OUT2/f"crop-{k}-{vn}-{bn}-t{t}.png")
    (OUT2/"result-b2.json").write_text(json.dumps(meta, indent=1)); print(json.dumps(meta)); print("DONE")
