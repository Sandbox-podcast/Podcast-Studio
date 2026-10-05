# Roadmap phasée — Podcast Studio

Décisions : [DECISIONS.md](./DECISIONS.md) · Archi : [ARCHITECTURE.md](./ARCHITECTURE.md) · Spikes : [SPIKES.md](./SPIKES.md)

Principe : **spikes avant features**. Peu de code produit tant que S1–S3 ne sont pas verts.

## Phase 0 — Fondations documentaires (en cours)

- [x] Vision produit
- [x] Décisions structurantes D-00…D-05
- [x] Architecture cible
- [ ] Spikes S0–S5 exécutés et rapportés
- [ ] ADR amendés si un spike invalide une hypothèse

**Exit** : spikes critiques go / no-go ; stack frontend + SFU + storage nommés.

## Phase 1 — Vertical slice « Room live » (code produit minimal)

Objectif : 3 utilisateurs internes rejoignent un épisode, se voient/entendent, se reconnectent, diagnostiquent le réseau.

Scope :

- Auth comptes + rôles basiques
- Create/join Episode + StudioSession
- WebRTC via SFU choisi
- Fallback audio-only (AC-STUDIO-004)
- Dashboard diagnostics (AC-RTC-002)
- Reconnexion sans fantôme (AC-STUDIO-003)

Hors scope : détourage, scène virtuelle, post-prod, publish.

**Exit** : AC-STUDIO-001…004 + AC-RTC-001…002 verts en conditions réalistes (Wi‑Fi dégradé simulé).

## Phase 2 — Capture masters

- Enregistrement local HQ par participant
- Upload chunké vers S3
- Manifest de session + intégrité
- Preuve AC-RTC-003 (perte réseau ≠ perte masters déjà capturés)

**Exit** : masters récupérables après session type 60–90 min, 3 pax.

## Phase 3 — Différenciateur studio virtuel

Dépend de spikes S2–S3 verts.

- Détourage client + fallback
- 1–2 layouts scène partagée
- Mode régie (compose program) si spike le valide
- Preview live « studio »

**Exit** : session interne filmable ; qualité acceptable sur machines cibles.

## Phase 4 — Delivery & bibliothèque

- Ingest masters → service managé
- Proxies / playback interne
- Bibliothèque d’assets par épisode

**Exit** : revoir une session depuis l’app sans télécharger les masters bruts.

## Phase 5 — Post-prod IA légère

- Transcription + timestamps
- Candidates de clips / moments clés
- Export packaging basique

**Exit** : un opérateur obtient un teaser utilisable en < N minutes après upload (N à fixer après mesure).

## Phase 6 — Publication (plus tard)

- 1 connecteur (ex. YouTube) pour usage interne
- Formats par destination

**Exit** : un épisode publié avec checklist droits / metadata.

## Jalons calendaires (indicatif, usage interne)

| Jalon | Contenu | Ordre de grandeur |
| --- | --- | --- |
| J0 | Docs + spikes S0–S5 | 1–3 semaines |
| J1 | Phase 1 live | 3–6 semaines post-spikes |
| J2 | Phase 2 masters | 2–4 semaines |
| J3 | Phase 3 studio virtuel | 4–8 semaines (risque élevé) |
| J4+ | Delivery / IA / publish | selon capacité |

Les durées sont des **ordres de grandeur** pour une petite équipe ; à recalibrer après S0–S3.

## Risques roadmap

| Risque | Mitigation |
| --- | --- |
| Studio virtuel trop cher CPU | Fallback vidéo brute ; layouts plus simples ; spike S3 go/no-go |
| Qualité audio multi-pax | Prioriser sync / AEC ; tests réels tôt |
| Coût SFU + storage | Mesurer dès Phase 1 ; quotas internes |
| Scope creep post-prod | Garder Phases 5–6 derrière un live stable |
