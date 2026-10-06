#!/usr/bin/env python3
"""S4 H.264 probe — box-side remux + gates check.

For each recording (webm/mkv/mp4) in a probe run dir:
  1. ffprobe: container, codecs, profile, codec_tag, extradata (CodecPrivate) size, probe warnings.
  2. Remux exactly like the locked S4 path:  ffmpeg -i in -map 0 -c copy [-bsf:a setts=…] out.{webm,mkv,mp4}
     (.webm expected to FAIL for H.264; .mp4 with Opus retried with -strict -2 if the plain run fails).
  3. S4 gates on the best successful remux (mkv > webm > mp4 > original): duration, bitrate,
     frame continuity (packets, eff fps, max gap, holes >200 ms, loss vs 30 fps) — reuses
     s4-ab/analyze_ab.py helpers — plus tools/distinct_fps.py --threshold 0.5.
  4. Joins the probe's results.json (actual recorder mimeType, CPU, nvidia-smi, GPU VideoEncode).

Usage:
  python3 remux_check.py <run-dir with results.json + rec-*> [--out <dir>] [--expect-secs 15]
  python3 remux_check.py --files a.mkv b.webm --out /tmp/x            # ad-hoc files, no results.json
Outputs: <out>/remux-report.md + remux-report.json (+ remuxed files under <out>/remux/).
"""
from __future__ import annotations
import argparse, json, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "s4-ab"))
import analyze_ab as AB  # probe(), pkt_times(), SETTS, DISTINCT

TARGETS = ["webm", "mkv", "mp4"]


def sh(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def ffprobe_info(f: Path) -> dict:
    r = sh(["ffprobe", "-v", "warning", "-print_format", "json", "-show_format", "-show_streams", str(f)])
    d = json.loads(r.stdout or "{}")
    streams = [{k: s.get(k) for k in ("index", "codec_type", "codec_name", "profile", "codec_tag_string",
                                       "width", "height", "pix_fmt", "sample_rate", "channels", "extradata_size",
                                       "r_frame_rate", "avg_frame_rate")} for s in d.get("streams", [])]
    fmt = d.get("format", {})
    warn = [l for l in r.stderr.splitlines() if l.strip()]
    v = next((s for s in streams if s["codec_type"] == "video"), {})
    cp_issue = None
    if v.get("codec_name") == "h264" and not v.get("extradata_size"):
        cp_issue = "h264 without extradata (no CodecPrivate/avcC) — SPS/PPS in-band only"
    return {"format_name": fmt.get("format_name"), "duration": fmt.get("duration"), "bit_rate": fmt.get("bit_rate"),
            "streams": streams, "probe_warnings": warn[:8], "codec_private_issue": cp_issue}


def remux(src: Path, dst: Path, has_audio: bool, audio_codec: str | None) -> dict:
    base = ["ffmpeg", "-hide_banner", "-nostats", "-y", "-v", "error", "-i", str(src), "-map", "0", "-c", "copy"]
    bsf = ["-bsf:a", AB.SETTS] if has_audio else []
    attempts = [base + bsf + [str(dst)]]
    if dst.suffix == ".mp4" and audio_codec == "opus":
        attempts.append(base + bsf + ["-strict", "-2", str(dst)])
    res = {"target": dst.suffix[1:], "attempts": []}
    for cmd in attempts:
        r = sh(cmd)
        ok = r.returncode == 0 and dst.exists() and dst.stat().st_size > 0
        res["attempts"].append({"cmd": " ".join(c if " " not in c else f'"{c}"' for c in cmd[1:]).replace(AB.SETTS, "setts=…"),
                                "rc": r.returncode, "ok": ok, "error": [l for l in r.stderr.splitlines() if l.strip()][:6]})
        if ok:
            break
        if dst.exists():
            dst.unlink()
    res["ok"] = res["attempts"][-1]["ok"]
    res["needed_strict"] = res["ok"] and len(res["attempts"]) > 1
    if res["ok"]:
        # verify the remux decodes (first + whole-file error count, quick)
        d = sh(["ffmpeg", "-v", "error", "-i", str(dst), "-f", "null", "-"])
        res["decode_errors"] = len([l for l in d.stderr.splitlines() if l.strip()])
    return res


def gates(f: Path, expect_secs: float | None) -> dict:
    p = AB.probe(f); fmt = p.get("format", {})
    dur = float(fmt.get("duration") or 0); size = f.stat().st_size
    vt = [t for t, _ in AB.pkt_times(f, "v:0")]
    dts = [b - a for a, b in zip(vt, vt[1:])]
    holes = [round(d * 1000, 1) for d in dts if d > 0.2]
    loss = round(max(0.0, 1 - len(vt) / (dur * 30)) * 100, 2) if dur else None
    g = {"file": f.name, "duration_s": round(dur, 3), "bitrate_mbps": round(size * 8 / dur / 1e6, 3) if dur else None,
         "packets": len(vt), "eff_fps": round((len(vt) - 1) / (vt[-1] - vt[0]), 3) if len(vt) > 1 else 0,
         "max_gap_ms": round(max(dts) * 1000, 1) if dts else None, "holes_gt200ms": len(holes), "loss_pct_vs_30fps": loss}
    dj = f.with_suffix(f.suffix + ".distinct.json")
    sh([sys.executable, str(AB.DISTINCT), "--threshold", "0.5", "--json-out", str(dj), str(f)])
    if dj.exists():
        d = json.loads(dj.read_text())["videos"][0]
        g.update({"distinct_fps_near": d["distinct_fps_near"], "distinct_fps_exact": d["distinct_fps_exact"],
                  "win_ge24": d["windows_1s_share_ge24"], "win_min": d["windows_1s_min_distinct"]})
    pf = lambda ok: "PASS" if ok else "FAIL"
    g["gate_duration"] = "N/A" if not expect_secs else pf(abs(dur - expect_secs) <= 1.5)
    g["gate_bitrate_ge_1mbps"] = pf((g["bitrate_mbps"] or 0) >= 1.0)
    g["gate_loss_le_1pct"] = pf(loss is not None and loss <= 1.0 and not holes)
    g["gate_distinct_ge_24"] = pf((g.get("distinct_fps_near") or 0) >= 24)
    return g


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("run_dir", nargs="?", type=Path)
    ap.add_argument("--files", nargs="*", type=Path, default=[])
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--expect-secs", type=float, default=None, help="default: results.json secs")
    a = ap.parse_args()
    probe_res, files = {}, list(a.files)
    if a.run_dir:
        rj = a.run_dir / "results.json"
        if rj.exists():
            probe_res = json.loads(rj.read_text())
        files += sorted(p for p in a.run_dir.iterdir() if p.name.startswith("rec-") and p.suffix in (".webm", ".mkv", ".mp4"))
    if not files:
        raise SystemExit("no recordings found")
    out = a.out or (a.run_dir / "box-check" if a.run_dir else Path("remux-check-out"))
    (out / "remux").mkdir(parents=True, exist_ok=True)
    expect = a.expect_secs or probe_res.get("secs")
    recs = {r.get("file"): r for r in probe_res.get("recordings", [])}
    rows = []
    for f in files:
        info = ffprobe_info(f)
        a_codec = next((s["codec_name"] for s in info["streams"] if s["codec_type"] == "audio"), None)
        v_codec = next((s["codec_name"] for s in info["streams"] if s["codec_type"] == "video"), None)
        rm = {t: remux(f, out / "remux" / f"{f.stem}.remux.{t}", a_codec is not None, a_codec) for t in TARGETS}
        best = next((out / "remux" / f"{f.stem}.remux.{t}" for t in ["mkv", "webm", "mp4"] if rm[t]["ok"]), f)
        pr = recs.get(f.name, {})
        row = {"file": f.name, "requested_mime": pr.get("requested"), "actual_mime": pr.get("mimeTypeFinal"),
               "video_codec": v_codec, "audio_codec": a_codec, "ffprobe": info, "remux": rm,
               "gates_on": best.name, "gates": gates(best, expect),
               "publisher": {"cpu_tree_one_core": (pr.get("cpu") or {}).get("treeOneCore"),
                             "cpu_tree_machine": (pr.get("cpu") or {}).get("treeMachine"),
                             "system_cpu": (pr.get("cpu") or {}).get("systemTotal"),
                             "gpu_videoencode_tree": (pr.get("cpu") or {}).get("gpuVideoEncodeTree"),
                             "nvidia_enc": (pr.get("nvidiaSmi") or {}).get("enc"),
                             "nvidia_gpu": (pr.get("nvidiaSmi") or {}).get("gpu"),
                             "measured_mbps": pr.get("measuredMbps"), "errors": pr.get("errors")}}
        rows.append(row)
        print(f"{f.name}: {v_codec}/{a_codec} " + " ".join(f"{t}={'OK' if rm[t]['ok'] else 'FAIL'}" for t in TARGETS))
    md = ["# S4 H.264 probe — box remux/gates check", ""]
    if probe_res:
        s = probe_res.get("support", {})
        md += [f"UA: `{s.get('ua')}` · channel {probe_res.get('channel')} · {probe_res.get('secs')} s @ {probe_res.get('vbps')} bps", "",
               "| isTypeSupported | |", "|---|---|"] + [f"| `{k}` | {v} |" for k, v in (s.get("mediaRecorder") or {}).items()] + [""]
        md += ["| VideoEncoder.isConfigSupported | supported |", "|---|---|"] + \
              [f"| {k} | {v.get('supported') if isinstance(v, dict) else v} |" for k, v in (s.get("videoEncoderConfig") or {}).items()] + [""]
        md += ["| VideoEncoder 60-frame run | chunks | ms | errors |", "|---|---:|---:|---|"] + \
              [f"| {r.get('codec')} {r.get('hw')} | {r.get('chunks')} | {r.get('ms')} | {'; '.join(r.get('errors') or [])[:120]} |" for r in probe_res.get("veRuns", [])] + [""]
        if probe_res.get("gpuVideoAccel"):
            md += ["GPU page (video lines): " + " / ".join(x[:160] for x in probe_res["gpuVideoAccel"][:3]), ""]
    md += ["| file | requested → actual mime | v/a | profile | CodecPrivate | →webm | →mkv | →mp4 | dur s | Mbps | pkts/eff fps | max gap | loss% | distinct near | pub CPU (1 core, mean/max) | nv enc mean | GPU VideoEncode mean |",
           "|---|---|---|---|---|---|---|---|---:|---:|---|---:|---:|---:|---|---:|---:|"]
    def rmcell(r):
        if r["ok"]:
            return "OK" + (" (-strict -2)" if r.get("needed_strict") else "")
        err = r["attempts"][-1]["error"] or ["?"]
        import re as _re
        first = _re.sub(r"^\[[^\]]*\]\s*", "", err[0])
        return "FAIL: " + first[:110].replace("|", "/")
    for r in rows:
        g, pub = r["gates"], r["publisher"]
        vs = next((s for s in r["ffprobe"]["streams"] if s["codec_type"] == "video"), {})
        c1 = pub["cpu_tree_one_core"] or {}
        md.append(f"| {r['file']} | {r['requested_mime']} → {r['actual_mime']} | {r['video_codec']}/{r['audio_codec']} | {vs.get('profile')} | "
                  f"{r['ffprobe']['codec_private_issue'] or 'extradata ' + str(vs.get('extradata_size'))} | "
                  f"{rmcell(r['remux']['webm'])} | {rmcell(r['remux']['mkv'])} | {rmcell(r['remux']['mp4'])} | "
                  f"{g['duration_s']} ({g['gate_duration']}) | {g['bitrate_mbps']} ({g['gate_bitrate_ge_1mbps']}) | {g['packets']}/{g['eff_fps']} | {g['max_gap_ms']} | "
                  f"{g['loss_pct_vs_30fps']} ({g['gate_loss_le_1pct']}) | {g.get('distinct_fps_near')} ({g['gate_distinct_ge_24']}) | "
                  f"{c1.get('mean')}/{c1.get('max')} | {(pub['nvidia_enc'] or {}).get('mean')} | {(pub['gpu_videoencode_tree'] or {}).get('mean')} |")
    md += ["", "Gates computed on the first successful remux in order mkv > webm > mp4 (else original). "
           "Bitrate gate uses the S4 ≥1 Mbps floor; the probe's synthetic canvas may encode below the 2.5 Mbps target."]
    (out / "remux-report.md").write_text("\n".join(md) + "\n")
    (out / "remux-report.json").write_text(json.dumps({"probe": {k: probe_res.get(k) for k in ("ts", "host", "channel", "secs", "vbps", "browserVersion")}, "rows": rows}, indent=2))
    print("\n".join(md)); print(f"\nwrote {out}/remux-report.md + .json")


if __name__ == "__main__":
    main()
