#!/usr/bin/env python3
"""Summarize S1 laptop A/B run dir (raw CSVs authoritative). Usage: analyze-ab.py <run_dir>"""
import csv, json, sys, statistics as st
from pathlib import Path
d = Path(sys.argv[1])
def med(xs):
    xs = [x for x in xs if x is not None]
    return round(st.median(xs), 1) if xs else None
def f(x):
    try: return float(x)
    except: return None
times = {r["cond"]: r for r in csv.DictReader(open(d / "conditions-timestamps.csv", encoding="utf-8-sig"))}
out = list(csv.DictReader(open(d / "outbound-rid-series.csv", encoding="utf-8-sig")))
inn = list(csv.DictReader(open(d / "inbound-series.csv", encoding="utf-8-sig")))
res = {}
for cond, t in times.items():
    L = 2 if "-2L-" in cond else 3
    cond_base = cond
    top = "h" if L == 2 else "f"
    o = [r for r in out if r["cond"] == cond]
    rows = [r for r in o if r["rid"] == top]
    with_dims = [r for r in rows if f(r["w"])]
    qlr_counts = {}
    for r in rows: qlr_counts[r["qlr"] or "null"] = qlr_counts.get(r["qlr"] or "null", 0) + 1
    n = sum(qlr_counts.values()) or 1
    dur = {}
    if rows:
        a, b = rows[0], rows[-1]
        for k in ("none", "cpu", "bandwidth", "other"):
            va, vb = f(a[f"qlrDur_{k}"]), f(b[f"qlrDur_{k}"])
            dur[k] = round(vb - va, 1) if va is not None and vb is not None else None
    tot = sum(v for v in dur.values() if v) or None
    per_rid = {}
    for rid in sorted({r["rid"] for r in o}):
        rr = [r for r in o if r["rid"] == rid]
        per_rid[rid] = {"w_med": med([f(r["w"]) for r in rr]), "h_med": med([f(r["h"]) for r in rr]), "fps_med": med([f(r["fps"]) for r in rr]), "n": len(rr), "n_with_dims": sum(1 for r in rr if f(r["w"]))}
    sub = [r for r in inn if r["cond"] == cond and r["sub"] == "ab-sub-hi" and r["kind"] == "video"]
    cpu = {}
    cf = d / f"{cond}-cpu.csv"
    if cf.exists():
        ws, we = t["window_start_paris"], t["window_end_paris"]
        rows_c = [r for r in csv.DictReader(open(cf, encoding="utf-8-sig")) if ws and we and ws <= r["ts_paris"] <= we]
        for role in ("pub", "sub"):
            rr = [r for r in rows_c if f"s1ab-{role}-" in r["marker"]]
            cpu[role] = {"machine_pct_med": med([f(r["cpu_pct_machine"]) for r in rr]), "machine_pct_max": max([f(r["cpu_pct_machine"]) or 0 for r in rr], default=None), "one_core_pct_med": med([f(r["cpu_pct_one_core"]) for r in rr]), "n": len(rr)}
        cpu["total_cpu_pct_med"] = med([f(r["total_cpu_pct"]) for r in rows_c])
        cpu["gpu_videoencode_pct_med"] = med([f(r["gpu_videoencode_pct"]) for r in rows_c])
        if rows_c and "nvenc_util_pct" in rows_c[0]:
            nv = [f(r["nvenc_util_pct"]) for r in rows_c]
            cpu["nvenc_util_pct_med"] = med(nv); cpu["nvenc_util_pct_max"] = max([x for x in nv if x is not None], default=None)
    dj = d / f"{cond}.json"
    dfps = json.load(open(dj)) if dj.exists() else None
    res[cond] = {
        "status": t["status"], "window": [t["window_start_paris"], t["window_end_paris"]], "rec": t["rec_result"] or "OFF",
        "hd_layer": top, "hd_sent": {"w_med": med([f(r["w"]) for r in with_dims]), "h_med": med([f(r["h"]) for r in with_dims]), "fps_med": med([f(r["fps"]) for r in with_dims]), "samples": len(rows), "samples_with_dims": len(with_dims)},
        "qlr_share_top": {k: round(v / n, 2) for k, v in qlr_counts.items()},
        "qlrDurations_delta_s": dur, "qlrDurations_share": {k: (round(v / tot, 2) if (v is not None and tot) else None) for k, v in dur.items()},
        "qlrResChanges_delta": (lambda a, b: (f(b) - f(a)) if f(a) is not None and f(b) is not None else None)(rows[0]["qlrResChanges"], rows[-1]["qlrResChanges"]) if rows else None,
        "encoderImplementation": sorted({r["encoderImplementation"] for r in o if r["encoderImplementation"]}),
        "per_rid": per_rid, "cpu": cpu,
        "sub_hi_rx": {"w_med": med([f(r["w"]) for r in sub]), "h_med": med([f(r["h"]) for r in sub]), "fps_med": med([f(r["fps"]) for r in sub]), "freeze_delta": (f(sub[-1]["freezeCount"]) or 0) - (f(sub[0]["freezeCount"]) or 0) if sub else None},
        "distinct_fps": dfps,
    }
json.dump(res, open(d / "AB-ANALYSIS.json", "w"), indent=2)
print(json.dumps(res, indent=1)[:20000])
