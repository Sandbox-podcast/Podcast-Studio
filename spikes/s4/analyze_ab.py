#!/usr/bin/env python3
"""S4 A/B analyzer — one command: fetch new `ab-` objects, remux, S4 gates, distinct fps.

Gates (same as take 4, RESULT-RUN4.md §4) + live distinct-fps criterion:
  sync ≤100 ms (clap, where measurable) · loss ≤1% vs 30 fps · bitrate ≥1 Mbps
  upload/watchdog (completeOk, local=remote, no gaps/errors) · Opus + audio guard
  distinct fps (near, thr 0.5) ≥24 · duration ≈ target (results.durationSecTarget, ±3 s)

Sources (pick one):
  --source s3     list+GET directly (SigV4, stdlib). Needs network reach to MinIO.
                  --endpoint http://HOST:9000 --env-file minio .env (ROOT_USER/PASSWORD/BUCKET)
  --source inbox  analyze files already staged in --inbox (default s4-ab/inbox/), e.g. pulled
                  via laptop helper s4-ab/laptop/ab-fetch.mjs + CopyToBox (box cannot reach laptop LAN).

Usage:
  python3 analyze_ab.py --source inbox                       # A/B run, filter 'ab-'
  python3 analyze_ab.py --source s3 --endpoint http://192.168.1.68:9000 \\
      --env-file /workspace/podcast-studio/minio-laptop/.env
  python3 analyze_ab.py --source inbox --inbox DIR --filter vision-host- --tag dryrun-take4
Outputs: out/<tag>/{report.md,report.json,<stem>/...}; never deletes remote objects.
"""
from __future__ import annotations
import argparse, datetime as dt, hashlib, hmac, json, os, re, subprocess, sys, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).resolve().parent
DISTINCT = HERE.parent.parent / "tools" / "distinct_fps.py"
SETTS = ("setts=pts='if(lte(PTS,PREV_OUTPTS),PREV_OUTPTS+1,PTS)'"
         ":dts='if(lte(DTS,PREV_OUTDTS),PREV_OUTDTS+1,DTS)'")


def sh(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


# ---------------- S3 (SigV4, stdlib) ----------------
def read_env(p: Path) -> dict:
    env = {}
    for line in p.read_text().splitlines():
        m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
        if m:
            env[m[1]] = m[2].strip().strip('"')
    return env


def s3_req(endpoint, ak, sk, path, query="", region="us-east-1"):
    u = urllib.parse.urlparse(endpoint)
    now = dt.datetime.now(dt.timezone.utc)
    amz, day = now.strftime("%Y%m%dT%H%M%SZ"), now.strftime("%Y%m%d")
    ph = hashlib.sha256(b"").hexdigest()
    hdrs = f"host:{u.netloc}\nx-amz-content-sha256:{ph}\nx-amz-date:{amz}\n"
    signed = "host;x-amz-content-sha256;x-amz-date"
    creq = "\n".join(["GET", urllib.parse.quote(path), query, hdrs, signed, ph])
    scope = f"{day}/{region}/s3/aws4_request"
    sts = "\n".join(["AWS4-HMAC-SHA256", amz, scope, hashlib.sha256(creq.encode()).hexdigest()])
    k = ("AWS4" + sk).encode()
    for part in (day, region, "s3", "aws4_request"):
        k = hmac.new(k, part.encode(), hashlib.sha256).digest()
    sig = hmac.new(k, sts.encode(), hashlib.sha256).hexdigest()
    req = urllib.request.Request(f"{endpoint}{urllib.parse.quote(path)}" + (f"?{query}" if query else ""))
    req.add_header("x-amz-date", amz); req.add_header("x-amz-content-sha256", ph)
    req.add_header("Authorization", f"AWS4-HMAC-SHA256 Credential={ak}/{scope}, SignedHeaders={signed}, Signature={sig}")
    return urllib.request.urlopen(req, timeout=30)


def s3_fetch(args, inbox: Path) -> list[str]:
    env = read_env(args.env_file)
    ak, sk = env["MINIO_ROOT_USER"], env["MINIO_ROOT_PASSWORD"]
    bucket = env.get("MINIO_BUCKET_NAME", "podcast-recordings-poc")
    q = "list-type=2&prefix=" + urllib.parse.quote(args.prefix, safe="")
    xml = s3_req(args.endpoint, ak, sk, f"/{bucket}", q).read()
    ns = {"s": "http://s3.amazonaws.com/doc/2006-03-01/"}
    got = []
    for c in ET.fromstring(xml).findall("s:Contents", ns):
        key, size = c.find("s:Key", ns).text, int(c.find("s:Size", ns).text)
        if args.filter not in key:
            continue
        dst = inbox / Path(key).name
        if dst.exists() and dst.stat().st_size == size:
            continue
        with s3_req(args.endpoint, ak, sk, f"/{bucket}/{key}") as r, open(dst, "wb") as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)
        got.append(key)
    return got


# ---------------- analysis ----------------
def probe(f: Path) -> dict:
    return json.loads(sh(["ffprobe", "-v", "error", "-print_format", "json",
                          "-show_format", "-show_streams", str(f)]).stdout or "{}")


def pkt_times(f: Path, sel: str) -> list[tuple[float, float]]:
    out = sh(["ffprobe", "-v", "error", "-select_streams", sel, "-show_entries",
              "packet=pts_time,duration_time", "-of", "csv=p=0", str(f)]).stdout
    res = []
    for ln in out.splitlines():
        p = ln.split(",")
        try:
            res.append((float(p[0]), float(p[1]) if len(p) > 1 and p[1] not in ("", "N/A") else 0.0))
        except ValueError:
            pass
    return sorted(res)


def remux(src: Path, dst: Path, has_audio: bool) -> dict:
    cmd = ["ffmpeg", "-hide_banner", "-nostats", "-y", "-v", "warning", "-i", str(src),
           "-map", "0", "-c", "copy"] + (["-bsf:a", SETTS] if has_audio else []) + [str(dst)]
    r = sh(cmd)
    return {"rc": r.returncode, "setts": has_audio, "warn_lines": len(r.stderr.splitlines()),
            "stderr_sample": r.stderr.splitlines()[:3]}


def audio_onset(f: Path, a_start: float, win_s=15.0):
    """Clap candidate: loudest 10 ms RMS window in first win_s, if it stands out."""
    import numpy as np
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(f), "-t", str(win_s), "-vn", "-ac", "1",
                          "-ar", "48000", "-f", "f32le", "-"], capture_output=True).stdout
    x = np.frombuffer(raw, np.float32)
    if x.size < 4800:
        return None
    w = 480
    rms = np.sqrt((x[: x.size // w * w].reshape(-1, w) ** 2).mean(1))
    i = int(rms.argmax()); med = float(np.median(rms)) + 1e-6
    return {"t_s": a_start + i * 0.01, "peak": float(rms[i]), "ratio": float(rms[i] / med)}


def visual_peak(f: Path, t_center: float, span=1.0):
    """Max frame-diff (160x90 gray) within ±span of t_center. Decodes from 0 so the pts list
    and decoded frames stay index-aligned (no -ss/read_intervals keyframe mismatch)."""
    import numpy as np
    t_end = t_center + span
    pts = [float(l) for l in sh(["ffprobe", "-v", "error", "-select_streams", "v:0", "-read_intervals",
                                 f"%{t_end}", "-show_entries", "frame=pts_time", "-of", "csv=p=0",
                                 str(f)]).stdout.split() if l != "N/A"]
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(f), "-an", "-fps_mode", "passthrough",
                          "-vf", "scale=160:90,format=gray", "-frames:v", str(len(pts)),
                          "-f", "rawvideo", "-"], capture_output=True).stdout
    fr = np.frombuffer(raw, np.uint8)[: len(raw) // 14400 * 14400].reshape(-1, 90, 160).astype(np.float32)
    n = min(len(fr), len(pts))
    if n < 3:
        return None
    mot = np.abs(np.diff(fr[:n], axis=0)).mean((1, 2))  # mot[i] = change from frame i to i+1
    idx = [i for i in range(n - 1) if t_center - span <= pts[i + 1] <= t_end]
    if len(idx) < 3:
        return None
    i = max(idx, key=lambda k: mot[k])
    med = float(np.median(mot[idx])) + 1e-6
    return {"t_s": pts[i + 1], "motion": float(mot[i]), "ratio": float(mot[i] / med)}


def analyze(webm: Path, results: Path | None, odir: Path) -> dict:
    odir.mkdir(parents=True, exist_ok=True)
    pr = probe(webm)
    has_a = any(s.get("codec_type") == "audio" for s in pr.get("streams", []))
    vcodec_in = next((s.get("codec_name") for s in pr.get("streams", []) if s.get("codec_type") == "video"), None)
    # H.264 (MediaRecorder 'webm;codecs=h264' really emits Matroska/avc1): webm muxer refuses avc1 -> remux to mkv
    rmx = odir / (webm.stem + (".remux.mkv" if vcodec_in in ("h264", "hevc") else ".remux.webm"))
    rm = remux(webm, rmx, has_a)
    p = probe(rmx); fmt = p.get("format", {})
    dur = float(fmt.get("duration") or 0); size = int(fmt.get("size") or 0)
    vs = [s for s in p.get("streams", []) if s["codec_type"] == "video"]
    as_ = [s for s in p.get("streams", []) if s["codec_type"] == "audio"]
    vp = pkt_times(rmx, "v:0")
    vt = [t for t, _ in vp]
    dts = [b - a for a, b in zip(vt, vt[1:])]
    holes = [(round(vt[i], 3), round(d * 1000, 1)) for i, d in enumerate(dts) if d > 0.2]
    r = {"file": webm.name, "size_bytes": webm.stat().st_size, "remux": rm,
         "duration_s": round(dur, 3), "bitrate_mbps": round(size * 8 / dur / 1e6, 3) if dur else None,
         "video": {"codec": vs[0].get("codec_name") if vs else None,
                   "res": f"{vs[0].get('width')}x{vs[0].get('height')}" if vs else None,
                   "packets": len(vt), "eff_fps": round((len(vt) - 1) / (vt[-1] - vt[0]), 3) if len(vt) > 1 else 0,
                   "max_gap_ms": round(max(dts) * 1000, 1) if dts else None,
                   "holes_gt200ms": holes[:20], "missing_ms_gt200": round(sum(h[1] for h in holes), 1),
                   "loss_pct_vs_30fps": round(max(0.0, 1 - len(vt) / (dur * 30)) * 100, 2) if dur else None}}
    if as_:
        ap = pkt_times(rmx, "a:0")
        a_dur = (ap[-1][0] + ap[-1][1] - ap[0][0]) if ap else 0.0
        r["audio"] = {"codec": as_[0].get("codec_name"), "channels": as_[0].get("channels"),
                      "sample_rate": as_[0].get("sample_rate"), "packets": len(ap),
                      "opus_samples_48k": int(round(sum(d for _, d in ap) * 48000)),
                      "duration_s": round(a_dur, 3), "start_s": ap[0][0] if ap else None,
                      "av_duration_diff_ms": round(((vt[-1] + (dts and sorted(dts)[len(dts) // 2] or 0)) - vt[0] - a_dur) * 1000, 1) if vt and ap else None}
        on = audio_onset(rmx, ap[0][0] if ap else 0.0)
        vis = visual_peak(rmx, on["t_s"]) if on and on["ratio"] > 20 else None
        ok = bool(on and vis and on["ratio"] > 20 and vis["ratio"] > 3)
        r["sync"] = {"measurable": ok, "audio_onset": on, "visual_peak": vis,
                     "av_ms": round((on["t_s"] - vis["t_s"]) * 1000, 1) if ok else None,
                     "method": "loudest 10 ms RMS in first 15 s (ratio>20) vs max frame-diff ±1 s (ratio>3)"}
    else:
        r["audio"] = None; r["sync"] = {"measurable": False, "reason": "no audio"}
    dj = odir / "distinct_fps.json"
    d = sh([sys.executable, str(DISTINCT), "--threshold", "0.5", "--json-out", str(dj), str(rmx)])
    r["distinct_fps"] = json.loads(dj.read_text())["videos"][0] if dj.exists() else {"error": d.stderr[-400:]}
    r["distinct_fps_summary"] = d.stdout.strip()
    if results and results.exists():
        j = json.loads(results.read_text()); rec = j.get("recording", {}); au = j.get("audio", {}); ig = j.get("integrity", {})
        r["recorder"] = {"participant": j.get("participant"), "label": j.get("label"), "mimeType": j.get("mimeType"),
                         "durationSecTarget": rec.get("durationSecTarget"), "videoBitsPerSecond": rec.get("videoBitsPerSecond"),
                         "timesliceMs": rec.get("timesliceMs"), "elapsedMs": rec.get("elapsedMs"),
                         "measuredBitrateBps": rec.get("measuredBitrateBps"), "chunkCount": rec.get("chunkCount"),
                         "completeOk": j.get("completeOk"), "audioMissing": j.get("audioMissing"),
                         "local_eq_remote": ig.get("localBytes") == ig.get("remoteContentLength") and ig.get("localBytes") is not None,
                         "local_eq_file": ig.get("localBytes") == webm.stat().st_size,
                         "gaps": j.get("gaps", []), "errors": j.get("errors", []), "cuts": j.get("cuts", []),
                         "visibility": j.get("visibility", []), "audio_samplesSeen": au.get("samplesSeen"),
                         "audio_firstSampleMs": au.get("firstSampleMs"), "audio_issues": au.get("issues", []),
                         "watchdogMode": j.get("watchdogMode")}
    else:
        r["recorder"] = None
    r["gates"] = gates(r)
    (odir / "analysis.json").write_text(json.dumps(r, indent=2))
    return r


def gates(r: dict) -> dict:
    rc, a, s, v, df = r.get("recorder") or {}, r.get("audio") or {}, r["sync"], r["video"], r.get("distinct_fps", {})
    def pf(ok): return "PASS" if ok else "FAIL"
    tgt = rc.get("durationSecTarget")
    g = {"sync_le_100ms": "N/A" if not s.get("measurable") else pf(abs(s["av_ms"]) <= 100),
         "loss_le_1pct": pf(v["loss_pct_vs_30fps"] is not None and v["loss_pct_vs_30fps"] <= 1.0 and not v["holes_gt200ms"]),
         "bitrate_ge_1mbps": pf((r["bitrate_mbps"] or 0) >= 1.0),
         "upload_watchdog": "N/A (no results.json)" if not rc else pf(rc["completeOk"] and rc["local_eq_remote"] and rc["local_eq_file"] and not rc["gaps"] and not rc["errors"]),
         "opus_audio_guard": pf(a.get("codec") == "opus" and (not rc or (rc["audioMissing"] is False and not rc["audio_issues"] and (rc["audio_samplesSeen"] or 0) > 0))),
         "distinct_fps_ge_24": pf((df.get("distinct_fps_near") or 0) >= 24),
         "duration_vs_target": "N/A" if not tgt else pf(abs(r["duration_s"] - tgt) <= 3)}
    return g


def md_table(rows: list[dict]) -> str:
    def f(x): return "—" if x is None else x
    out = []
    for r in rows:
        rc, a, v, s, df, g = r.get("recorder") or {}, r.get("audio") or {}, r["video"], r["sync"], r.get("distinct_fps", {}), r["gates"]
        name = rc.get("participant") or r["file"]
        out += [f"### {name} — `{r['file']}`", "", "| metric | value | gate |", "|---|---|---|",
                f"| duration | {r['duration_s']} s (target {f(rc.get('durationSecTarget'))}) | {g['duration_vs_target']} |",
                f"| A/V sync (clap) | {f(s.get('av_ms'))} ms{'' if s.get('measurable') else ' (not measurable)'} | {g['sync_le_100ms']} |",
                f"| A/V duration diff | {f(a.get('av_duration_diff_ms'))} ms | info |",
                f"| loss vs 30 fps | {v['loss_pct_vs_30fps']}% · max gap {v['max_gap_ms']} ms · holes>200 ms {len(v['holes_gt200ms'])} ({v['missing_ms_gt200']} ms) | {g['loss_le_1pct']} |",
                f"| bitrate | {r['bitrate_mbps']} Mbps (recorder {round((rc.get('measuredBitrateBps') or 0) / 1e6, 3)}) | {g['bitrate_ge_1mbps']} |",
                f"| packets / eff fps | {v['packets']} / {v['eff_fps']} | info |",
                f"| distinct fps exact / near(0.5) | {f(df.get('distinct_fps_exact'))} / {f(df.get('distinct_fps_near'))} · win≥24 {f(df.get('windows_1s_share_ge24'))} (min {f(df.get('windows_1s_min_distinct'))}) · max repeat {f(df.get('longest_neardup_run_ms'))} ms | {g['distinct_fps_ge_24']} |",
                f"| audio | {f(a.get('codec'))} {f(a.get('channels'))}ch {f(a.get('sample_rate'))} · pkts {f(a.get('packets'))} · samples {f(a.get('opus_samples_48k'))} · recorder seen {f(rc.get('audio_samplesSeen'))} first {f(rc.get('audio_firstSampleMs'))} ms issues {f(rc.get('audio_issues'))} | {g['opus_audio_guard']} |",
                f"| upload/watchdog | completeOk {f(rc.get('completeOk'))} · local=remote {f(rc.get('local_eq_remote'))} · gaps {f(rc.get('gaps'))} · errors {len(rc.get('errors') or [])} · watchdog {f(rc.get('watchdogMode'))} | {g['upload_watchdog']} |",
                f"| remux | rc {r['remux']['rc']} · setts {r['remux']['setts']} · warn {r['remux']['warn_lines']} | info |", ""]
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", choices=["s3", "inbox"], default="inbox")
    ap.add_argument("--inbox", type=Path, default=HERE / "inbox")
    ap.add_argument("--filter", default="ab-", help="substring in object key/file name (default 'ab-')")
    ap.add_argument("--prefix", default="spike/s4-dropin/")
    ap.add_argument("--endpoint", default=None, help="s3 mode, e.g. http://192.168.1.68:9000")
    ap.add_argument("--env-file", type=Path, default=Path("/workspace/podcast-studio/minio-laptop/.env"))
    ap.add_argument("--out", type=Path, default=HERE / "out")
    ap.add_argument("--tag", default=None, help="output subdir (default ab-<timestamp>)")
    args = ap.parse_args()
    args.inbox.mkdir(parents=True, exist_ok=True)
    fetched = []
    if args.source == "s3":
        if not args.endpoint:
            raise SystemExit("--endpoint required for --source s3")
        try:
            fetched = s3_fetch(args, args.inbox)
        except OSError as e:  # URLError/timeout: e.g. box cannot reach laptop LAN
            raise SystemExit(f"S3 unreachable at {args.endpoint}: {e}. Stage files with "
                             "laptop/ab-fetch.mjs + CopyToBox, then use --source inbox.")
        print(f"fetched {len(fetched)} new object(s)")
    tag = args.tag or "ab-" + dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    od = args.out / tag
    vids = sorted(p for p in args.inbox.glob("*.webm") if args.filter in p.name and ".remux." not in p.name)
    if not vids:
        raise SystemExit(f"no *.webm matching '{args.filter}' in {args.inbox}")
    rows = []
    for v in vids:
        print(f"analyzing {v.name} …", flush=True)
        rows.append(analyze(v, v.with_name(v.stem + ".results.json"), od / v.stem))
    md = f"# S4 A/B analysis — {tag}\n\nGenerated {dt.datetime.now().isoformat(timespec='seconds')} (box). Filter `{args.filter}`, source `{args.source}`.\n\n" + md_table(rows)
    (od / "report.md").write_text(md)
    (od / "report.json").write_text(json.dumps({"tag": tag, "fetched": fetched, "rows": rows}, indent=2))
    print(md)
    print(f"\nwrote {od}/report.md + report.json")


if __name__ == "__main__":
    main()
