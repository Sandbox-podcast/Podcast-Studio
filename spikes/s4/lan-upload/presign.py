#!/usr/bin/env python3
"""Offline SigV4 query-string presigner for MinIO (path-style). No deps.
Creds read from the MinIO .env file named by $S4_ENV_FILE (MINIO_ROOT_USER / MINIO_ROOT_PASSWORD /
MINIO_BUCKET_NAME); never hardcoded, never printed. Host from $MINIO_HOST (default 192.168.1.68:9000).
Output URLs are short-lived signed URLs: keep them out of git and delete them after use.
Usage:
  presign.py create KEY...                       -> JSON {key: url}
  presign.py plan plan_in.json > urls.json       -> presign all ops for given uploads
"""
import datetime, hashlib, hmac, json, os, sys, urllib.parse

ENV = os.environ.get("S4_ENV_FILE", ".env")
HOST = os.environ.get("MINIO_HOST", "192.168.1.68:9000")
REGION = "us-east-1"
EXPIRES = 3600

def env():
    d = {}
    for l in open(ENV):
        l = l.strip()
        if l and not l.startswith("#") and "=" in l:
            k, v = l.split("=", 1); d[k] = v.strip().strip('"').strip("'")
    return d

E = env(); AK = E["MINIO_ROOT_USER"]; SK = E["MINIO_ROOT_PASSWORD"]; BUCKET = E.get("MINIO_BUCKET_NAME", "podcast-recordings-poc")

def q(s): return urllib.parse.quote(s, safe="-_.~")

def presign(method, key, params=None, expires=EXPIRES):
    now = datetime.datetime.now(datetime.timezone.utc)
    amz = now.strftime("%Y%m%dT%H%M%SZ"); day = now.strftime("%Y%m%d")
    scope = f"{day}/{REGION}/s3/aws4_request"
    p = dict(params or {})
    p.update({"X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": f"{AK}/{scope}",
              "X-Amz-Date": amz, "X-Amz-Expires": str(expires), "X-Amz-SignedHeaders": "host"})
    cq = "&".join(f"{q(k)}={q(v)}" for k, v in sorted(p.items()))
    path = "/" + BUCKET + "/" + urllib.parse.quote(key, safe="/-_.~")
    creq = "\n".join([method, path, cq, f"host:{HOST}\n", "host", "UNSIGNED-PAYLOAD"])
    sts = "\n".join(["AWS4-HMAC-SHA256", amz, scope, hashlib.sha256(creq.encode()).hexdigest()])
    k = ("AWS4" + SK).encode()
    for m in (day, REGION, "s3", "aws4_request"):
        k = hmac.new(k, m.encode(), hashlib.sha256).digest()
    sig = hmac.new(k, sts.encode(), hashlib.sha256).hexdigest()
    return f"http://{HOST}{path}?{cq}&X-Amz-Signature={sig}"

if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "create":
        print(json.dumps({k: presign("POST", k, {"uploads": ""}) for k in sys.argv[2:]}, indent=1))
    elif cmd == "plan":
        plan = json.load(open(sys.argv[2])); out = {}
        for name, u in plan.items():
            key, uid, n = u["key"], u["uploadId"], int(u["parts"])
            out[name] = {
                "key": key, "uploadId": uid,
                "parts": {str(i): presign("PUT", key, {"partNumber": str(i), "uploadId": uid}) for i in range(1, n + 1)},
                "list": presign("GET", key, {"uploadId": uid}),
                "complete": presign("POST", key, {"uploadId": uid}),
                "abort": presign("DELETE", key, {"uploadId": uid}),
                "head": presign("HEAD", key), "get": presign("GET", key), "delete": presign("DELETE", key),
            }
        print(json.dumps(out, indent=1))
