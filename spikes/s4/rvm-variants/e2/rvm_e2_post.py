#!/usr/bin/env python3
"""
E2 colour-fidelity post-process for RVM mattes (standalone).

Compares A / E / E2 / E2-fgr / E2b on take-4 style stills, or can re-infer.

CLI examples:
  # Default: use existing C stills + one RVM pass for temporal bg mean, write sheets
  python rvm_e2_post.py --raw /path/to/raw.webm --c-stills-dir ../stills --outdir ./out

  # Vision 3070: point --rvm-onnx at mobilenetv3, same flags
  python rvm_e2_post.py --raw take4.webm --outdir ./e2 --downsample 0.4 \\
      --rvm-onnx rvm_mobilenetv3_fp32.onnx --provider CUDAExecutionProvider

Variants
  A       : baseline stills (mnet ds=0.375) — copied for sheet
  E       : prior despill+full erode+luma clamp — copied for sheet
  E2      : despill w/ temporal bg mean (α<0.02), NO luma clamp, erode only where α<0.5
  E2-fgr  : use RVM fgr RGB in band (already decontaminated); erode only α<0.5
  E2b     : same as E2 but NO erosion

Metrics (25s & 45s): hair semitrans luma, gap45 mean α, CIEDE2000 ΔE vs raw
  for opaque hair (α≥0.95) and band (0.05<α<0.95) in hair ROI.
"""
from __future__ import annotations
import argparse, json, os, subprocess, time
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from skimage.color import rgb2lab, deltaE_ciede2000

W, H, FPS = 1280, 720, 30
STILL_T = [5, 15, 25, 35, 45, 55]
STILL_FRAMES = {t * FPS: t for t in STILL_T}
ROI_HAIR = (480, 40, 780, 180)
ROI_GAP = (760, 200, 860, 300)
MACHINE_DEFAULT = "box CPU Intel Xeon · 8 cores · no GPU"


def checkerboard(h, w, cell=16):
    yy, xx = np.mgrid[0:h, 0:w]
    c = np.where(((xx // cell) + (yy // cell)) % 2 == 0, 200, 120).astype(np.uint8)
    return np.stack([c, c, c], -1)


def compose(rgb, a):
    bg = checkerboard(rgb.shape[0], rgb.shape[1]).astype(np.float32)
    aa = a[..., None].astype(np.float32)
    return (rgb.astype(np.float32) * aa + bg * (1 - aa)).clip(0, 255).astype(np.uint8)


def save_rgba_checker(outdir: Path, tag: str, t: int, rgb, a):
    outdir.mkdir(parents=True, exist_ok=True)
    rgba = np.dstack([rgb, (np.clip(a, 0, 1) * 255).astype(np.uint8)])
    Image.fromarray(rgba).save(outdir / f"{tag}_t{t:02d}_alpha.png")
    Image.fromarray(compose(rgb, a)).save(outdir / f"{tag}_t{t:02d}_checker.png")


def load_rgba(path: Path):
    im = np.array(Image.open(path).convert("RGBA"))
    return im[..., :3], im[..., 3].astype(np.float32) / 255.0


def erode_alpha_low_only(a: np.ndarray, thresh=0.5):
    """1px MinFilter erosion applied only where α < thresh; keep α≥thresh unchanged."""
    am = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    eroded = np.array(am.filter(ImageFilter.MinFilter(3))).astype(np.float32) / 255.0
    out = a.copy()
    mask = a < thresh
    out[mask] = eroded[mask]
    return out


def despill_with_bg(rgb_raw, a, bg, band_lo=0.05, band_hi=0.95):
    """Classic alpha despill; NO luma clamp. bg: HxWx3 float."""
    a = a.astype(np.float32)
    rgb = rgb_raw.astype(np.float32)
    band = (a > band_lo) & (a < band_hi)
    aa = np.maximum(a, 1e-3)[..., None]
    decontam = (rgb - (1.0 - a)[..., None] * bg) / aa
    decontam = decontam.clip(0, 255)
    w = (np.sin(np.pi * np.clip(a, 0, 1)) ** 2)  # peak mid-band
    w3 = (w * band.astype(np.float32))[..., None]
    out = rgb * (1 - w3) + decontam * w3
    # outside band keep raw (caller may replace with fgr for opaque)
    return out.clip(0, 255).astype(np.uint8)


def metrics(rgb, a, raw_rgb):
    a = a.astype(np.float32)
    hx0, hy0, hx1, hy1 = ROI_HAIR
    gx0, gy0, gx1, gy1 = ROI_GAP
    hair_a = a[hy0:hy1, hx0:hx1]
    hair_rgb = rgb[hy0:hy1, hx0:hx1].astype(np.float32)
    hair_raw = raw_rgb[hy0:hy1, hx0:hx1].astype(np.float32)
    band = (hair_a > 0.05) & (hair_a < 0.95)
    opaque = hair_a >= 0.95
    gap = a[gy0:gy1, gx0:gx1]

    def luma(arr, m):
        if not m.any():
            return None
        y = 0.2126 * arr[..., 0] + 0.7152 * arr[..., 1] + 0.0722 * arr[..., 2]
        return float(y[m].mean())

    def de_mean(pred, ref, m):
        if not m.any():
            return None
        # skimage expects float 0..1
        lab1 = rgb2lab(pred[m][None, :, :] / 255.0)
        lab2 = rgb2lab(ref[m][None, :, :] / 255.0)
        d = deltaE_ciede2000(lab1, lab2)
        return float(np.mean(d))

    return {
        "partial_alpha_frac": round(float(((a > 0.05) & (a < 0.95)).mean()), 4),
        "gap_mean_alpha": round(float(gap.mean()), 4),
        "hair_semitrans_mean_luma": None if not band.any() else round(luma(hair_rgb, band), 2),
        "deltaE_opaque_hair": None if not opaque.any() else round(de_mean(hair_rgb, hair_raw, opaque), 2),
        "deltaE_band_hair": None if not band.any() else round(de_mean(hair_rgb, hair_raw, band), 2),
        "n_opaque_hair": int(opaque.sum()),
        "n_band_hair": int(band.sum()),
    }


def iter_rgb(path: Path):
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path),
           "-an", "-vf", f"fps={FPS}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    fb = W * H * 3
    i = 0
    while True:
        buf = proc.stdout.read(fb)
        if not buf or len(buf) < fb:
            break
        yield i, np.frombuffer(buf, np.uint8).reshape(H, W, 3)
        i += 1
    try:
        proc.kill()
    except Exception:
        pass


def rvm_pass_temporal_bg_and_stills(raw: Path, onnx: Path, ds: float, provider: str, stills_need: set):
    """One RVM pass: temporal MEAN of raw where α<0.02 → bg map; collect fgr+α at stills."""
    import onnxruntime as ort
    so = ort.SessionOptions()
    so.intra_op_num_threads = max(1, (os.cpu_count() or 8) - 1)
    sess = ort.InferenceSession(str(onnx), so, providers=[provider])
    rec = [np.zeros((1, 1, 1, 1), np.float32)] * 4
    dsr = np.array([ds], np.float32)
    bg_sum = np.zeros((H, W, 3), np.float64)
    bg_cnt = np.zeros((H, W), np.float64)
    stills = {}
    t0 = time.perf_counter()
    n = 0
    for i, rgb in iter_rgb(raw):
        src = (rgb.astype(np.float32) / 255.0).transpose(2, 0, 1)[None]
        fgr, pha, *rec = sess.run(
            None,
            {"src": src, "r1i": rec[0], "r2i": rec[1], "r3i": rec[2], "r4i": rec[3],
             "downsample_ratio": dsr},
        )
        a = pha[0, 0].astype(np.float32)
        m = a < 0.02
        bg_cnt += m
        bg_sum += rgb.astype(np.float64) * m[..., None]
        if i in stills_need:
            f = (fgr[0].transpose(1, 2, 0) * 255).clip(0, 255).astype(np.uint8)
            stills[STILL_FRAMES[i]] = {"fgr": f, "a": a, "raw": rgb.copy()}
        n += 1
    wall = time.perf_counter() - t0
    cnt = np.maximum(bg_cnt[..., None], 1.0)
    bg = (bg_sum / cnt).astype(np.float32)
    # where never seen as bg, fall back to 245
    never = bg_cnt < 1
    bg[never] = 245.0
    return stills, bg, {"frames": n, "wall_s": round(wall, 2),
                        "wall_fps": round(n / wall, 2) if wall else None,
                        "s_per_min": round(wall / (n / FPS) * 60, 1) if n else None}


def build_sheets(outdir: Path, tags_labels, machine: str):
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
        font_sm = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12)
    except Exception:
        font = font_sm = ImageFont.load_default()
    stills = outdir / "stills"
    tw, th, lab_h = 320, 180, 42
    sheet = Image.new("RGB", (tw * 6, (th + lab_h) * len(tags_labels)), (22, 22, 22))
    d = ImageDraw.Draw(sheet)
    for ri, (tag, label) in enumerate(tags_labels):
        y = ri * (th + lab_h)
        d.text((6, y + 2), label, fill=(255, 255, 0), font=font)
        d.text((6, y + 20), machine, fill=(160, 160, 160), font=font_sm)
        for ci, t in enumerate(STILL_T):
            p = stills / f"{tag}_t{t:02d}_checker.png"
            x = ci * tw
            if p.exists():
                sheet.paste(Image.open(p).convert("RGB").resize((tw, th), Image.Resampling.LANCZOS),
                            (x, y + lab_h))
            d.text((x + 6, y + lab_h + 4), f"{t}s", fill=(255, 220, 0), font=font_sm)
    path = outdir / "contact-A-E-E2-checker.png"
    sheet.save(path, optimize=True)

    def head_box(tag, t):
        p = stills / f"{tag}_t{t:02d}_alpha.png"
        if not p.exists():
            return (400, 0, 880, 360)
        aa = np.array(Image.open(p).convert("RGBA"))[..., 3] > 128
        ys, xs = np.where(aa)
        if len(ys) == 0:
            return (400, 0, 880, 360)
        top = int(ys.min())
        cx = int(np.median(xs[ys < top + 150])) if (ys < top + 150).any() else int(xs.mean())
        x0 = max(0, min(W - 480, cx - 240))
        y0 = max(0, min(H - 360, top - 40))
        return (x0, y0, x0 + 480, y0 + 360)

    zw, zh, zlab = 480, 360, 34
    z = Image.new("RGB", (zw * 2, (zh + zlab) * len(tags_labels)), (22, 22, 22))
    dz = ImageDraw.Draw(z)
    for ri, (tag, label) in enumerate(tags_labels):
        y = ri * (zh + zlab)
        dz.text((6, y + 2), label[:90], fill=(255, 255, 0), font=font_sm)
        for ci, t in enumerate([25, 45]):
            p = stills / f"{tag}_t{t:02d}_checker.png"
            if p.exists():
                z.paste(Image.open(p).convert("RGB").crop(head_box(tag, t)), (ci * zw, y + zlab))
            dz.text((ci * zw + 6, y + zlab + 4), f"{t}s head", fill=(255, 220, 0), font=font_sm)
    zpath = outdir / "zoom-head-25-45-native.png"
    z.save(zpath, optimize=True)

    x0, y0, x1, y1 = ROI_GAP
    rw, rh = x1 - x0, y1 - y0
    strip = Image.new("RGB", (rw * len(tags_labels), rh + 26), (22, 22, 22))
    ds = ImageDraw.Draw(strip)
    for i, (tag, label) in enumerate(tags_labels):
        p = stills / f"{tag}_t45_checker.png"
        if p.exists():
            strip.paste(Image.open(p).convert("RGB").crop(ROI_GAP), (i * rw, 26))
        ds.text((i * rw + 4, 4), tag, fill=(255, 255, 0), font=font_sm)
    spath = outdir / "roi-arm-torso-gap-t45.png"
    strip.save(spath, optimize=True)
    return path, zpath, spath


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raw", type=Path, required=True)
    ap.add_argument("--outdir", type=Path, required=True)
    ap.add_argument("--rvm-onnx", type=Path, default=None,
                    help="If set, run one RVM pass for C stills + temporal bg mean")
    ap.add_argument("--downsample", type=float, default=0.4)
    ap.add_argument("--provider", default="CPUExecutionProvider")
    ap.add_argument("--a-stills", type=Path, default=None, help="dir with A_*_alpha.png")
    ap.add_argument("--e-stills", type=Path, default=None, help="dir with E_*_alpha.png (prior E)")
    ap.add_argument("--c-stills", type=Path, default=None,
                    help="optional precomputed C fgr+alpha stills (skip re-infer stills but still need bg pass)")
    ap.add_argument("--machine", default=MACHINE_DEFAULT)
    ap.add_argument("--c-s-per-min", type=float, default=111.5, help="parent C cost to add post ms into")
    ap.add_argument("--reuse", action="store_true",
                    help="Skip RVM; reuse outdir/bg_temporal_mean.png + C stills; rebuild E2* + metrics/sheets")
    args = ap.parse_args()

    out = args.outdir
    stills_dir = out / "stills"
    stills_dir.mkdir(parents=True, exist_ok=True)
    (out / "raw").mkdir(exist_ok=True)

    # Ensure raw reference PNGs
    for t in STILL_T:
        dest = out / "raw" / f"raw_t{t:02d}.png"
        if not dest.exists():
            subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                            "-ss", str(t), "-i", str(args.raw), "-frames:v", "1", str(dest)], check=True)

    report = {"machine": args.machine, "downsample_ratio_C": args.downsample, "variants": {}}

    # --- RVM pass for bg + C stills (or --reuse) ---
    c_stills = {}
    if args.reuse:
        bg_path = out / "bg_temporal_mean.png"
        if not bg_path.exists():
            raise SystemExit(f"--reuse needs {bg_path}")
        bg = np.array(Image.open(bg_path).convert("RGB")).astype(np.float32)
        report["rvm_pass"] = {"reused": True}
        report["bg_estimate"] = "temporal mean of raw RGB where RVM α<0.02 (fallback 245 if never) [reused]"
        for t in STILL_T:
            cp = stills_dir / f"C_mnet_ds040_t{t:02d}_alpha.png"
            if not cp.exists():
                # try parent variants stills
                alt = Path(__file__).resolve().parent.parent / "stills" / f"C_mnet_ds040_t{t:02d}_alpha.png"
                if alt.exists():
                    import shutil
                    shutil.copy2(alt, cp)
                else:
                    raise SystemExit(f"missing C still {cp}")
            fgr, a = load_rgba(cp)
            raw = np.array(Image.open(out / "raw" / f"raw_t{t:02d}.png").convert("RGB"))
            c_stills[t] = {"fgr": fgr, "a": a, "raw": raw}
        print(f"Reuse: loaded bg + {len(c_stills)} C stills", flush=True)
    else:
        if args.rvm_onnx is None:
            raise SystemExit("--rvm-onnx required (or pass --reuse)")
        print("RVM pass (temporal bg mean α<0.02 + stills)…", flush=True)
        c_stills, bg, rvm_meta = rvm_pass_temporal_bg_and_stills(
            args.raw, args.rvm_onnx, args.downsample, args.provider, set(STILL_FRAMES))
        report["rvm_pass"] = rvm_meta
        report["bg_estimate"] = "temporal mean of raw RGB where RVM α<0.02 (fallback 245 if never)"
        Image.fromarray(bg.clip(0, 255).astype(np.uint8)).save(out / "bg_temporal_mean.png")
        for t, s in c_stills.items():
            save_rgba_checker(stills_dir, "C_mnet_ds040", t, s["fgr"], s["a"])

    # --- Copy A and E from prior dirs if provided ---
    def copy_tag(src_dir: Path, src_prefix: str, dst_tag: str):
        n = 0
        if not src_dir:
            return n
        for t in STILL_T:
            # try several naming patterns
            cands = list(src_dir.glob(f"*{src_prefix}*t{t:02d}_alpha.png")) + \
                    list(src_dir.glob(f"{src_prefix}_t{t:02d}_alpha.png"))
            if not cands:
                cands = list(src_dir.glob(f"*t{t:02d}_alpha.png"))
                cands = [p for p in cands if src_prefix.lower() in p.name.lower()]
            if not cands:
                continue
            rgb, a = load_rgba(cands[0])
            save_rgba_checker(stills_dir, dst_tag, t, rgb, a)
            n += 1
        return n

    # A
    a_dir = args.a_stills
    if a_dir and a_dir.exists():
        copy_tag(a_dir, "A_mnet", "A_baseline")
    else:
        # fallback: use prior variants stills
        fallback = Path(__file__).resolve().parent.parent / "stills"
        copy_tag(fallback, "A_mnet_ds0375_baseline", "A_baseline")

    # E (prior colour-lossy)
    e_dir = args.e_stills
    if e_dir and e_dir.exists():
        copy_tag(e_dir, "E_despill_erode_from_C", "E_prior")
    else:
        fallback = Path(__file__).resolve().parent.parent / "stills"
        n = copy_tag(fallback, "E_despill_erode_from_C", "E_prior")
        if n == 0:
            copy_tag(fallback, "E_despill_erode_from_B", "E_prior")

    # --- Build E2 / E2-fgr / E2b from C stills + bg + raw ---
    post_ms = []
    for t, s in c_stills.items():
        raw = s["raw"]
        fgr = s["fgr"]
        a = s["a"]

        # E2: despill raw with temporal bg, no clamp; erode only α<0.5
        t0 = time.perf_counter()
        rgb_e2 = despill_with_bg(raw, a, bg)
        # prefer fgr where very opaque (preserve subject colour)
        opaque = a >= 0.95
        rgb_e2 = rgb_e2.copy()
        rgb_e2[opaque] = fgr[opaque]
        a_e2 = erode_alpha_low_only(a, 0.5)
        post_ms.append((time.perf_counter() - t0) * 1000)
        save_rgba_checker(stills_dir, "E2", t, rgb_e2, a_e2)

        # E2-fgr: use fgr in band (and everywhere); soft erode only
        t0 = time.perf_counter()
        rgb_fgr = fgr.copy()
        a_fgr = erode_alpha_low_only(a, 0.5)
        post_ms.append((time.perf_counter() - t0) * 1000)
        save_rgba_checker(stills_dir, "E2-fgr", t, rgb_fgr, a_fgr)

        # E2b: E2 despill, no erosion
        t0 = time.perf_counter()
        rgb_e2b = despill_with_bg(raw, a, bg)
        rgb_e2b = rgb_e2b.copy()
        rgb_e2b[opaque] = fgr[opaque]
        post_ms.append((time.perf_counter() - t0) * 1000)
        save_rgba_checker(stills_dir, "E2b", t, rgb_e2b, a)

    post_ms_mean = float(np.mean(post_ms)) if post_ms else None
    # Rough: 3 ops measured interleaved — per-variant ~ mean of every 3rd
    # Better re-time per variant once at t=45
    def time_variant(fn, repeats=5):
        s = c_stills[45]
        t0 = time.perf_counter()
        for _ in range(repeats):
            fn(s)
        return (time.perf_counter() - t0) / repeats * 1000

    def fn_e2(s):
        rgb = despill_with_bg(s["raw"], s["a"], bg)
        rgb = rgb.copy(); rgb[s["a"] >= 0.95] = s["fgr"][s["a"] >= 0.95]
        erode_alpha_low_only(s["a"], 0.5)

    def fn_fgr(s):
        erode_alpha_low_only(s["a"], 0.5)

    def fn_e2b(s):
        rgb = despill_with_bg(s["raw"], s["a"], bg)
        rgb = rgb.copy(); rgb[s["a"] >= 0.95] = s["fgr"][s["a"] >= 0.95]

    ms_e2 = round(time_variant(fn_e2), 2)
    ms_fgr = round(time_variant(fn_fgr), 2)
    ms_e2b = round(time_variant(fn_e2b), 2)
    def add_cost(tag, ms):
        added = round(ms * 30 * 60 / 1000.0, 2)
        return {
            f"{tag}_ms_per_frame": ms,
            f"{tag}_added_s_per_min": added,
            f"{tag}_total_s_per_min_with_C": round(args.c_s_per_min + added, 2),
        }
    cost = {}
    cost.update(add_cost("E2", ms_e2))
    cost.update(add_cost("E2-fgr", ms_fgr))
    cost.update(add_cost("E2b", ms_e2b))
    report["post_cost"] = cost

    # --- Metrics ---
    tags = ["A_baseline", "E_prior", "E2", "E2-fgr", "E2b"]
    for tag in tags:
        report["variants"][tag] = {}
        for t in (25, 45):
            ap = stills_dir / f"{tag}_t{t:02d}_alpha.png"
            if not ap.exists():
                report["variants"][tag][f"t{t:02d}"] = {"error": "missing"}
                continue
            rgb, a = load_rgba(ap)
            raw = np.array(Image.open(out / "raw" / f"raw_t{t:02d}.png").convert("RGB"))
            report["variants"][tag][f"t{t:02d}"] = metrics(rgb, a, raw)

    (out / "metrics-e2.json").write_text(json.dumps(report, indent=2))

    # Sheet labels with halo/ΔE snapshot at 45s
    labels = []
    for tag, nice in [("A_baseline", "A baseline ds0.375"),
                      ("E_prior", "E prior despill+erode+clamp"),
                      ("E2", "E2 temporal-bg despill, erode α<0.5"),
                      ("E2-fgr", "E2-fgr use RVM fgr, erode α<0.5"),
                      ("E2b", "E2b temporal-bg despill, no erode")]:
        m = report["variants"].get(tag, {}).get("t45", {})
        labels.append((tag, f"{nice} · halo={m.get('hair_semitrans_mean_luma')} ΔE_op={m.get('deltaE_opaque_hair')} ΔE_band={m.get('deltaE_band_hair')} gap={m.get('gap_mean_alpha')}"))

    paths = build_sheets(out, labels, args.machine)
    report["artifacts"] = {"contact": str(paths[0]), "zoom": str(paths[1]), "roi": str(paths[2])}
    (out / "metrics-e2.json").write_text(json.dumps(report, indent=2))
    print(json.dumps({k: report[k] for k in ("post_cost", "variants", "artifacts")}, indent=2))
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
