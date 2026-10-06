#!/usr/bin/env python3
"""Pass 2a — remux proof. Measures ffmpeg -c copy remux on lab recordings."""
import json, os, re, resource, subprocess, sys, time
ROOT = os.path.dirname(os.path.abspath(__file__))
OUTD = os.path.join(ROOT, 'remux')
os.makedirs(OUTD, exist_ok=True)

def run(cmd):
    r0 = resource.getrusage(resource.RUSAGE_CHILDREN)
    t0 = time.perf_counter()
    p = subprocess.run(cmd, capture_output=True, text=True)
    wall = time.perf_counter() - t0
    r1 = resource.getrusage(resource.RUSAGE_CHILDREN)
    cpu = (r1.ru_utime - r0.ru_utime) + (r1.ru_stime - r0.ru_stime)
    return p, round(wall, 3), round(cpu, 3)

WARN_RE = re.compile(r'(non monoton|DTS|PTS|timestamp|Invalid|error|corrupt|discard)', re.I)

def warn_lines(stderr):
    return [l for l in stderr.splitlines() if WARN_RE.search(l)]

def probe(f):
    p, _, _ = run(['ffprobe', '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', f])
    d = json.loads(p.stdout) if p.returncode == 0 else {}
    fmt = d.get('format', {})
    streams = []
    for s in d.get('streams', []):
        streams.append({'type': s.get('codec_type'), 'codec': s.get('codec_name'),
                        'duration': s.get('duration'), 'tag_DURATION': (s.get('tags') or {}).get('DURATION'),
                        'bit_rate': s.get('bit_rate')})
    # Cues: ffprobe -v debug on matroska prints cue parsing; simpler: look for Cues element via mkvinfo-less check
    pd, _, _ = run(['ffprobe', '-v', 'debug', '-i', f])
    cues = None
    m = re.search(r'(parsing cues|Cues)', pd.stderr, re.I)
    cues = bool(m)
    # all warnings at probe level (verbose warning)
    pw, _, _ = run(['ffprobe', '-v', 'warning', '-show_entries', 'format=duration', '-of', 'json', f])
    return {'format_duration': fmt.get('duration'), 'bit_rate': fmt.get('bit_rate'), 'size': fmt.get('size'),
            'format_name': fmt.get('format_name'), 'streams': streams, 'cuesDetected': cues,
            'probeWarnings': len([l for l in pw.stderr.splitlines() if l.strip()]),
            'probeWarningSample': pw.stderr.splitlines()[:3]}

def decode_null(f):
    p, wall, cpu = run(['ffmpeg', '-hide_banner', '-nostats', '-v', 'warning', '-i', f, '-f', 'null', '-'])
    lines = [l for l in p.stderr.splitlines() if l.strip()]
    return {'rc': p.returncode, 'wallS': wall, 'cpuS': cpu, 'warnOrErrLines': len(lines),
            'errorLines': len([l for l in lines if re.search(r'error|corrupt|invalid', l, re.I)]),
            'sample': lines[:4]}

def seek(f, t):
    p, wall, _ = run(['ffmpeg', '-hide_banner', '-nostats', '-v', 'warning', '-ss', str(t), '-i', f,
                      '-frames:v', '1', '-f', 'null', '-'])
    lines = [l for l in p.stderr.splitlines() if l.strip()]
    # check actual decoded pts via ffprobe read_intervals
    pp, _, _ = run(['ffprobe', '-v', 'error', '-read_intervals', f'{t}%+#1', '-select_streams', 'v:0',
                    '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', f])
    first = pp.stdout.strip().splitlines()[:1]
    return {'t': t, 'rc': p.returncode, 'warnLines': len(lines), 'sample': lines[:3], 'wallS': wall,
            'firstFramePtsAfterSeek': first[0] if first else None}

def av_diff(pr):
    d = {s['type']: s for s in pr['streams']}
    def dur(s):
        if not s: return None
        if s.get('duration'): return float(s['duration'])
        t = s.get('tag_DURATION')
        if t:
            h, m, sec = t.split(':'); return int(h)*3600 + int(m)*60 + float(sec)
        return None
    v, a = dur(d.get('video')), dur(d.get('audio'))
    return {'video': v, 'audio': a, 'diffMs': round((v - a) * 1000, 1) if v is not None and a is not None else None}

def remux(src, dst, extra=()):
    cmd = ['ffmpeg', '-hide_banner', '-nostats', '-y', '-v', 'warning', *extra, '-i', src, '-c', 'copy', '-map', '0', dst]
    p, wall, cpu = run(cmd)
    return {'cmd': ' '.join(cmd[:1] + [c for c in cmd[1:] if c not in ('-hide_banner', '-nostats')]),
            'rc': p.returncode, 'wallS': wall, 'cpuS': cpu, 'warnLines': len(warn_lines(p.stderr)),
            'allStderrLines': len([l for l in p.stderr.splitlines() if l.strip()]),
            'stderrSample': p.stderr.splitlines()[:4],
            'inBytes': os.path.getsize(src), 'outBytes': os.path.getsize(dst) if os.path.exists(dst) else None}

inputs = [('lab-main-180s', os.path.join(ROOT, 'artifacts/lab-main-remote.webm'), [60, 150]),
          ('lab-resume-75s', os.path.join(ROOT, 'artifacts/lab-resume-remote.webm'), [60])]
report = {'ffmpeg': subprocess.run(['ffmpeg', '-version'], capture_output=True, text=True).stdout.splitlines()[0], 'files': []}
for name, src, seeks in inputs:
    e = {'name': name, 'src': os.path.relpath(src, ROOT), 'before': {}, 'variants': {}}
    e['before']['probe'] = probe(src)
    e['before']['avDiff'] = av_diff(e['before']['probe'])
    e['before']['seeks'] = [seek(src, t) for t in seeks]
    e['before']['decode'] = decode_null(src)
    variants = [('copy.webm', []), ('genpts.webm', ['-fflags', '+genpts']), ('copy.mkv', []), ('copy.mp4', [])]
    for suffix, extra in variants:
        dst = os.path.join(OUTD, f'{name}.{suffix}')
        if os.path.exists(dst): os.remove(dst)
        v = {'remux': remux(src, dst, extra)}
        if v['remux']['rc'] == 0 and os.path.exists(dst) and os.path.getsize(dst) > 0:
            v['probe'] = probe(dst)
            v['avDiff'] = av_diff(v['probe'])
            v['seeks'] = [seek(dst, t) for t in seeks]
            v['decode'] = decode_null(dst)
        e['variants'][suffix] = v
    report['files'].append(e)
json.dump(report, open(os.path.join(ROOT, 'out/remux-results.json'), 'w'), indent=2)
print('wrote out/remux-results.json')
