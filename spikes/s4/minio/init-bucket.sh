#!/bin/sh
set -eu

: "${MINIO_ROOT_USER:?}"
: "${MINIO_ROOT_PASSWORD:?}"
: "${MINIO_BUCKET_NAME:?}"
: "${MINIO_INTERNAL_ENDPOINT:?}"
: "${MINIO_ABORT_INCOMPLETE_MPU_DAYS:?}"

echo "[minio-init] Waiting for MinIO at ${MINIO_INTERNAL_ENDPOINT}..."
until mc alias set local "${MINIO_INTERNAL_ENDPOINT}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" 2>/dev/null; do
  sleep 2
done

echo "[minio-init] Creating bucket ${MINIO_BUCKET_NAME} (if missing)..."
mc mb --ignore-existing "local/${MINIO_BUCKET_NAME}"

echo "[minio-init] Applying CORS (browser presigned PUT + ETag)..."
mc cors set "/config/cors.json" "local/${MINIO_BUCKET_NAME}"

echo "[minio-init] ILM: abort incomplete multipart uploads after ${MINIO_ABORT_INCOMPLETE_MPU_DAYS} days..."
mc ilm rule add --abort-incomplete-multipart-upload-days "${MINIO_ABORT_INCOMPLETE_MPU_DAYS}" \
  "local/${MINIO_BUCKET_NAME}" || true

echo "[minio-init] Done."
