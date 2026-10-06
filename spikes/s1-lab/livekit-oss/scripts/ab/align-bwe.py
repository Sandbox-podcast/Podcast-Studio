#!/usr/bin/env python3
"""Align per-sample (SAMPLE_MS) publisher series: media-source fps, candidate-pair availableOutgoingBitrate,
per-rid outbound targetBitrate / bytesSent-derived kbps / res / fps / QLR. Flags coincidences:
QLR switch (any rid) or top-layer drop (res change or enc fps 0) within +-WIN of a capture dip (src fps < 24);
WIN = --win-s seconds (default 2.0, +0.15 s slack for sampling jitter; works for 1 s and 2 s sampling).
Usage: align-bwe.py <cond_dir> [--json out.json] [--csv out.csv] [--win-s 2.0]"""
import csv, json, sys
from pathlib import Path
d = Path(sys.argv[1]); args = sys.argv[2:]
def opt(k): return args[args.index(k) + 1] if k in args else None
f = lambda x: (float(x) if x not in (None, "", "null") else None)
out = list(csv.DictReader(open(d / "outbound-rid-series.csv", encoding="utf-8-sig")))
cond = out[0]["cond"]; L = 2 if "-2L-" in cond else 3; top = "h" if L == 2 else "f"
src = {r["t_rel_s"]: r for r in csv.DictReader(open(d / "media-source-series.csv", encoding="utf-8-sig"))}
bwe = {}
if (d / "bwe-series.csv").exists():
    for r in csv.DictReader(open(d / "bwe-series.csv", encoding="utf-8-sig")):
        if r["has_out_video"] == "true": bwe[r["t_rel_s"]] = r
rids = sorted({r["rid"] for r in out})
ts = sorted({r["t_rel_s"] for r in out}, key=float)
by = {(r["t_rel_s"], r["rid"]): r for r in out}
rows, prev = [], {}
for t in ts:
    s = src.get(t, {}); b = bwe.get(t, {})
    e = {"t": float(t), "at": by.get((t, top), {}).get("at_paris"),
         "src_fps": f(s.get("src_fps")), "src_fps_frames": f(s.get("src_fps_frames")),
         "aob_kbps": round(f(b["availableOutgoingBitrate"]) / 1000, 1) if b.get("availableOutgoingBitrate") else None}
    for rid in rids:
        r = by.get((t, rid)); p = prev.get(rid)
        if not r: continue
        kb = fe = None
        if p and f(r["bytesSent"]) is not None and f(p["bytesSent"]) is not None:
            dt = float(t) - float(p["t_rel_s"])
            if dt > 0:
                kb = round((f(r["bytesSent"]) - f(p["bytesSent"])) * 8 / dt / 1000, 1)
                if f(r["framesEncoded"]) is not None and f(p["framesEncoded"]) is not None:
                    fe = round((f(r["framesEncoded"]) - f(p["framesEncoded"])) / dt, 1)
        e[rid] = {"res": f"{r['w']}x{r['h']}" if r["w"] else "-", "fps": f(r["fps"]), "enc_fps": fe, "qlr": r["qlr"],
                  "target_kbps": round(f(r["targetBitrate"]) / 1000, 1) if f(r["targetBitrate"]) else None, "kbps": kb}
        prev[rid] = r
    rows.append(e)
# events
ev = []
for i in range(1, len(rows)):
    a, b = rows[i - 1], rows[i]
    for rid in rids:
        if rid in a and rid in b:
            if a[rid]["qlr"] != b[rid]["qlr"]: ev.append((b["t"], rid, f"QLR {a[rid]['qlr']}->{b[rid]['qlr']}"))
    if top in a and top in b:
        if a[top]["res"] != b[top]["res"]: ev.append((b["t"], top, f"top res {a[top]['res']}->{b[top]['res']}"))
        ea, eb = a[top]["enc_fps"], b[top]["enc_fps"]
        if ea is not None and eb is not None and ea > 0 and eb == 0: ev.append((b["t"], top, "top enc fps ->0 (layer cut)"))
        if ea is not None and eb is not None and ea == 0 and eb > 0: ev.append((b["t"], top, "top enc fps 0->>0 (layer back)"))
dips = [r["t"] for r in rows if (r["src_fps"] is not None and r["src_fps"] < 24) or (r["src_fps_frames"] is not None and r["src_fps_frames"] < 24)]
step = (rows[1]["t"] - rows[0]["t"]) if len(rows) > 1 else 2
win = float(opt("--win-s") or 2.0)
coin = []
for t, rid, what in ev:
    near = [x for x in dips if abs(x - t) <= win + 0.15]
    coin.append({"t": t, "rid": rid, "event": what, "src_dip_within_win": near,
                 "src_fps_at_t": next((r["src_fps"] for r in rows if r["t"] == t), None)})
res = {"cond": cond, "top": top, "sample_s": round(step, 1), "win_s": win, "src_dips_lt24_t": dips, "events": coin,
       "aob_kbps": [r["aob_kbps"] for r in rows], "rows": rows}
if opt("--json"): json.dump(res, open(opt("--json"), "w"), indent=1)
if opt("--csv"):
    with open(opt("--csv"), "w", newline="") as fh:
        w = csv.writer(fh); hdr = ["t_rel_s", "at_paris", "src_fps", "src_fps_frames", "aob_kbps"]
        for rid in rids: hdr += [f"{rid}_res", f"{rid}_fps", f"{rid}_enc_fps", f"{rid}_qlr", f"{rid}_target_kbps", f"{rid}_kbps"]
        w.writerow(hdr)
        for r in rows:
            line = [r["t"], r["at"], r["src_fps"], r["src_fps_frames"], r["aob_kbps"]]
            for rid in rids:
                x = r.get(rid, {}); line += [x.get("res"), x.get("fps"), x.get("enc_fps"), x.get("qlr"), x.get("target_kbps"), x.get("kbps")]
            w.writerow(line)
print(f"{cond}: sample {step:.1f}s, src dips<24 at {dips}")
for c in coin: print(f"  t={c['t']:>6} {c['rid']:>2} {c['event']:<34} src_fps={c['src_fps_at_t']} dip±{win:g}s={c['src_dip_within_win']}")
