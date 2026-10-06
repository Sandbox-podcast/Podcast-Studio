"""Fair A/B: v7 vs v8 (optional v8b) — hardened waits."""
from __future__ import annotations
import json, re, time
from datetime import datetime
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8088/"
OUT = Path(r"C:\Users\azero\podcast-studio\s3-matting-harness\exports")
OUT.mkdir(parents=True, exist_ok=True)
WARMUP_S = 10
MEASURE_S = 18
CONTACT_TS = [5, 15, 25, 35, 45, 55]
PROFILES = ["v7", "v8"]


def measure_profile(page, profile: str) -> dict:
    url = f"{BASE}?v=s4-matte9-ab&profile={profile}&file=run4-raw.webm"
    result = {"profile": profile, "url": url, "ok": False, "startedAt": datetime.now().isoformat(timespec="seconds")}
    print(f"  goto {url}", flush=True)
    page.goto(url, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_function(
        """() => {
          const s = document.getElementById('status')?.textContent || '';
          return /Fichier cam OK/i.test(s);
        }""",
        timeout=90000,
    )
    page.select_option("#backend", "mediapipe")
    page.select_option("#resolution", "720")
    page.click("#btnLoop")
    # Wait until MediaPipe producing real samples (FPS climbs after CDN)
    page.wait_for_function(
        """() => {
          if (typeof window.__s3Metrics !== 'function') return false;
          const m = window.__s3Metrics();
          return m && m.sampleCount >= 15 && m.fpsAvg && m.fpsAvg > 5;
        }""",
        timeout=180000,
    )
    print(f"  mediapipe warm samples ok @ {datetime.now().strftime('%H:%M:%S')}", flush=True)
    time.sleep(WARMUP_S)
    page.evaluate("() => window.__s3ClearFrameTimes && window.__s3ClearFrameTimes()")
    time.sleep(MEASURE_S)
    metrics = page.evaluate("() => window.__s3Metrics()")
    overlay = page.inner_text("#overlay")
    result["overlay"] = overlay
    result["metrics"] = metrics
    shot = OUT / f"ab-{profile}-run4-loop-720.png"
    page.locator("#stage").screenshot(path=str(shot))
    result["screenshot"] = str(shot)

    frames = []
    for ts in CONTACT_TS:
        try:
            page.evaluate(
                """(t) => {
                  const v = document.getElementById('rawVideo');
                  if (!v) return false;
                  return new Promise((resolve) => {
                    const done = () => resolve(true);
                    v.addEventListener('seeked', done, { once: true });
                    v.currentTime = Math.min(t, (v.duration || t + 1) - 0.05);
                    setTimeout(done, 800);
                  });
                }""",
                ts,
            )
            time.sleep(0.35)
            fp = OUT / f"ab-{profile}-t{ts:02d}.png"
            page.locator("#stage").screenshot(path=str(fp))
            frames.append({"t": ts, "path": str(fp)})
        except Exception as e:
            frames.append({"t": ts, "error": f"{type(e).__name__}: {e}"})
    result["contact_frames"] = frames

    if metrics and metrics.get("fpsAvg") is not None:
        result["fpsAvg"] = metrics["fpsAvg"]
        result["fpsP5Worst"] = metrics["fpsP5Worst"]
        result["sampleCount"] = metrics.get("sampleCount")
        result["frameMsAvg"] = metrics.get("frameMsAvg")
        result["frameMsP95Slow"] = metrics.get("frameMsP95Slow")
    else:
        def grab(pat):
            m = re.search(pat, overlay)
            return float(m.group(1)) if m else None
        result["fpsAvg"] = grab(r"FPS avg:\s*([0-9.]+)")
        result["fpsP5Worst"] = grab(r"FPS p5 \(worst\):\s*([0-9.]+)")
    result["ok"] = result.get("fpsAvg") is not None
    result["finishedAt"] = datetime.now().isoformat(timespec="seconds")
    try:
        page.click("#btnStop")
    except Exception:
        pass
    return result


def build_contact_sheet(results: list):
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return None
    cell_w, cell_h = 320, 180
    rows = []
    for r in results:
        frames = []
        for fr in r.get("contact_frames") or []:
            p = fr.get("path")
            if p and Path(p).exists():
                im = Image.open(p).convert("RGB").resize((cell_w, cell_h), Image.BILINEAR)
                frames.append(im)
            else:
                frames.append(Image.new("RGB", (cell_w, cell_h), (40, 40, 40)))
        while len(frames) < 6:
            frames.append(Image.new("RGB", (cell_w, cell_h), (40, 40, 40)))
        row = Image.new("RGB", (cell_w * 6, cell_h + 24), (20, 20, 24))
        draw = ImageDraw.Draw(row)
        label = f"{r.get('profile')}  avg={r.get('fpsAvg')}  p5={r.get('fpsP5Worst')}"
        draw.text((8, 4), label, fill=(200, 220, 255))
        for i, im in enumerate(frames[:6]):
            row.paste(im, (i * cell_w, 24))
        rows.append(row)
    if not rows:
        return None
    sheet = Image.new("RGB", (cell_w * 6, (cell_h + 24) * len(rows)), (12, 12, 14))
    for i, row in enumerate(rows):
        sheet.paste(row, (0, i * (cell_h + 24)))
    outp = OUT / "v7-v8-contact.png"
    sheet.save(outp)
    return str(outp)


def past_cutoff():
    now = datetime.now()
    return now.hour > 1 or (now.hour == 1 and now.minute >= 18)


def main():
    comparison = {
        "startedAt": datetime.now().isoformat(timespec="seconds"),
        "source": "run4-raw.webm",
        "method": "Playwright Edge headless, same file loop, profile=v7 then v8 (optional v8b)",
        "warmupSec": WARMUP_S,
        "measureSec": MEASURE_S,
        "profiles": [],
    }
    with sync_playwright() as p:
        browser = p.chromium.launch(
            channel="msedge",
            headless=True,
            args=["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream"],
        )
        context = browser.new_context(viewport={"width": 1400, "height": 900})
        page = context.new_page()
        for profile in PROFILES:
            if past_cutoff():
                print("TIME CUTOFF before", profile, flush=True)
                break
            print(f"=== measuring {profile} @ {datetime.now().strftime('%H:%M:%S')} ===", flush=True)
            r = measure_profile(page, profile)
            comparison["profiles"].append(r)
            print(json.dumps({k: r.get(k) for k in ("profile", "ok", "fpsAvg", "fpsP5Worst", "sampleCount", "frameMsAvg")}, indent=2), flush=True)
        now = datetime.now()
        have = {r.get("profile") for r in comparison["profiles"] if r.get("ok")}
        if have >= {"v7", "v8"} and not past_cutoff():
            print(f"=== measuring v8b @ {now.strftime('%H:%M:%S')} ===", flush=True)
            r = measure_profile(page, "v8b")
            comparison["profiles"].append(r)
            print(json.dumps({k: r.get(k) for k in ("profile", "ok", "fpsAvg", "fpsP5Worst", "sampleCount")}, indent=2), flush=True)
        browser.close()

    contact = build_contact_sheet([r for r in comparison["profiles"] if r.get("ok")])
    comparison["contactSheet"] = contact
    by = {r["profile"]: r for r in comparison["profiles"] if r.get("ok")}
    if "v7" in by and "v8" in by:
        comparison["delta"] = {
            "fpsAvg_v8_minus_v7": round((by["v8"]["fpsAvg"] or 0) - (by["v7"]["fpsAvg"] or 0), 1),
            "fpsP5_v8_minus_v7": round((by["v8"].get("fpsP5Worst") or 0) - (by["v7"].get("fpsP5Worst") or 0), 1),
            "floor_p5_ge_24": {
                "v7": (by["v7"].get("fpsP5Worst") or 0) >= 24,
                "v8": (by["v8"].get("fpsP5Worst") or 0) >= 24,
                "v8b": ((by["v8b"].get("fpsP5Worst") or 0) >= 24) if "v8b" in by else None,
            },
        }
        if "v8b" in by:
            comparison["delta"]["fpsAvg_v8b_minus_v7"] = round((by["v8b"]["fpsAvg"] or 0) - (by["v7"]["fpsAvg"] or 0), 1)
            comparison["delta"]["fpsP5_v8b_minus_v7"] = round((by["v8b"].get("fpsP5Worst") or 0) - (by["v7"].get("fpsP5Worst") or 0), 1)
    comparison["finishedAt"] = datetime.now().isoformat(timespec="seconds")
    outp = OUT / "v7-v8-ab-measure.json"
    outp.write_text(json.dumps(comparison, indent=2), encoding="utf-8")
    print("WROTE", outp, flush=True)
    print(json.dumps(comparison.get("delta"), indent=2), flush=True)
    print("contact", contact, flush=True)


if __name__ == "__main__":
    main()
