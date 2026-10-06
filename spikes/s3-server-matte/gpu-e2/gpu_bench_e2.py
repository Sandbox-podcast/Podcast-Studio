#!/usr/bin/env python3
"""GPU bench: RVM C / E2-fgr / E2b on DirectML - split inference vs post wall times."""
from __future__ import annotations
import argparse, json, os, queue, statistics, subprocess, sys, threading, time
from pathlib import Path
import numpy as np
import onnxruntime as ort
from PIL import Image, ImageFilter

WORK = Path(r"C:\Users\azero\podcast-studio\s3-server-matte\gpu-e2")
SRC = Path(r"C:\Users\azero\podcast-studio\s4-realcam\run4\vision-host-raw-1791240416301.webm")
MODEL = Path(r"C:\Users\azero\podcast-studio\s3-server-matte\models\rvm_mobilenetv3_fp32.onnx")
FFMPEG = r"C:\ProgramData\chocolatey\lib\ffmpeg\tools\ffmpeg\bin\ffmpeg.exe"
W, H, FPS = 1280, 720, 30
STILL_T = [5, 15, 25, 35, 45, 55]


def pct(v, p):
    s = sorted(v)
    if not s:
        return None
    k = (len(s) - 1) * p / 100
    f = int(k)
    c = min(f + 1, len(s) - 1)
    return s[f] + (s[c] - s[f]) * (k - f)


def checkerboard(h, w, cell=16):
    yy, xx = np.mgrid[0:h, 0:w]
    c = np.where(((xx // cell) + (yy // cell)) % 2 == 0, 200, 120).astype(np.uint8)
    return np.stack([c, c, c], -1)


def erode_alpha_low_only(a: np.ndarray, thresh=0.5):
    am = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    eroded = np.array(am.filter(ImageFilter.MinFilter(3))).astype(np.float32) / 255.0
    out = a.copy()
    mask = a < thresh
    out[mask] = eroded[mask]
    return out


def despill_with_bg(rgb_raw, a, bg, band_lo=0.05, band_hi=0.95):
    a = a.astype(np.float32)
    rgb = rgb_raw.astype(np.float32)
    band = (a > band_lo) & (a < band_hi)
    aa = np.maximum(a, 1e-3)[..., None]
    decontam = (rgb - (1.0 - a)[..., None] * bg) / aa
    decontam = decontam.clip(0, 255)
    w = (np.sin(np.pi * np.clip(a, 0, 1)) ** 2)
    w3 = (w * band.astype(np.float32))[..., None]
    out = rgb * (1 - w3) + decontam * w3
    return out.clip(0, 255).astype(np.uint8)


def make_session(dev: int):
    so = ort.SessionOptions()
    so.enable_mem_pattern = False
    so.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    sess = ort.InferenceSession(
        str(MODEL), so, providers=[("DmlExecutionProvider", {"device_id": int(dev)})]
    )
    return sess, sess.get_providers()[0]


def start_reader():
    cmd = [
        FFMPEG, "-hide_banner", "-loglevel", "error",
        "-i", str(SRC), "-an", "-vf", f"fps={FPS}",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=0)
    fb = W * H * 3
    q = queue.Queue(maxsize=16)

    def reader():
        while True:
            buf = bytearray(fb)
            mv = memoryview(buf)
            got = 0
            while got < fb:
                k = proc.stdout.readinto(mv[got:])
                if not k:
                    break
                got += k
            if got < fb:
                q.put(None)
                return
            q.put(buf)

    threading.Thread(target=reader, daemon=True).start()
    return proc, q


def nvidia_sample(stop_evt, samples):
    while not stop_evt.wait(1.0):
        try:
            out = subprocess.check_output(
                [
                    "nvidia-smi",
                    "--query-gpu=name,utilization.gpu,memory.used",
                    "--format=csv,noheader,nounits",
                ],
                text=True,
                timeout=5,
            ).strip()
            samples.append(out)
        except Exception as e:
            samples.append(f"ERR {e}")


def run_variant(
    name: str,
    sess,
    provider_used: str,
    dml_dev: int,
    ds: float,
    mode: str,
    bg=None,
    write_clip: bool = False,
    clip_path: Path | None = None,
    stills_dir: Path | None = None,
    max_frames=None,
):
    """
    mode:
      C       - RVM only (fgr unused)
      E2-fgr  - RVM + erode alpha<0.5 on pha; RGB = fgr
      E2b     - RVM + despill(raw,bg) with opaque<-fgr; no erode (needs bg)
      bg-prep - RVM accumulate temporal bg where alpha<0.02; no timed post
    """
    proc, q = start_reader()
    rec = [np.zeros((1, 1, 1, 1), np.float32)] * 4
    dsr = np.array([ds], np.float32)
    inf_ms, post_ms, pre_ms = [], [], []
    n = 0
    sf = {t * FPS: t for t in STILL_T}
    bg_sum = np.zeros((H, W, 3), np.float64)
    bg_cnt = np.zeros((H, W), np.float64)
    chk = checkerboard(H, W).astype(np.float32)

    enc = None
    if write_clip and clip_path is not None:
        clip_path.parent.mkdir(parents=True, exist_ok=True)
        enc_cmd = [
            FFMPEG, "-y", "-hide_banner", "-loglevel", "error",
            "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
            "-i", "-", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18",
            str(clip_path),
        ]
        enc = subprocess.Popen(enc_cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)

    nvi_stop = threading.Event()
    nvi_samples = []
    threading.Thread(target=nvidia_sample, args=(nvi_stop, nvi_samples), daemon=True).start()

    t0 = time.perf_counter()
    while True:
        raw = q.get()
        if raw is None or (max_frames and n >= max_frames):
            break
        rgb = np.frombuffer(raw, np.uint8).reshape(H, W, 3)

        tpre = time.perf_counter()
        src = (rgb.astype(np.float32) / 255.0).transpose(2, 0, 1)[None]
        pre_ms.append((time.perf_counter() - tpre) * 1000)
        ti = time.perf_counter()
        fgr, pha, *rec = sess.run(
            None,
            {
                "src": src,
                "r1i": rec[0],
                "r2i": rec[1],
                "r3i": rec[2],
                "r4i": rec[3],
                "downsample_ratio": dsr,
            },
        )
        inf_ms.append((time.perf_counter() - ti) * 1000)

        a = pha[0, 0].astype(np.float32)
        f = (fgr[0].transpose(1, 2, 0) * 255).clip(0, 255)

        tp = time.perf_counter()
        out_rgb = None
        out_a = a
        if mode == "bg-prep":
            m = a < 0.02
            bg_cnt += m
            bg_sum += rgb.astype(np.float64) * m[..., None]
        elif mode == "C":
            out_rgb = f.astype(np.uint8)
            out_a = a
        elif mode == "E2-fgr":
            out_rgb = f.astype(np.uint8)
            out_a = erode_alpha_low_only(a, 0.5)
        elif mode == "E2b":
            if bg is None:
                raise RuntimeError("E2b needs bg")
            rgb_d = despill_with_bg(rgb, a, bg)
            opaque = a >= 0.95
            rgb_d = rgb_d.copy()
            rgb_d[opaque] = f.astype(np.uint8)[opaque]
            out_rgb = rgb_d
            out_a = a
        else:
            raise ValueError(mode)
        post_ms.append((time.perf_counter() - tp) * 1000)

        if stills_dir is not None and n in sf and out_rgb is not None:
            t = sf[n]
            stills_dir.mkdir(parents=True, exist_ok=True)
            aa = out_a[..., None]
            comp = (out_rgb.astype(np.float32) * aa + chk * (1 - aa)).clip(0, 255).astype(np.uint8)
            Image.fromarray(comp).save(stills_dir / f"{name}_t{t:02d}_checker.png")
            Image.fromarray(
                np.dstack([out_rgb, (np.clip(out_a, 0, 1) * 255).astype(np.uint8)])
            ).save(stills_dir / f"{name}_t{t:02d}_alpha.png")

        if enc is not None and out_rgb is not None:
            aa = out_a[..., None]
            comp = (out_rgb.astype(np.float32) * aa + chk * (1 - aa)).clip(0, 255).astype(np.uint8)
            enc.stdin.write(comp.tobytes())

        n += 1

    wall = time.perf_counter() - t0
    nvi_stop.set()
    try:
        proc.kill()
    except Exception:
        pass
    if enc is not None:
        try:
            enc.stdin.close()
            enc.wait(timeout=120)
        except Exception:
            try:
                enc.kill()
            except Exception:
                pass

    bg_out = None
    if mode == "bg-prep":
        cnt = np.maximum(bg_cnt[..., None], 1.0)
        bg_out = (bg_sum / cnt).astype(np.float32)
        never = bg_cnt < 1
        bg_out[never] = 245.0

    # drop first 5 frames from inference stats (warmup)
    w_inf = inf_ms[5:] or inf_ms
    w_post = post_ms[5:] or post_ms
    w_pre = pre_ms[5:] or pre_ms
    video_s = n / FPS if n else 0
    inf_wall_equiv = (sum(inf_ms) / 1000.0) if inf_ms else 0
    post_wall_equiv = (sum(post_ms) / 1000.0) if post_ms else 0
    pre_wall_equiv = (sum(pre_ms) / 1000.0) if pre_ms else 0

    result = {
        "variant": name,
        "mode": mode,
        "model": "rvm_mobilenetv3_fp32",
        "downsampleRatio": ds,
        "providerRequested": "DmlExecutionProvider",
        "dmlDeviceId": dml_dev,
        "providerUsed": provider_used,
        "frames": n,
        "videoSeconds": round(video_s, 2),
        "wallSeconds": round(wall, 2),
        "wallFps": round(n / wall, 2) if wall else None,
        "realtimeFactor": round(video_s / wall, 3) if wall else None,
        "secondsPerVideoMinute_TOTAL": round(wall / video_s * 60, 2) if video_s else None,
        "secondsPerVideoMinute_inferenceOnly": round(inf_wall_equiv / video_s * 60, 2) if video_s else None,
        "secondsPerVideoMinute_postOnly": round(post_wall_equiv / video_s * 60, 2) if video_s else None,
        "secondsPerVideoMinute_preprocOnly": round(pre_wall_equiv / video_s * 60, 2) if video_s else None,
        "inferenceMsAvg": round(statistics.mean(w_inf), 2) if w_inf else None,
        "inferenceMsP95": round(pct(w_inf, 95), 2) if w_inf else None,
        "preprocMsAvg": round(statistics.mean(w_pre), 2) if w_pre else None,
        "postMsAvg": round(statistics.mean(w_post), 2) if w_post else None,
        "postMsP95": round(pct(w_post, 95), 2) if w_post else None,
        "nvidiaSmiSamples": nvi_samples[:8] + (["..."] if len(nvi_samples) > 8 else []) + nvi_samples[-3:],
        "nvidiaSampleCount": len(nvi_samples),
        "clip": str(clip_path) if write_clip and clip_path else None,
        "notes": (
            "wall TOTAL = decode reader + preproc-in-inf path + sess.run + post + optional stills/clip encode feed; "
            "inference-only s/min = sum(sess.run ms)/video_s*60; first 5 frames excluded from avg/p95 only."
        ),
    }
    return result, bg_out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dev", type=int, default=1, help="DML device_id (1 = RTX 3070 confirmed via nvidia-smi util)")
    ap.add_argument("--max-frames", type=int, default=None)
    ap.add_argument("--skip-bg-prep", action="store_true")
    args = ap.parse_args()

    WORK.mkdir(parents=True, exist_ok=True)
    stills = WORK / "stills"
    stills.mkdir(exist_ok=True)

    print("Loading ORT session...", flush=True)
    sess, used = make_session(args.dev)
    print(f"providerUsed={used} dmlDeviceId={args.dev}", flush=True)
    # quick nvidia before
    try:
        print("nvidia-smi before:", subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name,utilization.gpu,memory.used", "--format=csv,noheader"],
            text=True).strip(), flush=True)
    except Exception as e:
        print("nvidia-smi before ERR", e, flush=True)

    report = {
        "machine": "LAPTOP-BI8P2KF3  -  i7-11370H  -  RTX 3070 Laptop 8GB  -  onnxruntime-directml 1.19.2",
        "source": str(SRC),
        "model": str(MODEL),
        "ack": "tools/distinct_fps.py for next live take - not this run",
        "variants": {},
    }

    # --- C ---
    print("=== C mobilenetv3 ds=0.4 ===", flush=True)
    r_c, _ = run_variant(
        "C", sess, used, args.dev, 0.4, "C",
        stills_dir=stills, max_frames=args.max_frames,
    )
    report["variants"]["C"] = r_c
    (WORK / "result-C.json").write_text(json.dumps(r_c, indent=2), encoding="utf-8")
    print(json.dumps({k: r_c[k] for k in (
        "wallFps", "secondsPerVideoMinute_TOTAL", "secondsPerVideoMinute_inferenceOnly",
        "inferenceMsAvg", "postMsAvg", "providerUsed", "frames")}, indent=2), flush=True)

    # --- E2-fgr (+ flicker clip) ---
    print("=== E2-fgr (+ flicker clip) ===", flush=True)
    clip = WORK / "flicker-E2-fgr-checker.mp4"
    r_fgr, _ = run_variant(
        "E2-fgr", sess, used, args.dev, 0.4, "E2-fgr",
        write_clip=True, clip_path=clip, stills_dir=stills, max_frames=args.max_frames,
    )
    report["variants"]["E2-fgr"] = r_fgr
    (WORK / "result-E2-fgr.json").write_text(json.dumps(r_fgr, indent=2), encoding="utf-8")
    print(json.dumps({k: r_fgr[k] for k in (
        "wallFps", "secondsPerVideoMinute_TOTAL", "secondsPerVideoMinute_inferenceOnly",
        "secondsPerVideoMinute_postOnly", "inferenceMsAvg", "postMsAvg", "clip", "frames")}, indent=2), flush=True)

    # --- bg prep for E2b ---
    bg = None
    if not args.skip_bg_prep:
        print("=== bg-prep (temporal mean a<0.02) ===", flush=True)
        r_bg, bg = run_variant(
            "bg-prep", sess, used, args.dev, 0.4, "bg-prep", max_frames=args.max_frames,
        )
        report["variants"]["bg-prep"] = r_bg
        Image.fromarray(bg.clip(0, 255).astype(np.uint8)).save(WORK / "bg_temporal_mean.png")
        (WORK / "result-bg-prep.json").write_text(json.dumps(r_bg, indent=2), encoding="utf-8")
    else:
        p = WORK / "bg_temporal_mean.png"
        bg = np.array(Image.open(p).convert("RGB")).astype(np.float32)

    # --- E2b ---
    print("=== E2b ===", flush=True)
    r_e2b, _ = run_variant(
        "E2b", sess, used, args.dev, 0.4, "E2b", bg=bg,
        stills_dir=stills, max_frames=args.max_frames,
    )
    report["variants"]["E2b"] = r_e2b
    (WORK / "result-E2b.json").write_text(json.dumps(r_e2b, indent=2), encoding="utf-8")
    print(json.dumps({k: r_e2b[k] for k in (
        "wallFps", "secondsPerVideoMinute_TOTAL", "secondsPerVideoMinute_inferenceOnly",
        "secondsPerVideoMinute_postOnly", "inferenceMsAvg", "postMsAvg", "frames")}, indent=2), flush=True)

    # If DML device might be Intel, note util from samples
    report["summaryTable"] = []
    for key in ("C", "E2-fgr", "E2b"):
        v = report["variants"][key]
        report["summaryTable"].append({
            "variant": key,
            "wallFps": v["wallFps"],
            "s_per_min_TOTAL": v["secondsPerVideoMinute_TOTAL"],
            "s_per_min_inferenceOnly": v["secondsPerVideoMinute_inferenceOnly"],
            "s_per_min_postOnly": v["secondsPerVideoMinute_postOnly"],
            "inferenceMsAvg": v["inferenceMsAvg"],
            "postMsAvg": v["postMsAvg"],
            "providerUsed": v["providerUsed"],
            "dmlDeviceId": v["dmlDeviceId"],
            "nvidiaSampleHead": (v.get("nvidiaSmiSamples") or [None])[0],
        })

    out = WORK / "result-gpu-e2.json"
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("WROTE", out, flush=True)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
