# Questions ouvertes (à trancher en QCM, pas inventées)

Issues volontairement **non tranchées** dans l’architecture v0 — à résoudre pendant ou juste après les spikes.

## Auth / identité interne

Quel IdP / mécanisme pour les comptes Sandbox ?

- A — SSO entreprise existant (nommer le fournisseur)
- B — Magic link / email OTP
- C — Auth managée (Clerk, Auth0, Cognito…)
- D — Autre

## SFU (après S1)

Quel fournisseur retenir ?

- A — LiveKit Cloud
- B — Daily
- C — Autre (préciser)

## Object storage (après S4)

- A — Cloudflare R2
- B — AWS S3
- C — GCS (API S3 ou native)
- D — Autre

## Delivery managé (après S5)

- A — Mux
- B — Cloudflare Stream
- C — Plan B HLS depuis S3
- D — Autre

## Machines cibles matting (avant S3)

Quelle est la config **basse** à garantir (laptop type, OS, GPU) ?

→ Réponse libre / inventaire interne requis.

## Seuil de coût SFU / heure (S1)

Quel plafond acceptable pour une session interne 3 et 5 participants ?

→ À fixer explicitement ; ne pas déduire.
