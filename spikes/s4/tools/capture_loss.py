#!/usr/bin/env python3
"""Capture-relative loss of an S4 rec vs RTC's media-source capture counter (box only, read-only on inputs).

Definition (see spikes/s4/ab-reports/2026-10-06-pair-1132-1135.md, "Perte relative à la capture"):
  For each pair of consecutive RTC media-source samples (i-1, i) of the condition:
    interval      = (ts[i-1], ts[i]]  -- stats-report timestamps (CSV `ts`, epoch ms), mapped to rec time with
                    t_rec = (ts - recWallStartMs)/1000, recWallStartMs = results.json recording.wallStartIso
                    (fallback without `ts`: t_rec = t_rel_s - offset, offset = recWallStart - RTC window start)
    expected_i    = src_frames[i] - src_frames[i-1]  (cumulative RTCVideoSourceStats.frames = frames captured;
                    NOT the plain `src_fps` field). Fallback if src_frames missing: src_fps_frames*dt, else src_fps*dt
                    (labelled in output).
    written_i     = number of rec video frames with pts in the interval (MediaRecorder frames written)
  Only intervals fully inside [first_pts, last_pts] of the rec are used (coverage reported).
    capture_loss_clipped = sum(max(0, expected_i - written_i)) / sum(expected_i)   <- headline metric
    capture_loss_net     = (sum(expected_i) - sum(written_i)) / sum(expected_i)    <- boundary-jitter-free cross-check
  The clipped value carries a positive bias from +/-1-frame boundary jitter (a frame on the boundary lands in
  the neighbour interval); the "noise floor" = clipped loss computed only on intervals where both
  expected/dt and written/dt are >= 28 fps is reported so the bias can be read off.

Raw S4 loss in analyze_ab.py (for comparison): loss_pct_vs_30fps = max(0, 1 - video_packets/(container_duration_s*30));
the gate is <=1 % AND no inter-frame gap > 200 ms.

Usage:
  python3 capture_loss.py --rec REC --results RESULTS.json --media-source media-source-series.csv \
      [--window-start 2026-10-06T11:32:14.140] [--json-out out.json] [--label 2L]
  REC = the .webm (pts via ffprobe), or framemd5_gray.txt, or distinct_fps v2 pairs json (--dump-pairs output).
  --window-start (Paris local, RTC window start) is only needed when the CSV has no `ts` column; it is also
  used to print the alignment offset (t_rec = t_RTC - offset).
"""
import argparse, csv, json, subprocess, sys
from datetime import datetime, timezone, timedelta

PARIS = timezone(timedelta(hours=2))


def rec_pts(path):
    if path.endswith('.json'):
        d = json.load(open(path)); d = d[0] if isinstance(d, list) else d
        return [float(x) for x in d['pts']], 'pairs-json'
    if path.endswith('.txt'):
        pts = []; tb = 1 / 1000
        for l in open(path):
            if l.startswith('#tb 0:'):
                n, den = l.split(':')[1].strip().split('/'); tb = int(n) / int(den)
            elif not l.startswith('#') and l.strip():
                pts.append(int(l.split(',')[2]) * tb)
        return pts, 'framemd5'
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=pts_time',
                          '-of', 'csv=p=0', path], capture_output=True, text=True, check=True).stdout
    pts = sorted(float(x.split(',')[0]) for x in out.split() if x.strip() and x.strip() != 'N/A')
    return pts, 'ffprobe-frames'


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--rec', required=True); ap.add_argument('--results', required=True)
    ap.add_argument('--media-source', required=True); ap.add_argument('--window-start')
    ap.add_argument('--json-out'); ap.add_argument('--label', default='')
    ap.add_argument('--steady-fps', type=float, default=28.0)
    ap.add_argument('--shift-s', type=float, default=0.0, help='sensitivity: add to every mapped t_rec (s)')
    a = ap.parse_args()

    res = json.load(open(a.results))
    ws = datetime.fromisoformat(res['recording']['wallStartIso'].replace('Z', '+00:00'))
    ws_ms = ws.timestamp() * 1000
    offset = None
    if a.window_start:
        w0 = datetime.fromisoformat(a.window_start)
        w0 = w0.replace(tzinfo=PARIS) if w0.tzinfo is None else w0
        offset = (ws - w0).total_seconds()
    pts, pts_src = rec_pts(a.rec)
    p0, p1 = pts[0], pts[-1]

    rows = list(csv.DictReader(open(a.media_source)))
    srcs = sorted({r.get('source_id') for r in rows})
    if len(srcs) > 1:
        print(f'WARNING: several media-source ids {srcs}; using all rows in order', file=sys.stderr)
    has_ts = all(r.get('ts') for r in rows)
    if not has_ts and offset is None:
        sys.exit('CSV has no ts column: --window-start is required')

    def t_rec(r):
        return ((float(r['ts']) - ws_ms) / 1000 if has_ts else float(r['t_rel_s']) - offset) + a.shift_s

    ivs = []; basis_used = set()
    for prev, cur in zip(rows, rows[1:]):
        a0, b0 = t_rec(prev), t_rec(cur); dt = b0 - a0
        if dt <= 0: continue
        if prev.get('src_frames') and cur.get('src_frames'):
            exp = int(float(cur['src_frames'])) - int(float(prev['src_frames'])); basis = 'src_frames delta'
        elif cur.get('src_fps_frames'):
            exp = float(cur['src_fps_frames']) * dt; basis = 'src_fps_frames*dt (APPROX)'
        else:
            exp = float(cur['src_fps']) * dt; basis = 'src_fps*dt (APPROX, plain fps field)'
        full = a0 >= p0 and b0 <= p1
        wr = sum(1 for t in pts if a0 < t <= b0)
        ivs.append(dict(t_rtc_end=float(cur['t_rel_s']), at_paris_end=cur.get('at_paris', ''), t_rec=(round(a0, 3), round(b0, 3)),
                        dt=round(dt, 3), expected=exp, written=wr, deficit=max(0, exp - wr), used=full,
                        src_fps=cur.get('src_fps'), src_fps_frames=cur.get('src_fps_frames'), basis=basis))
        if full: basis_used.add(basis)
    U = [v for v in ivs if v['used']]
    E = sum(v['expected'] for v in U); Wn = sum(v['written'] for v in U); D = sum(v['deficit'] for v in U)
    S = [v for v in U if v['expected'] / v['dt'] >= a.steady_fps and v['written'] / v['dt'] >= a.steady_fps]
    ES = sum(v['expected'] for v in S); DS = sum(v['deficit'] for v in S)
    cov = sum(v['dt'] for v in U)
    raw = max(0.0, 1 - len(pts) / ((p1 - p0) * 30)) if p1 > p0 else None  # pts-span variant, info only
    out = dict(label=a.label, rec=a.rec, pts_source=pts_src, results=a.results, media_source=a.media_source,
               wallStartIso=res['recording']['wallStartIso'], alignment='csv ts (stats timestamp)' if has_ts else 't_rel_s - offset', shift_s=a.shift_s,
               offset_s=round(offset, 3) if offset is not None else None,
               rec_frames=len(pts), rec_span_s=round(p1 - p0, 3), intervals_total=len(ivs), intervals_used=len(U),
               coverage_s=round(cov, 3), coverage_frac_of_rec=round(cov / (p1 - p0), 4),
               expected_basis=sorted(basis_used), sum_expected=E, sum_written=Wn, sum_deficit=D,
               capture_loss_clipped_pct=round(100 * D / E, 3) if E else None,
               capture_loss_net_pct=round(100 * (E - Wn) / E, 3) if E else None,
               noise_floor_clipped_pct=round(100 * DS / ES, 3) if ES else None, steady_intervals=len(S),
               raw_loss_vs30_ptsspan_pct_info=round(100 * raw, 2) if raw is not None else None,
               worst=sorted([v for v in U if v['deficit'] > 0], key=lambda v: -v['deficit'])[:8], intervals=ivs)
    if a.json_out: json.dump(out, open(a.json_out, 'w'), indent=1)
    print(f"[{a.label}] align={out['alignment']} offset={out['offset_s']} intervals {len(U)}/{len(ivs)} "
          f"coverage {out['coverage_s']} s ({out['coverage_frac_of_rec']:.1%}) basis={out['expected_basis']}")
    print(f"  expected {E} · written {Wn} · deficit {D}")
    print(f"  capture-relative loss: clipped {out['capture_loss_clipped_pct']} % · net {out['capture_loss_net_pct']} % "
          f"· noise floor (steady >= {a.steady_fps} fps, {len(S)} iv) {out['noise_floor_clipped_pct']} %")
    for v in out['worst']:
        print(f"  deficit {v['deficit']:>3} at RTC {v['t_rtc_end']} s (rec {v['t_rec']}) exp {v['expected']} wr {v['written']}")


if __name__ == '__main__':
    main()
