#!/usr/bin/env python3
"""S4 desktop-ai credential-free handoff (BOX side, never run on the recording machine).

Signs with ../lan-upload/presign.py (offline SigV4, no deps). Creds come ONLY from the MinIO .env file
named by $S4_ENV_FILE (MINIO_ROOT_USER / MINIO_ROOT_PASSWORD / MINIO_BUCKET_NAME): never hardcoded,
never printed. Host from $MINIO_HOST (default in presign.py: 192.168.1.68:9000).
The output files contain short-lived presigned URLs: keep them out of git, delete them after the run.

  S4_ENV_FILE=/path/to/minio/.env python3 presign_desktop.py step-a [--name synth] [--expires 7200]
        -> <out>/create.json   (new key spike/s4-desktop/desktop-ai-<name>-<epochms>.<ext> + presigned POST ?uploads)
  ... presign_desktop.py step-b UPLOAD_ID [--parts 60] [--expires 7200]
        -> <out>/urls.json     (parts 1..N, list, complete, abort, head, get, resultsPut/resultsGet)
  ... presign_desktop.py probe KEY [KEY...]
        -> <out>/probe.json    (read-only HEAD/GET, 15 min, for the smoke CORS check)
  <out> = --out-dir, default $S4_HANDOFF_DIR or ./handoff
"""
import argparse, datetime, json, os, sys, time

if not os.environ.get("S4_ENV_FILE"):
    sys.exit("set S4_ENV_FILE to the MinIO .env path (creds are never hardcoded)")
sys.dont_write_bytecode = True  # no __pycache__ next to lan-upload/presign.py
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "lan-upload"))
import presign as P  # noqa: E402  (reads $S4_ENV_FILE / $MINIO_HOST at import)

PREFIX = "spike/s4-desktop/"

def iso_in(sec):
    return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=sec)).isoformat()

ap = argparse.ArgumentParser()
ap.add_argument("cmd", choices=["step-a", "step-b", "probe"])
ap.add_argument("args", nargs="*")
ap.add_argument("--expires", type=int, default=7200)
ap.add_argument("--parts", type=int, default=60)
ap.add_argument("--name", default="synth", help="key stem: desktop-ai-<name>-<epochms>.<ext>")
ap.add_argument("--ext", default="webm", help="object extension (recorder output container)")
ap.add_argument("--out-dir", default=os.environ.get("S4_HANDOFF_DIR", "handoff"))
a = ap.parse_args()

def write(name, obj):
    os.makedirs(a.out_dir, exist_ok=True)
    p = os.path.abspath(os.path.join(a.out_dir, name))
    with open(p, "w") as f:
        json.dump(obj, f, indent=1)
    os.chmod(p, 0o600)
    print(p)  # path only; URLs are never printed

if a.cmd == "step-a":
    key = f"{PREFIX}desktop-ai-{a.name}-{int(time.time() * 1000)}.{a.ext}"
    write("create.json", {"key": key, "bucket": P.BUCKET, "create": P.presign("POST", key, {"uploads": ""}, a.expires),
                          "expiresAt": iso_in(a.expires)})
    print("key:", key)
elif a.cmd == "step-b":
    if not a.args:
        sys.exit("step-b needs UPLOAD_ID")
    uid = a.args[0].strip()
    c = json.load(open(os.path.join(a.out_dir, "create.json")))
    key = c["key"]
    assert key.startswith(PREFIX) and "." in key.rsplit("/", 1)[-1], key
    rkey = key.rsplit(".", 1)[0] + ".results.json"   # must match server-nocreds.mjs resultsKey
    e = a.expires
    write("urls.json", {
        "key": key, "uploadId": uid, "bucket": P.BUCKET, "endpoint": f"http://{P.HOST}",
        "expiresAt": iso_in(e), "partsMax": a.parts,
        "parts": {str(i): P.presign("PUT", key, {"partNumber": str(i), "uploadId": uid}, e) for i in range(1, a.parts + 1)},
        "list": P.presign("GET", key, {"uploadId": uid}, e),
        "complete": P.presign("POST", key, {"uploadId": uid}, e),
        "abort": P.presign("DELETE", key, {"uploadId": uid}, e),
        "head": P.presign("HEAD", key, None, e),
        "get": P.presign("GET", key, None, e),
        "resultsKey": rkey,
        "resultsPut": P.presign("PUT", rkey, None, e),
        "resultsGet": P.presign("GET", rkey, None, e),
    })
    print("key:", key, "parts:", a.parts)
elif a.cmd == "probe":
    write("probe.json", {k: {"head": P.presign("HEAD", k, None, 900), "get": P.presign("GET", k, None, 900)} for k in a.args})
