# S0 spike harness (not product)

Minimal **Next.js + Auth.js v5 + Google** hello-world for Spike S0.

## Run locally

```bash
cp .env.example .env.local
# Fill AUTH_* and Google OAuth client credentials (Google Cloud Console).
npm install
npm run dev
```

Open http://localhost:3000 — sign in with Google; the page shows your email and injected **mock role** (`host` | `guest`).

## Deploy sketch (no secrets in git)

### Vercel

1. Import repo subdirectory or root with root directory `spikes/s0-harness`.
2. Set environment variables from `.env.example` in the Vercel dashboard.
3. Add production URL to Google OAuth redirect URIs: `https://<app>/api/auth/callback/google`.

### Google Cloud Run

```bash
npm run build
docker build -t s0-harness .
# Push to Artifact Registry, deploy Cloud Run service with env vars from Secret Manager.
```

Use `output: 'standalone'` in `next.config.ts` (already set). Set `AUTH_URL` to the Cloud Run HTTPS URL.

## Scope

Do **not** extend this folder with studio/WebRTC — see Phase 1 after spikes S1+.

Report: [../S0-stack.md](../S0-stack.md).
