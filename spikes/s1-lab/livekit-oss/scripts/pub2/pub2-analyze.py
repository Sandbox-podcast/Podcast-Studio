#!/usr/bin/env python3
"""LAN pub2 (desktop-ai) analysis. Usage: pub2-analyze.py <pub2_run_dir> [<laptop_cond_dir> ...]
Writes pub2-outbound-rid-series.csv / pub2-media-source-series.csv / pub2-ice.csv and PUB2-ANALYSIS.json with one
block per laptop condition window (window = conditions-timestamps.csv of each laptop cond dir). Raw data stays authoritative."""
import csv, json, sys, statistics as st
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
PAR = ZoneInfo("Europe/Paris")
d = Path(sys.argv[1]); conds = [Path(x) for x in sys.argv[2:]]
def paris(iso): return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(PAR).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3]
def med(xs):
    xs = [x for x in xs if x is not None]; return round(st.median(xs), 1) if xs else None
def mn(xs):
    xs = [x for x in xs if x is not None]; return round(min(xs), 1) if xs else None
def mx(xs):
    xs = [x for x in xs if x is not None]; return round(max(xs), 1) if xs else None
def f(x):
    try: return float(x)
    except: return None
S = [json.loads(l) for l in open(d / "pub2-samples.jsonl", encoding="utf-8") if l.strip()]
for s in S: s["paris"] = paris(s["at"])
with open(d / "pub2-outbound-rid-series.csv", "w", newline="") as fo, open(d / "pub2-media-source-series.csv", "w", newline="") as fs, open(d / "pub2-ice.csv", "w", newline="") as fi:
    wo, ws, wi = csv.writer(fo), csv.writer(fs), csv.writer(fi)
    wo.writerow(["at_paris", "rid", "w", "h", "fps", "framesSent", "framesEncoded", "totalEncodeTime", "keyFramesEncoded", "bytesSent", "active", "qlr", "qlrDur_none", "qlrDur_cpu", "qlrDur_bandwidth", "qlrDur_other", "qlrResChanges", "encoderImplementation", "powerEfficientEncoder", "scalabilityMode", "targetBitrate", "codec", "ts"])
    ws.writerow(["at_paris", "source_id", "src_fps", "src_frames", "src_w", "src_h", "ts"])
    wi.writerow(["at_paris", "pc", "state", "rtt_ms", "local_type", "local_protocol", "local_address", "local_port", "relayProtocol", "networkType", "remote_type", "remote_protocol", "remote_address", "remote_port"])
    for s in S:
        for o in s.get("out", []):
            q = o.get("qlrDurations") or {}
            wo.writerow([s["paris"], o["rid"], o["w"], o["h"], o["fps"], o["framesSent"], o["framesEncoded"], o["totalEncodeTime"], o["keyFramesEncoded"], o["bytesSent"], o["active"], o["qlr"], q.get("none"), q.get("cpu"), q.get("bandwidth"), q.get("other"), o["qlrResChanges"], o["encoderImplementation"], o["powerEfficientEncoder"], o["scalabilityMode"], o["targetBitrate"], o["codec"], o["ts"]])
        for m in s.get("src", []): ws.writerow([s["paris"], m["id"], m["fps"], m["frames"], m["w"], m["h"], m["ts"]])
        for i in s.get("ice", []):
            l, r = i.get("local", {}), i.get("remote", {})
            wi.writerow([s["paris"], i["pc"], i["state"], i["rttMs"], l.get("type"), l.get("protocol"), l.get("address"), l.get("port"), l.get("relayProtocol"), l.get("networkType"), r.get("type"), r.get("protocol"), r.get("address"), r.get("port")])
cpu_rows = list(csv.DictReader(open(d / "pub2-cpu.csv", encoding="utf-8-sig"))) if (d / "pub2-cpu.csv").exists() else []
def block(ws_, we_):
    ss = [s for s in S if ws_ <= s["paris"] <= we_]
    res = {"window": [ws_, we_], "n_samples": len(ss)}
    src = [m for s in ss for m in s.get("src", [])]
    srcf = []
    for a, b in zip(src, src[1:]):
        if a["frames"] is not None and b["frames"] is not None and b["ts"] > a["ts"]: srcf.append((b["frames"] - a["frames"]) / ((b["ts"] - a["ts"]) / 1000))
    res["src"] = {"src_fps_med": med([m["fps"] for m in src]), "src_fps_min": mn([m["fps"] for m in src]), "src_fps_frames_med": med(srcf), "src_fps_frames_min": mn(srcf), "w": med([m["w"] for m in src]), "h": med([m["h"] for m in src])}
    src_by_ts = {}
    for s in ss:
        if s.get("src"): src_by_ts[s["ms"]] = s["src"][0]
    layers = {}
    for rid in sorted({o["rid"] for s in ss for o in s.get("out", [])}, key=str):
        rows = [(s, o) for s in ss for o in s.get("out", []) if o["rid"] == rid]
        cap = 30 if rid == "h" else 20  # 2 layers: q (h180 preset, 20 fps) + h (source, 30 fps)
        enc, sent, ems, skips = [], [], [], []
        for (sa, a), (sb, b) in zip(rows, rows[1:]):
            dt = (b["ts"] - a["ts"]) / 1000
            if dt <= 0 or a["framesEncoded"] is None or b["framesEncoded"] is None: continue
            df = b["framesEncoded"] - a["framesEncoded"]; ef = df / dt; enc.append(ef)
            sent.append((b["framesSent"] - a["framesSent"]) / dt)
            if df > 0 and b["totalEncodeTime"] is not None: ems.append(1000 * (b["totalEncodeTime"] - a["totalEncodeTime"]) / df)
            m = src_by_ts.get(sb["ms"])
            if m and m["fps"] is not None and ef < min(m["fps"], cap) - 3 and b["qlr"] == "none": skips.append({"at": sb["paris"], "enc_fps": round(ef, 1), "src_fps": m["fps"]})
        q0 = rows[0][1].get("qlrDurations") or {} if rows else {}; q1 = rows[-1][1].get("qlrDurations") or {} if rows else {}
        qc = {}
        for _, o in rows: qc[o["qlr"] or "null"] = qc.get(o["qlr"] or "null", 0) + 1
        layers[rid] = {"n": len(rows), "w_med": med([o["w"] for _, o in rows]), "h_med": med([o["h"] for _, o in rows]), "fps_med": med([o["fps"] for _, o in rows]),
                       "enc_fps_med": med(enc), "enc_fps_min": mn(enc), "sent_fps_med": med(sent), "sent_fps_min": mn(sent), "encode_ms_per_frame_med": med(ems),
                       "qlr_counts": qc, "qlrDurations_delta_s": {k: round(q1.get(k, 0) - q0.get(k, 0), 1) for k in q1},
                       "keyFrames_delta": (rows[-1][1]["keyFramesEncoded"] or 0) - (rows[0][1]["keyFramesEncoded"] or 0) if rows else None,
                       "encoderImplementation": sorted({o["encoderImplementation"] for _, o in rows if o["encoderImplementation"]}),
                       "layer_cap_fps": cap, "n_enc_lt_src_minus3_qlr_none": len(skips), "samples_enc_lt_src_minus3_qlr_none": skips}
    res["layers"] = layers
    pairs = {}
    for s in ss:
        for i in s.get("ice", []):
            k = f'pc{i["pc"]} local={i["local"].get("type")}/{i["local"].get("protocol")} {i["local"].get("address")} -> remote={i["remote"].get("type")}/{i["remote"].get("protocol")} {i["remote"].get("address")}:{i["remote"].get("port")}'
            pairs[k] = pairs.get(k, 0) + 1
    res["ice_selected_pairs"] = pairs
    res["ice_rtt_ms_med"] = med([i["rttMs"] for s in ss for i in s.get("ice", [])])
    cr = [r for r in cpu_rows if ws_ <= r["ts_paris"] <= we_]
    res["cpu_gpu"] = {"edge_cpu_pct_machine_med": med([f(r["cpu_pct_machine"]) for r in cr]), "edge_cpu_pct_machine_max": mx([f(r["cpu_pct_machine"]) for r in cr]),
                      "edge_cpu_pct_one_core_med": med([f(r["cpu_pct_one_core"]) for r in cr]), "total_cpu_pct_med": med([f(r["total_cpu_pct"]) for r in cr]),
                      "nv_gpu_util_pct_med": med([f(r.get("nv_gpu_util_pct")) for r in cr]), "nv_gpu_util_pct_max": mx([f(r.get("nv_gpu_util_pct")) for r in cr]),
                      "nvenc_util_pct_med": med([f(r["nvenc_util_pct"]) for r in cr]), "gpu_videoencode_pct_med": med([f(r["gpu_videoencode_pct"]) for r in cr]), "n": len(cr),
                      "note": "edge_* = test Edge processes only (marker); GPU columns are machine-wide"}
    return res
out = {"run_dir": str(d), "n_samples_total": len(S), "first": S[0]["paris"] if S else None, "last": S[-1]["paris"] if S else None, "conds": {}}
for cd in conds:
    for r in csv.DictReader(open(cd / "conditions-timestamps.csv", encoding="utf-8-sig")):
        if r["window_start_paris"] and r["window_end_paris"]: out["conds"][r["cond"]] = block(r["window_start_paris"], r["window_end_paris"])
        else: out["conds"][r["cond"]] = {"status": r["status"], "note": r["note"]}
json.dump(out, open(d / "PUB2-ANALYSIS.json", "w"), indent=2)
print(json.dumps(out, indent=1)[:12000])
