#!/usr/bin/env python3
"""S3 server matte, CUDA: N streams in ONE process, ONE batched session (batch N), C ds0.4, paced 30 fps.
Answers: is the N=5 drop to ~25 fps from multi-process GPU sharing or a real limit? Measures only."""
import json, sys, threading, time, statistics
import numpy as np, onnxruntime as ort
sys.path.insert(0, r"C:\Users\azero\podcast-studio\s3-cuda")
import cuda_bench as cb
cb.EP = "cuda"
if hasattr(ort, "preload_dlls"): ort.preload_dlls()
N = int(sys.argv[1]) if len(sys.argv) > 1 else 5
SECS = int(sys.argv[2]) if len(sys.argv) > 2 else 60
DS = 0.4; FPS = cb.FPS
frames = cb.decode(25, 10); nf = len(frames)
s = cb.session(0); dsr = np.array([DS], np.float32)
def batch(idx):
    return np.stack([(frames[(idx + 37*k) % nf].astype(np.float32)/255.0).transpose(2,0,1) for k in range(N)])
# sanity: batched stream 0 == single-stream on same frame (zero state)
z = [np.zeros((1,1,1,1), np.float32)]*4
_, p1, _ = cb.run1(s, z, batch(0)[:1], dsr)
_, pN, _ = cb.run1(s, z, batch(0), dsr)
sanity = dict(batch_out_shape=list(pN.shape), max_abs_diff_stream0=float(np.abs(pN[:1]-p1).max()))
rec = z
for i in range(10): _, _, rec = cb.run1(s, rec, batch(i), dsr)
rec = z
stop = threading.Event(); g = []
threading.Thread(target=cb.gpu_sampler, args=(stop, g), daemon=True).start()
t0 = time.perf_counter(); tend = t0 + SECS; done = 0; lat = []; inf = []; prep = []
while True:
    now = time.perf_counter()
    if now >= tend: break
    idx = int((now - t0)*FPS); arrival = t0 + idx/FPS
    tp = time.perf_counter(); src = batch(idx); prep.append((time.perf_counter()-tp)*1000)
    ti = time.perf_counter(); fgr, pha, rec = cb.run1(s, rec, src, dsr); inf.append((time.perf_counter()-ti)*1000)
    lat.append((time.perf_counter()-arrival)*1000); done += 1
    w = t0 + (idx+1)/FPS - time.perf_counter()
    if w > 0: time.sleep(w)
stop.set()
util = [int(x.split(",")[0]) for x in g if not x.startswith("ERR")]
mem = [int(x.split(",")[1]) for x in g if not x.startswith("ERR")]
res = dict(start=time.strftime("%Y-%m-%d %H:%M:%S"), n=N, batch=N, ds=DS, mode="C", secs=SECS, procs="one process, one batched session",
           providers=s.get_providers(), sanity=sanity,
           fps_per_stream=round(done/SECS, 2), lat_p50=cb.pct(lat,50), lat_p95=cb.pct(lat,95),
           inf_batch_p50=cb.pct(inf,50), inf_batch_p95=cb.pct(inf,95), prep_cpu_p50=cb.pct(prep,50), prep_cpu_p95=cb.pct(prep,95),
           gpu_util_mean=round(statistics.mean(util),1) if util else None, gpu_util_max=max(util) if util else None,
           gpu_mem_max_mb=max(mem) if mem else None)
(cb.OUT/f"result-batch-n{N}.json").write_text(json.dumps(res, indent=1)); print(json.dumps(res)); print("DONE")
