# Plan (prep) — Spikes S4 / S5 (pipeline média async)

> **Statut : WIP prep, spikes non exécutés.** Rapports finaux : [`S4-recording.md`](./S4-recording.md), [`S5-delivery.md`](./S5-delivery.md).

**Auteur** : Podcast Media  
**Date** : 2026-10-05  
**Lead** : Podcast Studio  
**Ancrage** : [SPIKES.md](../docs/SPIKES.md) S4–S5 · [DECISIONS.md](../docs/DECISIONS.md) **D-01** · [OPEN-QUESTIONS.md](../docs/OPEN-QUESTIONS.md)

## Périmètre

Préparer **S4** (enregistrement local HQ + upload S3-compatible) et **S5** (delivery managé / ABR), pour enchaîner **après ou en parallèle contrôlée** des spikes live (S1), **sans** démarrer le code Phase 1 produit, et **sans** provisionner d’infra prod tant que le lead n’a pas validé comptes spike et QCM coûts.

D-01 reste la contrainte : masters en object storage S3-compatible ; delivery / transcode / preview délégués à un service managé.

## Ordre proposé (aligné SPIKES)

```text
S1 (SFU) ──► S4 (recording + upload) ──► S5 (ingest + playback managé)
```

- **S4 dépend de S1** pour le contexte room / tracks ; le protocole recording peut être prototypé hors room, mais le pass multi-tracks vise une session SFU réelle.
- **S5 dépend de S4** (besoin d’un master représentatif).
- Ne pas bloquer S0 / S3 / S2 : ces spikes live/scène restent au lead et aux spécialistes RTC / Vision.
- **Pas de Phase 1** tant que S1 n’est pas pass (règle SPIKES existante).

## S4 — Critères & candidats storage

**But** : prouver AC-RTC-003 + chemin masters D-01.

| Élément | Contenu |
| --- | --- |
| Durée cible | 3–5 jours |
| Proto | Voir [S4-protocol-prep.md](./S4-protocol-prep.md) |
| Pass / Fail | [SPIKES S4](../docs/SPIKES.md) |
| Livrable exécuté | `S4-recording.md` + container/codec retenus |

**Candidats object storage** (OPEN-QUESTIONS, non tranché) : détail dans [S4-S5-candidates-prep.md](./S4-S5-candidates-prep.md).

Le spike doit mesurer : coût stockage Go (mesuré), PUT multipart, egress vers le service delivery testé, latence presign, DX SDK — à partir de grilles pricing **publiques**, sans plafonds inventés ici.

## S5 — Critères & candidats delivery

**But** : valider la jambe « managed » de D-01.

| Élément | Contenu |
| --- | --- |
| Durée cible | 2–4 jours |
| Proto | Ingest d’un master S4 → service candidat ; playback signé page interne ; coût + latence ingest pour **1 h** de media |
| Pass / Fail | [SPIKES S5](../docs/SPIKES.md) |
| Livrable exécuté | `S5-delivery.md` + choix service **documenté après spike** |

**Candidats** : Mux, Cloudflare Stream, plan B HLS — grille [S4-S5-candidates-prep.md](./S4-S5-candidates-prep.md).

## Préparation concrète (avant exécution spike)

1. Grille de comparaison candidats : DX, pricing public, egress, signed URLs, rétention, région EU.
2. Scénarios de charge **indicatifs** (à valider avec le lead, pas comme seuils figés).
3. Template de rapport : [SPIKES.md](../docs/SPIKES.md) (section template).
4. Liste des **décisions bloquantes** (matrice candidats + questions ci-dessous).
5. **Gate** : aucun bucket / compte prod ; comptes spike jetables ou sandbox seulement, après OK explicite.

## Questions ouvertes — coûts (à trancher, ne pas inventer)

Complètent OPEN-QUESTIONS.md ; réponses attendues de Loïc / lead **avant** de figer un prestataire. Hors scope de ce PR prep (owned by lead).

1. Volume interne estimé : sessions / mois, durée moyenne, participants enregistrés (audio seul vs A+V).
2. Rétention masters : jours / mois avant archive ou purge.
3. Plafond delivery : budget mensuel max acceptable pour ingest + proxies + lecture interne.
4. Plafond object storage : budget Go + egress mensuel max.
5. Seuil latence S5 : délai max entre fin d’upload master et preview interne jouable.
6. Préférence vendor : tout Cloudflare vs best-of-breed vs AWS-only.
7. Comptes spike : autorisation et identité Sandbox pour essais Mux / Cloudflare / AWS.

## Non-buts immédiats

- Code produit Phase 1 / 2.
- Provisionnement buckets ou pipelines **prod**.
- Choix définitif storage ou delivery **sans** mesures S4/S5.
- Publication multi-plateformes / montage IA (phases tardives roadmap).

## Prochaine action demandée au lead

Valider ce plan + répondre (même approximativement) aux questions coûts 1–7, puis autoriser le démarrage des **comptes spike** uniquement. Ensuite : exécution S4 dès que S1 donne un chemin tracks utilisable (ou proto recording standalone en parallèle si le lead le préfère).
