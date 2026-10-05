# Protocole (prep) — Spike S4 (enregistrement local HQ + upload S3-compatible)

> **Statut : WIP prep, spike non exécuté.** Livrable après lab : [`spikes/S4-recording.md`](./S4-recording.md).

**Standby** jusqu’au go post-S1 (SPIKES).  
**Auteur** : Podcast Media  
**Date** : 2026-10-05  
**Réfs** : [SPIKES S4](../docs/SPIKES.md) · [ARCHITECTURE](../docs/ARCHITECTURE.md) §4.3 & §6 · [D-01](../docs/DECISIONS.md) · AC-RTC-003 ([PRODUCT-VISION](../docs/PRODUCT-VISION.md))

## Hypothèse testée

Pendant le live, chaque client peut capturer des masters audio (+ vidéo) **localement** en haute qualité, survivre à une coupure réseau pendant l’upload, puis pousser des chunks multipart vers un bucket S3-compatible, sans perdre ce qui était déjà bufferisé (AC-RTC-003).

## Prérequis / dépendances

| Dépendance | Owner | Besoin pour S4 |
| --- | --- | --- |
| SFU choisi + room 3–5 pax | Podcast RTC (S1) | **Go** pour le pass multi-tracks en conditions réelles |
| Identité participant stable | S0 / App API | `user_id` + `session_id` pour nommage fichiers / reprise |
| Matting / scène | Podcast Vision (S3/S2) | **Non bloquant** pour S4 : masters = pistes caméra/micro brutes ou détourées selon ce qui est publié ; proto peut tourner sans matting |

## Setup spike

- Navigateurs : Chrome + 1 autre (Firefox ou Safari) sur ≥ 2 machines physiques.
- Durée capture cible : 30 min puis 60 min.
- Réseau : Wi‑Fi normal + simulation coupure (DevTools offline / `tc` / kill Wi‑Fi) 10–30 s **pendant** upload.
- Bucket : compte **spike / sandbox uniquement** (pas prod), API S3-compatible — **à provisionner seulement après OK lead** (voir [S4-S5-plan-prep.md](./S4-S5-plan-prep.md)).
- Artefacts : IndexedDB ou File System Access pour segments locaux ; logs console + taille fichiers + checksums.

## Protocole pas à pas

### A — Capture locale

1. `getUserMedia` audio (+ vidéo 720p et 1080p en passes séparées).
2. Branche A : **MediaRecorder** (webm/opus ou webm/vp9+opus selon support).
3. Branche B : **WebCodecs** (si dispo) → encode + mux manuel (ex. mp4/webm via lib légère) pour comparer stabilité longue durée.
4. Segmenter toutes les **N secondes** (ex. 10–30 s) : chaque segment a `index`, `started_at`, `sha256`, taille.
5. Persister segments sur disque local (File System Access préféré ; fallback IndexedDB blobs).
6. Pendant capture, simuler reload page une fois → vérifier reprise (nouvel append sans orphelin si possible).

### B — Manifest session

Écrire un manifest JSON local puis uploadé :

```json
{
  "session_id": "...",
  "participant_id": "...",
  "tracks": [
    {
      "kind": "audio|video",
      "codec": "...",
      "container": "...",
      "segments": [{ "index": 0, "key": "...", "sha256": "...", "duration_ms": 0 }]
    }
  ],
  "wallclock_start": "ISO-8601"
}
```

### C — Upload multipart présigné

1. App API (mock OK en spike) : `CreateMultipartUpload` + parts présignées.
2. Upload parts dès qu’un segment est clos (pipeline capture ∥ upload).
3. Pendant upload d’une part : **coupure 10–30 s** → reprendre la part (retry idempotent) sans re-capturer.
4. `CompleteMultipartUpload` ; vérifier objet final vs concat locale (durée, taille, checksum approximatif).
5. Tester 3 participants : 3 manifests + N objets ; noter sync approximative (offset wallclock).

### D — Recompose / validation

1. Télécharger masters ; lire durée (ffprobe ou équivalent).
2. Aligner sur `wallclock_start` ; mesurer dérive max entre pax.
3. Critère subjectif : pistes « écoutables / visionnables » sans corruption mid-file.

## Critères pass / fail (alignés [SPIKES S4](../docs/SPIKES.md))

À appliquer **lors de l’exécution** du spike (ce document ne constitue pas un rapport).

**Pass** : fichiers locaux intacts après coupure ; upload reprise / chunks ; masters lisibles post-session.  
**Fail** : perte silencieuse ou sync multi-pax irrécupérable.

## Mesures à collecter (table dans le rapport final)

| Mesure | Comment |
| --- | --- |
| Taille Go / heure A+V 720p et 1080p | par codec |
| CPU / RAM client pendant rec | Task Manager / performance.now sampling |
| Taux d’échec parts + retries | logs |
| Temps reprise post-coupure | chronomètre |
| Drift sync multi-pax | ms |
| Coût PUT / stockage observé | pricing public annoté × volume **mesuré** (pas de plafond inventé ici) |

## Hors scope S4

- Ingest Mux/Stream (→ S5)
- Egress SFU composite comme seul master
- IA / transcription
- Infra prod

## Décision attendue en sortie (après lab uniquement)

Container/codec retenus + recommandation API recording (MediaRecorder vs WebCodecs) + ADR amendé si besoin sur clé S3 / naming — documentées dans `S4-recording.md`, pas dans ce prep.
