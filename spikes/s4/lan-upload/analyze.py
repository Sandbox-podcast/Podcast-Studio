import json, statistics as st
r = json.load(open('results-desktop-ai.json', encoding='utf-8-sig'))
def pct(xs, p):
    xs = sorted(xs); k = (len(xs)-1)*p; f = int(k); c = min(f+1, len(xs)-1); return xs[f] + (xs[c]-xs[f])*(k-f)
for L in 'ABD':
    x = r[L]; parts = x['parts']; full = [p for p in parts if p['bytes'] == 5*1024*1024]
    mbps = [p['bytes']*8/(p['ms']/1000)/1e6 for p in full]; ms = [p['ms'] for p in full]
    tot = sum(p['bytes'] for p in parts)
    print(f"{L} {x['mode']} {x['start']}-{x['end']} parts={len(parts)} total={x['total_ms']/1000:.2f}s "
          f"agg={tot/(x['total_ms']/1000)/1e6:.1f}MB/s={tot*8/(x['total_ms']/1000)/1e6:.0f}Mbps complete={x['complete_ms']}ms")
    print(f"   per 5MiB part ms: min {min(ms):.1f} med {st.median(ms):.1f} p95 {pct(ms,.95):.1f} max {max(ms):.1f} | "
          f"Mbps med {st.median(mbps):.0f} p5 {pct(mbps,.05):.0f} (MB/s med {st.median(mbps)/8:.1f}, p5 {pct(mbps,.05)/8:.1f}); first part {parts[0]['ms']}ms")
c = r['C']; print(json.dumps({k: v for k, v in c.items()}, indent=0))
print(json.dumps(r['integrity'], indent=0))
