"""Measure matfix8 MediaPipe FPS on take4 raw loop (no live cam)."""
from __future__ import annotations
import json, re, time
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8088/?v=s4-matfix8&file=run4-raw.webm"
OUT = Path(r"C:\Users\azero\podcast-studio\s3-matting-harness\exports")
OUT.mkdir(parents=True, exist_ok=True)
WARMUP_S = 10
MEASURE_S = 20

def main():
    result = {"ok": False, "url": URL}
    with sync_playwright() as p:
        browser = p.chromium.launch(
            channel="msedge",
            headless=True,
            args=["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream"],
        )
        context = browser.new_context(viewport={"width": 1400, "height": 900})
        page = context.new_page()
        page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        # Wait for file cam load
        page.wait_for_function(
            """() => {
              const s = document.getElementById('status')?.textContent || '';
              return /Fichier cam OK/i.test(s) || /Load file:/i.test(s) || /\\?file=/i.test(s);
            }""",
            timeout=60000,
        )
        status = page.inner_text("#status")
        result["status_after_file"] = status
        if re.search(r"Load file:|échec|erreur", status, re.I) and "Fichier cam OK" not in status:
            result["error"] = status
            page.screenshot(path=str(OUT / "matfix8-file-fail.png"))
            print(json.dumps(result, indent=2))
            browser.close()
            return
        page.select_option("#backend", "mediapipe")
        page.select_option("#resolution", "720")
        page.click("#btnLoop")
        page.wait_for_function(
            """() => {
              const o = document.getElementById('overlay')?.textContent || '';
              const m = o.match(/FPS avg:\\s*([0-9.]+)/);
              return m && parseFloat(m[1]) > 1;
            }""",
            timeout=120000,
        )
        time.sleep(WARMUP_S)
        page.click("#btnStop")
        time.sleep(0.4)
        page.click("#btnLoop")
        time.sleep(MEASURE_S)
        overlay = page.inner_text("#overlay")
        status = page.inner_text("#status")
        result["overlay"] = overlay
        result["status"] = status
        shot = OUT / "matfix8-run4-loop-720.png"
        page.locator("#stage").screenshot(path=str(shot))
        result["screenshot"] = str(shot)
        # Parse overlay
        def grab(pat):
            m = re.search(pat, overlay)
            return float(m.group(1)) if m else None
        result["fpsAvg"] = grab(r"FPS avg:\\s*([0-9.]+)")
        result["fpsP5Worst"] = grab(r"FPS p5 \\(worst\\):\\s*([0-9.]+)")
        result["frameMs"] = grab(r"frame ms:\\s*([0-9.]+)")
        result["samples"] = None
        m = re.search(r"samples:\\s*(\\d+)", overlay)
        if m:
            result["samples"] = int(m.group(1))
        try:
            with page.expect_download(timeout=15000) as dl_info:
                page.click("#btnExport")
            dest = OUT / "matfix8-run4-loop-720.json"
            dl_info.value.save_as(str(dest))
            payload = json.loads(dest.read_text(encoding="utf-8"))
            payload["measure"] = "matfix8-run4-file-loop"
            payload["inventoryLabel"] = "MID laptop Edge — file loop take4 raw (not live cam)"
            dest.write_text(json.dumps(payload, indent=2), encoding="utf-8")
            result["summary"] = payload.get("summary")
            result["json_path"] = str(dest)
        except Exception as e:
            result["export_error"] = f"{type(e).__name__}: {e}"
        result["ok"] = result.get("fpsAvg") is not None
        page.click("#btnStop")
        browser.close()
    outp = OUT / "matfix8-run4-measure.json"
    outp.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()
