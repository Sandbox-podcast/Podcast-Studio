#!/usr/bin/env python3
"""S4 rec vs RTC live series for the alternating seq 17:07 (2L-a/3L-a/2L-b/3L-b): per-1 s windows,
pts gaps, rec distinct fps inside/outside live degradation, offsets.

Inputs per run (produced/fetched outside the repo; camera footage is never committed):
  <s4ab>/<inbox>/<run>/<stem>.results.json
  <s4ab>/out/<tag>/<run>/framemd5_gray.txt
  <s4ab>/out/<tag>/<run>/pairs_v2_t{0.3,0.5}.json
  <s4ab>/out/<tag>/<run>/distinct_v2_t{0.3,0.5}.json
  <rtc>/<run>/outbound-rid-series.csv

Alignment: t_rec = t_RTC - offset, offset = recording.wallStartIso - RTC window start (Paris).
Zones for 2L-a/2L-b are derived from rid-h framesEncoded / fps / targetBitrate sample times; the same
RTC-relative bounds are applied to 3L-a/3L-b as control. Trailing partial 1 s window excluded.

Usage:
  python3 seq_windows.py --s4ab-dir S4AB_DIR --rtc-dir RTC_SEQ_DIR [--tag ab-seq170746] [--inbox inbox-seq170746]
Writes <s4ab>/out/<tag>/seq_windows.json and <s4ab>/out/<tag>/<run>/windows_1s.json.
"""
import argparse, json, csv, glob, os, statistics as st
from datetime import datetime, timezone, timedelta

PARIS = timezone(timedelta(hours=2))
RUNS = {
    '2L-a': ('2026-10-06T17:08:51.991', '2026-10-06T17:08:52.209'),
    '3L-a': ('2026-10-06T17:13:11.600', '2026-10-06T17:13:11.912'),
    '2L-b': ('2026-10-06T17:17:30.874', '2026-10-06T17:17:31.122'),
    '3L-b': ('2026-10-06T17:21:50.292', '2026-10-06T17:21:50.625'),
}

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('--s4ab-dir', required=True)
ap.add_argument('--rtc-dir', required=True)
ap.add_argument('--tag', default='ab-seq170746')
ap.add_argument('--inbox', default='inbox-seq170746')
a = ap.parse_args()
B, R = a.s4ab_dir.rstrip('/'), a.rtc_dir.rstrip('/')
O = f'{B}/out/{a.tag}'
INBOX = a.inbox


def P(s):
    return datetime.fromisoformat(s).replace(tzinfo=PARIS)


def hrows(run):
    return [r for r in csv.DictReader(open(f'{R}/{run}/outbound-rid-series.csv')) if r['rid'] == 'h']


out = {}
zones_rtc = {}
# 2L-a: h framesEncoded flat (cut) through sample t=27; ramp while h fps<28 after resume; 2L-b: t<=50 (target<1.7 Mbps)
h = hrows('2L-a')
fe = [int(r['framesEncoded']) for r in h]
last_flat = max(i for i in range(1, len(h)) if fe[i] == fe[0])
ramp_end = max(i for i in range(last_flat + 1, len(h)) if h[i]['fps'] and int(h[i]['fps']) < 28 and float(h[i]['t_rel_s']) < 60)
zones_rtc['2L-a'] = dict(cut_end_at=h[last_flat]['at_paris'], cut_end_t=h[last_flat]['t_rel_s'],
                         ramp_end_at=h[ramp_end]['at_paris'], ramp_end_t=h[ramp_end]['t_rel_s'])
h = hrows('2L-b')
i50 = [i for i, r in enumerate(h) if r['t_rel_s'] == '50'][0]
first17 = [i for i, r in enumerate(h) if r['targetBitrate'] and int(r['targetBitrate']) >= 1700000][0]
zones_rtc['2L-b'] = dict(reduced_end_at=h[i50]['at_paris'], reduced_end_t='50', target_t50=h[i50]['targetBitrate'],
                         first_1700k_t=h[first17]['t_rel_s'],
                         target_range_t1_50=(min(int(r['targetBitrate']) for r in h[:i50 + 1]),
                                            max(int(r['targetBitrate']) for r in h[:i50 + 1])))

for run, (w0, reclog) in RUNS.items():
    D = f'{O}/{run}'
    stems = sorted(glob.glob(f'{B}/{INBOX}/{run}/*.results.json'))
    if not stems:
        raise SystemExit(f'missing results.json under {B}/{INBOX}/{run}/')
    stem = os.path.basename(stems[0])[:-len('.results.json')]
    res = json.load(open(f'{B}/{INBOX}/{run}/{stem}.results.json'))
    ws = datetime.fromisoformat(res['recording']['wallStartIso'].replace('Z', '+00:00'))
    off = (ws - P(w0)).total_seconds()
    pts = []; hh = []
    for l in open(f'{D}/framemd5_gray.txt'):
        if l.startswith('#'):
            continue
        p = [x.strip() for x in l.split(',')]
        pts.append(int(p[2]) / 1000); hh.append(p[5])
    exact = [i == 0 or hh[i] != hh[i - 1] for i in range(len(hh))]
    pr = {t: json.load(open(f'{D}/pairs_v2_t{t}.json'))[0] for t in ('0.3', '0.5')}
    assert len(pr['0.3']['pts']) == len(pts) == len(pr['0.5']['pts'])
    nW = int(pts[-1]) + 1
    B4 = ('written', 'exact', 'near03', 'near05')
    W = {k: dict(written=0, exact=0, near03=0, near05=0) for k in range(nW)}
    for i, t in enumerate(pts):
        k = int(t)
        W[k]['written'] += 1; W[k]['exact'] += exact[i]
        W[k]['near03'] += pr['0.3']['near_new'][i]; W[k]['near05'] += pr['0.5']['near_new'][i]
    json.dump(W, open(f'{D}/windows_1s.json', 'w'), indent=0)
    dg = [(pts[i] - pts[i - 1]) * 1000 for i in range(1, len(pts))]
    gaps = [(round(pts[i - 1], 3), round(dg[i - 1])) for i in range(1, len(pts)) if dg[i - 1] > 100]
    share = {b: (sum(W[k][b] >= 24 for k in W), nW, round(sum(W[k][b] >= 24 for k in W) / nW, 4)) for b in B4}
    lt24 = {k: W[k] for k in W if min(W[k].values()) < 24}
    full = [k for k in W if k + 1 <= pts[-1] + 1e-9]

    def zone_stats(lo, hi):
        ks = [k for k in full if lo <= k and k + 1 <= hi]
        n = sum(1 for t in pts if lo < t <= hi)
        ne = sum(1 for i, t in enumerate(pts) if lo < t <= hi and exact[i])
        n3 = sum(1 for i, t in enumerate(pts) if lo < t <= hi and pr['0.3']['near_new'][i])
        n5 = sum(1 for i, t in enumerate(pts) if lo < t <= hi and pr['0.5']['near_new'][i])
        d = hi - lo
        return dict(rec_s=(round(lo, 3), round(hi, 3)), n_windows=len(ks),
                    win_range=(min(ks), max(ks)) if ks else None,
                    **{f'mean_{b}': (round(st.mean(W[k][b] for k in ks), 2) if ks else None) for b in B4},
                    min_near05=min(W[k]['near05'] for k in ks) if ks else None,
                    min_written=min(W[k]['written'] for k in ks) if ks else None,
                    share_ge24_near05=round(sum(W[k]['near05'] >= 24 for k in ks) / len(ks), 4) if ks else None,
                    pts_fps=dict(written=round(n / d, 2), exact=round(ne / d, 2),
                                 near03=round(n3 / d, 2), near05=round(n5 / d, 2), frames=n))

    end = pts[-1]
    za, zb = zones_rtc['2L-a'], zones_rtc['2L-b']

    def rel(at, base):
        return (P(at) - P(base)).total_seconds()

    cut_end = rel(za['cut_end_at'], RUNS['2L-a'][0])
    ramp_end = rel(za['ramp_end_at'], RUNS['2L-a'][0])
    red_end = rel(zb['reduced_end_at'], RUNS['2L-b'][0])
    Z = {
        'A_cut': zone_stats(0.0, cut_end - off),
        'A_ramp': zone_stats(cut_end - off, ramp_end - off),
        'A_cut+ramp': zone_stats(0.0, ramp_end - off),
        'A_outside': zone_stats(ramp_end - off, end),
        'B_reduced_t<=50': zone_stats(0.0, red_end - off),
        'B_after_t50': zone_stats(red_end - off, end),
        'all': zone_stats(0.0, end),
    }
    dj = {t: json.load(open(f'{D}/distinct_v2_t{t}.json'))['videos'][0] for t in ('0.3', '0.5')}
    out[run] = dict(
        stem=stem, wallStartIso=res['recording']['wallStartIso'],
        ws_paris=ws.astimezone(PARIS).isoformat()[11:23], rtc_window_start=w0[11:],
        offset_s=round(off, 3), reclog_minus_ws_ms=round((P(reclog) - ws).total_seconds() * 1000),
        frames=len(pts), first_pts=pts[0], last_pts=pts[-1], max_gap_ms=round(max(dg)),
        gaps_gt100=gaps, gaps_gt200=[g for g in gaps if g[1] > 200],
        share_ge24=share, lt24=lt24, zones=Z,
        zone_bounds_rtc_s=dict(cut_end=round(cut_end, 3), ramp_end=round(ramp_end, 3), reduced_end=round(red_end, 3)),
        distinct={t: {k: dj[t][k] for k in (
            'size_segments', 'size_changes', 'total_frames', 'distinct_frames_exact', 'distinct_fps_exact',
            'distinct_frames_near', 'distinct_fps_near', 'windows_1s_share_ge24', 'windows_1s_lt24_count',
            'windows_1s_min', 'windows_1s_median', 'windows_1s_share_ge24_exact', 'windows_1s_min_exact',
            'longest_repeat_run_ms', 'longest_neardup_run_ms')} for t in dj},
        results_gaps=res['gaps'], results_cuts=res['cuts'], results_errors=res['errors'],
        visibility=res['visibility'], integrity=res['integrity'], completeOk=res['completeOk'],
        watchdog=res.get('watchdog'))

json.dump(dict(zones_rtc=zones_rtc, runs=out), open(f'{O}/seq_windows.json', 'w'), indent=1)
print(json.dumps(zones_rtc))
for r, o in out.items():
    print('=====', r, {k: v for k, v in o.items() if k not in ('zones', 'distinct', 'integrity', 'visibility', 'lt24')})
    print(' integrity', o['integrity']); print(' visibility', o['visibility'])
    print(' lt24', o['lt24']); print(' distinct', json.dumps(o['distinct']))
    for z, v in o['zones'].items():
        print('  ', z, json.dumps(v))
