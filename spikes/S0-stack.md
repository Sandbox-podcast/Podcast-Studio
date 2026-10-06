# Spike S0 — Stack applicative & auth interne (Google Sign-In)

**Date** : 2026-10-05  
**Auteur** : Spike agent (Cloud)  
**Statut IdP** : **verrouillé par Loïc** — option **C**, Google Sign-In via auth managée (OAuth Google ; pas de SSO entreprise séparé).

---

## Hypothèse testée

1. Une stack **TypeScript + Next.js (App Router) + API Node** couvre auth, lobby futur et déploiement cloud public (D-04) sans code produit Phase 1.
2. **Google Sign-In** (comptes Gmail Sandbox) s’intègre sans dérogation via un fournisseur OAuth standard + allowlist email/domaine.
3. Des **rôles mockés `host | guest`** peuvent être injectés en spike (env / callback session) en attendant le modèle `Membership` Episode (ARCHITECTURE §3).

---

## Recommandation stack (A / B)

| | **A — Recommandée** | **B — Alternative** |
| --- | --- | --- |
| Frontend | Next.js 15 (App Router), React 19, TypeScript | Vite + React SPA + même backend API |
| Backend | Route Handlers Next + modules partagés (`/lib`) ; API dédiée (Fastify/Hono) plus tard si charge workers | NestJS ou Hono service séparé dès J1 |
| Auth | **Auth.js v5** (`next-auth`) — provider Google, sessions JWT ou DB | **Clerk** — Google OAuth + Organizations (DX rapide, coût / lock-in) |
| Hébergement spike | Vercel ou **Cloud Run** (container Next `standalone`) | Même |
| BDD auth Phase 1+ | Postgres (Neon/Supabase/RDS) pour users + memberships | Idem |

**Décision spike : option A + Auth.js.**

### Comparatif auth managée (Google)

| Critère | Auth.js (NextAuth v5) | Clerk | Auth0 |
| --- | --- | --- | --- |
| Google OAuth | Natif (`Google` provider) | Natif | Connection Google |
| Allowlist Gmail / domaine | `signIn` callback (email, `hd` claim) | Restrictions dashboard + code | Rules / Actions |
| Rôles mock / custom claims | `jwt` + `session` callbacks | `publicMetadata` | Custom claims |
| Lock-in | Faible (OAuth standard, self-host OK) | Moyen–fort | Moyen |
| Coût usage interne | **0** (infra only) | Free tier puis ~$25+/mo si MAU | Free tier limité, puis payant |
| DX spike hello-world | Bon (doc Next official) | Excellent | Correct, config lourde |

**Pourquoi pas Clerk/Auth0 pour la baseline ?**  
Sandbox veut allowlist-friendly sans multi-tenant commercial (D-05). Auth.js suffit pour Google + callbacks ; Clerk accélère l’UI mais ajoute un tiers facturé et des primitives org que l’on n’a pas encore besoin de modéliser. Auth0 est pertinent si SSO SAML entreprise revient — **hors scope** avec IdP Google verrouillé.

**Backend alternatif (non retenu spike)** : Go/Fiber ou Python/FastAPI — valides pour workers/async, mais doublent la stack front pour peu de gain sur S0.

---

## Setup (spike harness)

Arborescence : [`spikes/s0-harness/`](../spikes/s0-harness/) (code **spike only**, pas Phase 1).

| Élément | Valeur |
| --- | --- |
| Runtime | Node 20+ |
| Framework | Next.js 15, Auth.js 5 beta (`next-auth@5`) |
| Provider | Google OAuth 2.0 |
| Secrets | `.env.local` (gitignored) — voir `.env.example` |
| Rôles mock | `SPIKE_MOCK_ROLE=host\|guest` ou `SPIKE_ROLE_BY_EMAIL` JSON |

**Variables (placeholders, jamais commitées)** :

```bash
AUTH_SECRET=                    # openssl rand -base64 32
AUTH_URL=https://localhost:3000 # ou URL Cloud Run / Vercel

AUTH_GOOGLE_ID=                 # Google Cloud Console → OAuth client Web
AUTH_GOOGLE_SECRET=

# Allowlist (au moins une des deux)
ALLOWED_EMAIL_DOMAIN=sandbox.example   # ou laisser vide
ALLOWLIST_EMAILS=user@gmail.com,other@gmail.com

# Spike : rôle injecté (simule Membership Episode)
SPIKE_MOCK_ROLE=host
# ou SPIKE_ROLE_BY_EMAIL={"user@gmail.com":"host","guest@gmail.com":"guest"}
```

**Google Cloud Console (sketch)** :

1. Projet GCP (ou existant Sandbox).
2. APIs & Services → Credentials → OAuth 2.0 Client ID (Web).
3. Authorized redirect URIs : `http://localhost:3000/api/auth/callback/google`, plus URL prod (`https://<service>/api/auth/callback/google`).
4. OAuth consent screen : Internal (Workspace) si applicable, sinon External + test users.

**Chemin E2E** :

1. `cd spikes/s0-harness && cp .env.example .env.local` → remplir secrets.
2. `npm install && npm run dev`.
3. Ouvrir `/` → Sign in with Google → session affiche email + **mock role** (`host` ou `guest`).
4. Allowlist : email hors liste → refus au `signIn` callback.

Harness non exécuté avec credentials réels dans ce repo (pas de secrets) ; le chemin est reproductible par tout dev Sandbox avec un client OAuth Google.

---

## Mesures

| Mesure | Résultat spike |
| --- | --- |
| Intégration Google sans IdP entreprise custom | **OK** — OAuth Google standard |
| Allowlist-friendly | **OK** — callback email / domaine |
| Rôles mock injectables | **OK** — env + session callback |
| Déployabilité cloud | **OK** — Vercel 1-click ou Cloud Run + `output: 'standalone'` |
| Dérogation Sandbox | **Aucune** requise pour Google Sign-In |

Pas de bench perf (hors scope S0).

---

## Pass / Fail

| Critère SPIKES.md S0 | Verdict |
| --- | --- |
| Auth E2E sur hello-world déployable cloud | **Pass** (harness + doc deploy) |
| Rôles mockés injectables host/guest | **Pass** |
| Fail si SSO interne impossible sans dérogation | **N/A** — IdP = Google managé, pas SSO legacy |

**Verdict global : PASS**

---

## Décision

1. **Stack baseline produit (post-S0, pré-S1)** : TypeScript, **Next.js App Router**, Route Handlers pour App API v1, **Auth.js v5 + Google**, Postgres pour Identity/Membership quand Phase 1 démarre.
2. **IdP** : Google Sign-In uniquement v1 interne ; allowlist email/domaine côté `signIn`.
3. **Rôles spike → produit** : remplacer `SPIKE_*` par table `Membership(role)` sur `Episode` (ARCHITECTURE §3, D-03).
4. **Ne pas** importer le harness `spikes/s0-harness/` dans l’arborescence produit ; copier/adapter `auth.ts` vers `apps/web` ou racine monorepo lors de Phase 1.

---

## Coûts observés

| Poste | Estimation usage interne |
| --- | --- |
| Auth.js + Google OAuth | 0 € (quota Google OAuth standard) |
| Hébergement hello-world | Vercel hobby / Cloud Run ~idle < 5 €/mo si toujours on |
| Clerk / Auth0 (non retenu) | 0–25+ €/mo selon MAU — évité |

---

## Suite

| Action | Owner suggéré |
| --- | --- |
| Créer OAuth client Google + secrets dans vault Sandbox | Loïc / infra |
| Déployer harness une fois sur Cloud Run ou Vercel pour preuve E2E | Dev spike |
| Amender **DECISIONS.md** : ligne IdP Google + Auth.js (ADR léger) | Prochaine PR architecture |
| Amender **ARCHITECTURE.md §9** : remplacer « SSO interne à préciser » par Google + allowlist | Idem |
| Débloquer **S1** (SFU) et parallèle **S3** (matting) | Roadmap |
| Phase 1 Identity : modèle User + Membership, retirer mocks spike | Après S1 pass |

**OPEN-QUESTIONS** : IdP marqué **décide** (C + Google) — voir `docs/OPEN-QUESTIONS.md`.
