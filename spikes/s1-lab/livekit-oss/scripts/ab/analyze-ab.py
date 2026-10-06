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
# capture side (publisher getStats media-source, video) — runs before 2026-10-06 11:30 have no such data
src_csv = d / "media-source-series.csv"
srcs = list(csv.DictReader(open(src_csv, encoding="utf-8-sig"))) if src_csv.exists() else []
def mn(xs):
    xs = [x for x in xs if x is not None]
    return round(min(xs), 1) if xs else None
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
    subx = [r for r in inn if r["cond"] == cond and r["sub"] == "ab-sub-x" and r["kind"] == "video"]
    # media-source capture fps vs top-layer framesSent rate, same samples (cam drop vs encoder drop)
    sr = [r for r in srcs if r["cond"] == cond]
    if sr:
        src_fps = [f(r["src_fps"]) for r in sr]; src_ff = [f(r["src_fps_frames"]) for r in sr]
        sent_rate = {}
        for a, b in zip(rows, rows[1:]):
            fa, fb, ta, tb = f(a["framesSent"]), f(b["framesSent"]), f(a["t_rel_s"]), f(b["t_rel_s"])
            if None not in (fa, fb, ta, tb) and tb > ta: sent_rate[b["t_rel_s"]] = round((fb - fa) / (tb - ta), 1)
        low = [{"t_rel_s": f(r["t_rel_s"]), "src_fps": f(r["src_fps"]), "src_fps_frames": f(r["src_fps_frames"]), "top_sent_fps": sent_rate.get(r["t_rel_s"])}
               for r in sr if (f(r["src_fps"]) is not None and f(r["src_fps"]) < 24) or (r["t_rel_s"] in sent_rate and sent_rate[r["t_rel_s"]] < 24)]
        capture = {"n": len(sr), "sources": sorted({r["source_id"] for r in sr}),
                   "src_fps_med": med(src_fps), "src_fps_min": mn(src_fps),
                   "src_fps_frames_med": med(src_ff), "src_fps_frames_min": mn(src_ff),
                   "src_w_med": med([f(r["src_w"]) for r in sr]), "src_h_med": med([f(r["src_h"]) for r in sr]),
                   "samples_lt24_src_or_top_sent": low}
        # encoder-skip detector per layer: d framesEncoded/dt vs min(src fps, layer cap), only where qlr == none
        top_rid = top
        src_at = {r["t_rel_s"]: (f(r["src_fps_frames"]) if f(r["src_fps_frames"]) is not None else f(r["src_fps"])) for r in sr}
        enc_layers = {}
        for rid in sorted({r["rid"] for r in o}):
            rr = [r for r in o if r["rid"] == rid]
            if not rr or "framesEncoded" not in rr[0]: continue
            cap = 30 if rid == top_rid else 20
            ef_all, skips = [], []
            for a, b in zip(rr, rr[1:]):
                fa, fb, ta, tb = f(a["framesEncoded"]), f(b["framesEncoded"]), f(a["t_rel_s"]), f(b["t_rel_s"])
                if None in (fa, fb, ta, tb) or tb <= ta: continue
                ef = (fb - fa) / (tb - ta); ef_all.append(ef)
                sv = src_at.get(b["t_rel_s"])
                if sv is not None and ef < min(sv, cap) - 3 and b["qlr"] == "none":
                    skips.append({"t_rel_s": tb, "enc_fps": round(ef, 1), "src_fps": sv})
            enc_layers[rid] = {"layer_cap_fps": cap, "enc_fps_med": med(ef_all), "enc_fps_min": mn(ef_all),
                               "n_enc_lt_src_minus3_qlr_none": len(skips), "samples": skips}
        capture["encoder_vs_src"] = enc_layers or "NOT CAPTURED (no framesEncoded column)"
    elif out and "src_fps" in out[0]:
        sv = [f(r.get("src_fps")) for r in rows]
        capture = {"n": len(sv), "from": "outbound-rid-series.csv src_* (top layer rows)", "src_fps_med": med(sv), "src_fps_min": mn(sv)}
    else:
        capture = "NOT CAPTURED (run predates media-source sampling)"
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
        "per_rid": per_rid, "capture_src": capture, "cpu": cpu,
        "sub_hi_rx": {"w_med": med([f(r["w"]) for r in sub]), "h_med": med([f(r["h"]) for r in sub]), "fps_med": med([f(r["fps"]) for r in sub]), "freeze_delta": (f(sub[-1]["freezeCount"]) or 0) - (f(sub[0]["freezeCount"]) or 0) if sub else None},
        "sub_x_rx": ({"pub2": t.get("pub2"), "w_med": med([f(r["w"]) for r in subx]), "h_med": med([f(r["h"]) for r in subx]), "fps_med": med([f(r["fps"]) for r in subx]),
                      "freeze_delta": (f(subx[-1]["freezeCount"]) or 0) - (f(subx[0]["freezeCount"]) or 0),
                      "lost_delta": (f(subx[-1]["packetsLost"]) or 0) - (f(subx[0]["packetsLost"]) or 0)} if subx else None),
        "distinct_fps": dfps,
    }
json.dump(res, open(d / "AB-ANALYSIS.json", "w"), indent=2)
print(json.dumps(res, indent=1)[:20000])
