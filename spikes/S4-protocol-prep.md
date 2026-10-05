# Protocole (prep) — Spike S4 (enregistrement local HQ + upload S3-compatible)

> **Statut : WIP prep, spike non exécuté.** Livrable après lab : [`spikes/S4-recording.md`](./S4-recording.md).

**Standby** jusqu’au go post-S1 (SPIKES).  
**Auteur** : Podcast Media  
**Date** : 2026-10-05 (MAJ MinIO POC Loïc)  
**Réfs** : [SPIKES S4](../docs/SPIKES.md) · [ARCHITECTURE](../docs/ARCHITECTURE.md) §4.3 & §6 · [D-01](../docs/DECISIONS.md) · AC-RTC-003 ([PRODUCT-VISION](../docs/PRODUCT-VISION.md))

## Stockage POC S4 (verrouillé — prep)

Décision Loïc (2026-10-05) : pour le **POC S4**, l’object storage est **MinIO self-hosted** sur le LAN Sandbox ($0, API S3-compatible → **D-01** reste valide). Hébergé sur le **même hôte** que le SFU **LiveKit OSS** (S1). **`MINIO_LAN_HOST` / IP : TBD** sur site.

- Compose + init bucket : [`spikes/s4/minio/`](./s4/minio/) (credentials via `.env` local, jamais commitées).
- Helper multipart lab : [`spikes/s4/multipart-proto/`](./s4/multipart-proto/) (Next.js 15 + AWS SDK v3, `forcePathStyle`).
- Candidats cloud R2/S3/GCS et delivery Mux/Stream : **après POC** — voir [`S4-S5-candidates-prep.md`](./S4-S5-candidates-prep.md).
- Images Docker : **décision ouverte** (fork `pgsty/minio` vs `pgsty/silo` vs autre) — voir [`s4/minio/README.md`](./s4/minio/README.md).

## Dev run 2026-10-05 (localhost — prep, pas le lab LAN)

Exécution locale Docker Compose sur une machine de dev (`127.0.0.1`, images `pgsty/minio` / `pgsty/mc` par défaut du compose). **Ne remplace pas** le spike S4 officiel ni les seuils pass/fail (**TODO** lab LAN).

| Test | Résultat | Notes (localhost, non throttlé sauf mention) |
| --- | --- | --- |
| Init `minio-init` | OK | Bucket créé ; CORS / stale MPU via env serveur (`MINIO_API_CORS_ALLOW_ORIGIN`, `MINIO_API_STALE_UPLOADS_EXPIRY=168h`, cleanup 6h) |
| Multipart 50 MiB, 7×8 MiB, presigned PUT | OK | ETag + sha256 local == distant |
| CORS navigateur | OK | Preflight OPTIONS 204 ; `Access-Control-Expose-Headers` inclut ETag |
| Reprise après kill client (part 4 en vol) | OK | ListParts 1–3 ; reprise parts 4–7 puis Complete |
| Abort MPU | OK | Upload absent après Abort |
| Flux API `multipart-proto` | OK | create → presign → list → complete ; abort testé via API |
| UI navigateur (`page.tsx`) | Non testé | — |

Timings loopback (ex. create+presign+7 PUT ~689 ms) : **indicatifs dev uniquement**, pas une mesure lab.

## Runbook MinIO LAN (prep — pas de mesures dans ce doc)

### 1. Bring-up

1. Sur l’hôte LAN (co-localisé LiveKit OSS), copier `spikes/s4/minio/.env.example` → `.env`.
2. Renseigner `MINIO_LAN_HOST`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_BIND_ADDR` (souvent `0.0.0.0` sur LAN), ports si besoin (défaut **9000** API / **9001** console — éviter conflit avec LiveKit **7880** / **7881**).
3. `docker compose up -d` dans `spikes/s4/minio/` ; vérifier logs `minio-init` (bucket + lignes CORS / stale uploads). Ajuster `MINIO_API_STALE_UPLOADS_EXPIRY` si la fenêtre de reprise pause-upload doit être différente (**TODO** lab).

### 2. Smoke test multipart (avant navigateur)

- **Option A** : `mc` depuis une machine du LAN (voir [`s4/minio/README.md`](./s4/minio/README.md)).
- **Option B** : lancer `multipart-proto` avec `S3_ENDPOINT=http://${MINIO_LAN_HOST}:${MINIO_API_PORT}`, upload fichier test via l’UI ou les routes API.

Critères smoke : objet présent dans le bucket ; multipart **Complete** OK ; en navigateur, réponse PUT expose **ETag** (CORS).

### 3. Test reprise après coupure réseau (procédure lab)

Seuils (durée coupure, taille parts, nombre de pax) : **TODO** — ne pas figer ici.

1. Démarrer capture locale + pipeline multipart (proto ou futur client S4).
2. Pendant l’upload d’une **part** en cours : couper le réseau (**TODO** : DevTools offline / Wi‑Fi / durée cible).
3. Vérifier segments **locaux** intacts (AC-RTC-003).
4. Rétablir le réseau ; appeler **ListParts** (API proto) ; reprendre uniquement les parts manquantes ; **Complete**.
5. Valider objet final (taille / durée **TODO** seuils dans `S4-recording.md`).

Bouton « simulate cut » du proto : raccourci dev uniquement — le test réel se fait sur le LAN avec coupure réelle.

## Hypothèse testée

Pendant le live, chaque client peut capturer des masters audio (+ vidéo) **localement** en haute qualité, survivre à une coupure réseau pendant l’upload, puis pousser des chunks multipart vers un bucket S3-compatible (**MinIO POC**), sans perdre ce qui était déjà bufferisé (AC-RTC-003).

## Prérequis / dépendances

| Dépendance | Owner | Besoin pour S4 |
| --- | --- | --- |
| SFU choisi + room 3–5 pax | Podcast RTC (S1) | **Go** pour le pass multi-tracks en conditions réelles |
| MinIO POC sur LAN | Podcast Media + ops LAN | Hôte partagé LiveKit OSS ; IP/host **TBD** |
| Identité participant stable | S0 / App API | `user_id` + `session_id` pour nommage fichiers / reprise |
| Matting / scène | Podcast Vision (S3/S2) | **Non bloquant** pour S4 : masters = pistes caméra/micro brutes ou détourées selon ce qui est publié ; proto peut tourner sans matting |

## Setup spike

- Navigateurs : Chrome + 1 autre (Firefox ou Safari) sur ≥ 2 machines physiques **du LAN Sandbox**.
- Durée capture cible : **TODO** lab (ex. 30 min puis 60 min — voir SPIKES).
- Réseau : Wi‑Fi LAN + simulation coupure **TODO** durée pendant upload.
- Bucket : `MINIO_BUCKET_NAME` sur MinIO POC (pas prod cloud).
- Artefacts : IndexedDB ou File System Access pour segments locaux ; logs console + taille fichiers + checksums.

## Protocole pas à pas

### A — Capture locale

1. `getUserMedia` audio (+ vidéo 720p et 1080p en passes séparées).
2. Branche A : **MediaRecorder** (webm/opus ou webm/vp9+opus selon support).
3. Branche B : **WebCodecs** (si dispo) → encode + mux manuel (ex. mp4/webm via lib légère) pour comparer stabilité longue durée.
4. Segmenter toutes les **N secondes** (**TODO** : ex. 10–30 s) : chaque segment a `index`, `started_at`, `sha256`, taille.
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

### C — Upload multipart présigné (MinIO POC)

1. App API : utiliser le helper lab [`multipart-proto`](./s4/multipart-proto/) ou équivalent produit — `CreateMultipartUpload` + parts présignées vers MinIO (`forcePathStyle`).
2. Upload parts dès qu’un segment est clos (pipeline capture ∥ upload).
3. Pendant upload d’une part : coupure réseau (**TODO** durée) → reprendre la part / parts suivantes (retry + **ListParts**) sans re-capturer.
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
| Temps reprise post-coupure | chronomètre (**TODO** seuil) |
| Drift sync multi-pax | ms (**TODO** seuil) |
| Coût POC MinIO | $0 infra LAN ; noter disque consommé (Go **mesurés**) |

## Hors scope S4

- Ingest Mux/Stream (→ S5)
- Egress SFU composite comme seul master
- IA / transcription
- Infra prod / choix cloud définitif (post-POC)

## Décision attendue en sortie (après lab uniquement)

Container/codec retenus + recommandation API recording (MediaRecorder vs WebCodecs) + ADR amendé si besoin sur clé objet / naming — documentées dans `S4-recording.md`, pas dans ce prep. Choix R2/S3/GCS **hors** verdict POC MinIO.
