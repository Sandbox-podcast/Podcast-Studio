#!/bin/sh
# One-shot init for the S4 MinIO POC: bucket + verification of server-wide
# CORS and stale-multipart cleanup (no per-bucket CORS / ILM abort MPU; see compose env).
set -eu

: "${MINIO_ROOT_USER:?}"
: "${MINIO_ROOT_PASSWORD:?}"
: "${MINIO_BUCKET_NAME:?}"
: "${MINIO_INTERNAL_ENDPOINT:?}"

echo "[minio-init] Waiting for MinIO at ${MINIO_INTERNAL_ENDPOINT}..."
i=0
until mc alias set local "${MINIO_INTERNAL_ENDPOINT}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "[minio-init] ERROR: MinIO not reachable after 60s" >&2
    mc alias set local "${MINIO_INTERNAL_ENDPOINT}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" >&2 || true
    exit 1
  fi
  sleep 2
done

echo "[minio-init] Creating bucket ${MINIO_BUCKET_NAME} (if missing)..."
mc mb --ignore-existing "local/${MINIO_BUCKET_NAME}"

echo "[minio-init] Effective server API settings (env overrides win over stored values):"
mc admin config get local api | while IFS= read -r line; do
  case "$line" in
    "# MINIO_API_CORS_ALLOW_ORIGIN="*|"# MINIO_API_STALE_UPLOADS_"*) echo "  ${line#\# }" ;;
  esac
done

echo "[minio-init] Done."
