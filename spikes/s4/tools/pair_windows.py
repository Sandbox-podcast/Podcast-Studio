#!/usr/bin/env python3
"""S4 rec vs RTC live series: per-1 s windows, pts gaps, inside/outside live high-layer cut, media-source cross-check.

Inputs per condition (all produced/fetched outside the repo; camera footage is never committed):
  <s4ab>/<inbox>/<stem>.results.json      S4 drop-in results (recording.wallStartIso, gaps/cuts/errors, integrity)
  <s4ab>/out/<tag>/<cond>/framemd5_gray.txt   ffmpeg -i REC.webm -map 0:v:0 -pix_fmt gray -f framemd5 ...
  <s4ab>/out/<tag>/<cond>/pairs_v2_t{0.3,0.5}.json   tools/distinct_fps.py --threshold T --dump-pairs ...
  <s4ab>/out/<tag>/<cond>/distinct_v2_t0.5.json      tools/distinct_fps.py --json-out ...
  <rtc>/ab-cam-<cond>-on/media-source-series.csv     RTC harness (PR #3)
Alignment: t_rec = t_RTC - offset, offset = recording.wallStartIso - RTC window start (Paris).
Cut bounds (RTC time, from outbound-rid-series framesEncoded of the top rid): 'strict' = top-layer encode 0 fps,
'broad' adds the 2 s transition samples on each side. Windows are assigned in rec time; trailing partial window excluded.

Usage:
  python3 pair_windows.py --tag ab-pair1132    --s4ab-dir S4AB_DIR --rtc-dir RTC_PAIR_DIR
  python3 pair_windows.py --tag ab-pairsolo1150 --s4ab-dir S4AB_DIR --rtc-dir RTC_SOLO_DIR
Writes <s4ab>/out/<tag>/pair_windows.json and <s4ab>/out/<tag>/<cond>/windows_1s.json.
"""
import argparse, json, csv, statistics as st
from datetime import datetime, timezone, timedelta

CONFIGS = {
    'ab-pair1132': dict(inbox='inbox-pair1132', conds={
        '2L': dict(stem='ab-cam-2L-on-raw-1791279134440', top='h', win='2026-10-06T11:32:14.140',
                   strict=(10.8, 47.7), broad=(8.6, 49.7)),
        '3L': dict(stem='ab-cam-3L-on-raw-1791279339383', top='f', win='2026-10-06T11:35:39.181',
                   strict=(51.7, 110.7), broad=(49.5, 112.7))}),
    'ab-pairsolo1150': dict(inbox='inbox-pairsolo1150', conds={
        '2L': dict(stem='ab-cam-2L-on-raw-1791280282546', top='h', win='2026-10-06T11:51:21.957',
                   strict=(87.0, 121.5), broad=(84.9, 121.5)),
        '3L': dict(stem='ab-cam-3L-on-raw-1791280481437', top='f', win='2026-10-06T11:54:41.011',
                   strict=None, broad=None)}),
}
PARIS = timezone(timedelta(hours=2))

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('--tag', required=True, choices=sorted(CONFIGS))
ap.add_argument('--s4ab-dir', required=True)
ap.add_argument('--rtc-dir', required=True)
a = ap.parse_args()
B, R, TAG = a.s4ab_dir.rstrip('/'), a.rtc_dir.rstrip('/'), a.tag
CONDS = CONFIGS[TAG]['conds']; INBOX = CONFIGS[TAG]['inbox']

out = {}
for c, cfg in CONDS.items():
    O = f'{B}/out/{TAG}/{c}'
    res = json.load(open(f'{B}/{INBOX}/{cfg["stem"]}.results.json'))
    ws = datetime.fromisoformat(res['recording']['wallStartIso'].replace('Z', '+00:00'))
    w0 = datetime.fromisoformat(cfg['win']).replace(tzinfo=PARIS)
    off = (ws - w0).total_seconds()          # t_rec = t_rtc - off
    pts = []; h = []
    for l in open(f'{O}/framemd5_gray.txt'):
        if l.startswith('#'): continue
        p = [x.strip() for x in l.split(',')]; pts.append(int(p[2]) / 1000); h.append(p[5])
    exact_new = [i == 0 or h[i] != h[i - 1] for i in range(len(h))]
    pr = {t: json.load(open(f'{O}/pairs_v2_t{t}.json'))[0] for t in ('0.3', '0.5')}
    assert len(pr['0.3']['pts']) == len(pts)
    nW = int(pts[-1]) + 1
    W = {k: dict(written=0, exact=0, near03=0, near05=0) for k in range(nW)}
    for i, t in enumerate(pts):
        k = int(t); W[k]['written'] += 1; W[k]['exact'] += exact_new[i]
        W[k]['near03'] += pr['0.3']['near_new'][i]; W[k]['near05'] += pr['0.5']['near_new'][i]
    json.dump(W, open(f'{O}/windows_1s.json', 'w'), indent=0)
    gaps = [(round(pts[i - 1], 3), round((pts[i] - pts[i - 1]) * 1000)) for i in range(1, len(pts)) if pts[i] - pts[i - 1] > 0.100]
    share = {b: round(sum(W[k][b] >= 24 for k in W) / nW, 4) for b in ('written', 'exact', 'near03', 'near05')}
    lt24 = {k: W[k] for k in W if min(W[k].values()) < 24}

    def zone(k, iv):
        if iv is None: return False
        lo, hi = iv[0] - off, iv[1] - off
        return lo <= k and k + 1 <= hi
    full = [k for k in W if k + 1 <= pts[-1] + 1e-9]  # exclude trailing partial window
    ins = [k for k in full if zone(k, cfg['strict'])]
    trans = [k for k in full if cfg['broad'] and not zone(k, cfg['strict']) and (k + 1 > cfg['broad'][0] - off and k < cfg['broad'][1] - off)]
    outs = [k for k in full if k not in ins and k not in trans]
    def m(ks, b): return round(st.mean(W[k][b] for k in ks), 2) if ks else None
    def mn(ks, b): return min(W[k][b] for k in ks) if ks else None
    zones = {z: dict(n=len(ks), range=(min(ks), max(ks)) if ks else None, **{f'mean_{b}': m(ks, b) for b in ('written', 'exact', 'near03', 'near05')},
                     min_near05=mn(ks, 'near05'), share_ge24_near05=round(sum(W[k]['near05'] >= 24 for k in ks) / len(ks), 4) if ks else None)
             for z, ks in (('inside_strict', ins), ('transition', trans), ('outside', outs))}
    def fps_iv(lo, hi):
        n = sum(1 for t in pts if lo < t <= hi); return round(n / (hi - lo), 2), n
    fps_cut = fps_iv(cfg['strict'][0] - off, min(cfg['strict'][1] - off, pts[-1])) if cfg['strict'] else None
    ms = list(csv.DictReader(open(f'{R}/ab-cam-{c}-on/media-source-series.csv')))
    xs = []; prev = None
    for r in ms:
        t = float(r['t_rel_s'])
        if prev is not None:
            lo, hi = prev - off, t - off
            n_w = sum(1 for x in pts if lo < x <= hi)
            n_e = sum(1 for i, x in enumerate(pts) if lo < x <= hi and exact_new[i])
            n_n = sum(1 for i, x in enumerate(pts) if lo < x <= hi and pr['0.5']['near_new'][i])
            xs.append(dict(t_rtc=t, at=r['at_paris'][11:], src_fps=r['src_fps'], src_fps_frames=r['src_fps_frames'],
                           rec_written_fps=round(n_w / (hi - lo), 1), rec_exact_fps=round(n_e / (hi - lo), 1), rec_near05_fps=round(n_n / (hi - lo), 1)))
        prev = t
    dj = json.load(open(f'{O}/distinct_v2_t0.5.json'))['videos'][0]
    out[c] = dict(stem=cfg['stem'], wallStartIso=res['recording']['wallStartIso'], offset_s=round(off, 3), first_pts=pts[0], last_pts=pts[-1],
                  frames=len(pts), size_segments=dj['size_segments'], share_ge24=share, n_windows=nW,
                  lt24=lt24, gaps_gt100=gaps, zones=zones, fps_in_strict_cut_pts=fps_cut,
                  exact_total=sum(exact_new), near03_total=sum(pr['0.3']['near_new']), near05_total=sum(pr['0.5']['near_new']),
                  results_gaps=res['gaps'], results_cuts=res['cuts'], results_errors=res['errors'],
                  visibility=res['visibility'], integrity=res['integrity'], completeOk=res['completeOk'], xcheck=xs)
json.dump(out, open(f'{B}/out/{TAG}/pair_windows.json', 'w'), indent=1)
for c, o in out.items():
    print('=====', c, {k: v for k, v in o.items() if k not in ('xcheck', 'lt24', 'zones', 'integrity', 'visibility')})
    print('lt24', o['lt24']); print('zones', json.dumps(o['zones']))
