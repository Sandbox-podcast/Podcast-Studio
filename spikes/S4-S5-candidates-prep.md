# Grille candidats (prep) — storage (S4) & delivery (S5)

> **Statut : WIP prep, spike non exécuté.** Aucun prestataire sélectionné ; les choix se font **après** mesures S4/S5 et réponses [OPEN-QUESTIONS](../docs/OPEN-QUESTIONS.md) / QCM coûts (owner lead).

**Date** : 2026-10-05 · Podcast Media  
**Contrainte [D-01](../docs/DECISIONS.md)** : masters = object storage S3-compatible ; managed = proxies / ABR / preview seulement ([ARCHITECTURE](../docs/ARCHITECTURE.md) §6–7).

## POC S4 (verrouillé — hors grille cloud)

Décision Loïc (2026-10-05) : le **POC S4** utilise **MinIO self-hosted** sur le LAN Sandbox ([`s4/minio/`](./s4/minio/)) — $0, S3-compatible, même hôte que LiveKit OSS (IP/host **TBD**). Ce choix **ne remplace pas** la grille ci-dessous : R2/S3/GCS restent à comparer **après** le POC et les mesures lab.

## Object storage cloud (évaluation après mesures S4 / post-POC)

Comparatif **indicatif** pour le lab — pas de « winner » dans ce document.

| Critère | A — Cloudflare R2 | B — AWS S3 | C — GCS |
| --- | --- | --- | --- |
| API | S3-compatible | S3 natif | S3 interop ou native |
| Egress | À vérifier sur grille pricing courante | Facturé classique | Facturé classique |
| Multipart / presign | Oui (S3 API) | Oui | Oui (selon API) |
| Fit Stream / Mux | Cohérence possible écosystème CF ; Mux via URL pull/push | Neutre ; usage courant avec Mux | Neutre |
| DX spike | Bon si compte CF déjà dispo | IAM + régions à cadrer | Moins prioritaire sauf contrainte Sandbox |
| Risques | Lock-in écosystème CF | Coût egress vers delivery | Complexité dual API |
| À mesurer en S4 | PUT latency EU, multipart DX, coût Go **mesuré** | Idem + egress estimate | Seulement si demandé par le lead |

**Ordre de test en lab (hypothèse draft, révisable par le lead)** : commencer par les candidats pour lesquels un compte spike est autorisé ; comparer R2 et S3 si les deux sont disponibles ; GCS seulement si contrainte Sandbox explicite. **Aucune sélection avant chiffres.**

## Delivery managé (évaluation après S5)

| Critère | A — Mux | B — Cloudflare Stream | C — Plan B HLS self (S3) |
| --- | --- | --- | --- |
| Ingest depuis master S3 | Direct upload / URL | Upload / copy depuis bucket S3-compatible | ffmpeg + HLS files sur bucket |
| ABR + signed playback | Mature | Mature | À construire (CDN / signed URLs) |
| Latence ingest 1 h | À mesurer | À mesurer | Dépend worker |
| Pricing modèle | Minutes encodées + delivery (grille publique) | Minutes stockées / vues (vérifier grille) | Storage + compute self |
| Lock-in | Moyen-élevé | Moyen si stack CF | Faible, ops plus lourd |
| Pass S5 (SPIKES) | Preview signée interne | Preview signée interne | Si critères S5 non atteints avec A/B |

**Ordre de test en lab (hypothèse draft)** : comparer les candidats managés pour lesquels un essai est autorisé ; plan B HLS self **uniquement** si le spike S5 documente un fail selon [SPIKES S5](../docs/SPIKES.md). Pas de choix service dans ce prep.

## Matrice décision post-spikes (à remplir, ne pas inventer)

| Question | Owner | Statut |
| --- | --- | --- |
| Volume sessions / mois | Loïc | ouvert |
| Rétention masters | Loïc | ouvert |
| Plafond $ storage + delivery | Loïc | ouvert |
| Seuil latence preview S5 | Loïc + lead | ouvert |
| Préférence vendor (CF all-in vs mixte) | Loïc | ouvert |
| OK comptes spike | Loïc | ouvert |

## Lien S4 → S5

1. Master(s) S4 validés (checksum + durée).  
2. Job ingest unique vers **un candidat delivery testé** (sans présumer lequel sera retenu).  
3. Playback signé dans page interne minimale.  
4. Noter coût + latence pour **1 h** de media (mesures, pas d’estimation fictive).  
5. Livrable exécuté : [`spikes/S5-delivery.md`](./S5-delivery.md).
