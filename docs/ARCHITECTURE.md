# Architecture — Podcast Studio

Vision produit : voir [PRODUCT-VISION.md](./PRODUCT-VISION.md).  
Décisions : voir [DECISIONS.md](./DECISIONS.md).

## 1. Vue d’ensemble

Plateforme web de production de podcasts vidéo collaboratifs (usage interne).

```text
┌─────────────┐   WebRTC    ┌──────────────┐
│  Client A   │◄───────────►│              │
│ (capture +  │             │  SFU cloud   │
│  matting)   │   signaling │  (media)     │
└──────┬──────┘             └──────┬───────┘
       │ local HQ rec              │ optional program mix
       ▼                           ▼
┌─────────────┐             ┌──────────────┐
│  App API    │◄───────────►│  Object S3   │  masters (tracks)
│  (auth,     │   upload    │  compatible  │
│   sessions, │             └──────┬───────┘
│   assets)   │                    │ ingest
└──────┬──────┘             ┌──────▼───────┘
       │ jobs               │ Managed video │  delivery / ABR / preview
       ▼                    │ service       │
┌─────────────┐             └──────────────┘
│ Workers IA  │  transcription, clips, summaries
│ + transcode │
└─────────────┘
```

Principes :

1. **Deux chemins média distincts** — conversation live (faible latence) ≠ masters d’enregistrement (haute qualité).
2. **Client-first pour le live** — détourage et compose preview dans le navigateur ; le serveur n’est pas sur le chemin critique de la conversation.
3. **Serveur pour l’async** — upload, transcode, IA, packaging, publication.
4. **Modularité** — SFU, stockage, delivery et IA sont des adapters remplaçables.

## 2. Domaines et bounded contexts

| Domaine | Responsabilité | Stocke |
| --- | --- | --- |
| Identity | Comptes, sessions auth, invitations | users, credentials |
| Workspace | Épisodes, membres, rôles | episodes, memberships |
| Studio Live | Rooms, signaling, présence, diagnostics RTC | session state (éphémère + logs) |
| Capture | Enregistrement local HQ, sync upload | recording manifests |
| Media Library | Masters, versions, métadonnées assets | object keys + metadata |
| Post-Prod | Jobs IA, timeline assistée, clips | job queue + outputs |
| Delivery | Previews, ABR, URLs signées | managed service IDs |
| Publish | Connecteurs externes (plus tard) | publish jobs |

## 3. Modèle de données (cœur)

```text
User
  └── Membership (role: host | moderator | guest | operator)
        └── Episode
              └── StudioSession (status: lobby | live | ended)
                    ├── Participant (user_id, connection_id, rejoined_from?)
                    ├── RecordingTrack[] (local HQ files → S3 masters)
                    └── ProgramSnapshot? (layout / scene state timeline)
              └── Asset[] (masters, proxies, transcripts, clips)
              └── Job[] (transcode | transcript | highlight | publish)
```

Rôles (D-03) :

| Rôle | Live | Scène | Rec | Post |
| --- | --- | --- | --- | --- |
| host (animateur) | oui | control | start/stop | approve |
| moderator | oui | assist | start/stop | review |
| guest (invité) | oui | non | local auto | non |
| operator (régie) | optionnel AV | control | start/stop | non |

## 4. Studio live (WebRTC)

### 4.1 Topologie

- **SFU cloud** (recommandation de spike : LiveKit Cloud ou Daily ; alternative self-managed mediasoup **hors scope** v1).
- Mesh exclu : AC-RTC-001 exige ≥ 5 participants.
- Signaling via le SDK SFU ; présence / rôles via App API + room metadata.

### 4.2 Flux par participant

1. Auth → join Episode → create/join StudioSession.
2. `getUserMedia` → piste caméra/micro.
3. **Matting client** (si supporté) → piste vidéo détourée (canvas/WebGPU) publiée au SFU.
4. Fallback : vidéo brute si matting trop coûteux (CPU/GPU) — UX explicite.
5. Subscribe aux autres participants + éventuelle piste « program » (layout composé) si un opérateur la publie.

### 4.3 Enregistrement (critique AC-RTC-003)

Pattern **local-first dual track** :

- Pendant le live, chaque client enregistre **localement** audio (+ vidéo) en haute qualité (MediaRecorder / WebCodecs).
- Le flux WebRTC reste pour conversation / preview (peut se dégrader).
- En fin de session (ou par chunks), upload des masters vers **S3** (presigned URLs).
- Une dégradation réseau ne doit **pas** corrompre ce qui est déjà bufferisé localement.

Option phase ultérieure : egress SFU (composite program) en complément, jamais comme seul master.

### 4.4 Diagnostics (AC-RTC-002)

Dashboard technique (opérateur / host) exposant au minimum :

- bitrate, packet loss, jitter, RTT, résolution, FPS

Source : `getStats()` + events SFU.

### 4.5 Reconnexion (AC-STUDIO-003)

- Identité participant stable (`participant_id` lié à `user_id` + `session_id`).
- Rejoin ≤ fenêtre N secondes → même participant, pas de fantôme.
- Tracks locales : reprise d’enregistrement sans nouveau fichier « orphelin » si possible (append / segment indexé).

## 5. Studio virtuel & détourage

Objectif produit : personnes détourées dans une scène partagée (fond studio, couches, écrans).

### 5.1 Pipeline client (D-02)

```text
Camera → Segmentation (MediaPipe / WebGPU model)
       → Alpha composite on scene canvas
       → CaptureStream → WebRTC outbound track
```

Contraintes :

- Exécution **côté client** pour le live.
- Adaptation qualité (résolution, FPS matting) selon device.
- Scène : layouts prédéfinis (2-up, 3-up, guest focus) avant éditeur libre.

### 5.2 Qui compose le « program » ?

Deux modes à trancher au spike (voir SPIKES.md) :

| Mode | Description | Trade-off |
| --- | --- | --- |
| **A — Compose distribué** | Chaque client compose localement la même scène à partir des pistes + state partagé | Sync visuelle difficile ; pas de master program unique |
| **B — Compose opérateur** | Un client régie (ou worker léger) compose et publie une piste program | Plus simple pour recording program ; charge sur 1 machine |

**Hypothèse non verrouillée** : mode B pour le MVP technique (opérateur ou host = régie). À valider en spike S2.

## 6. Stockage & delivery (D-01)

| Couche | Rôle | Exemples à évaluer en spike |
| --- | --- | --- |
| Object S3-compatible | Masters, manifests, transcripts JSON, exports | Cloudflare R2, AWS S3, GCS S3 API |
| Managed video | Proxies, ABR HLS/DASH, thumbnails, signed playback | Mux, Cloudflare Stream |

Flux typique :

1. Upload master → S3 (`episodes/{id}/tracks/...`).
2. Job ingest → copie / notify managed service.
3. Delivery URLs pour preview UI et revue interne.
4. Masters restent source de vérité (ré-export, IA, archive).

## 7. Post-production & IA (async)

Workers cloud (queue) :

| Job | Entrée | Sortie |
| --- | --- | --- |
| ingest/proxy | master S3 | asset managed + proxy |
| transcribe | audio master | VTT / JSON timestamps |
| highlights | transcript + audio features | clip candidates |
| package | timeline + assets | export mezzanine |
| publish* | export | plateforme externe (*phase tardive) |

Pas d’IA sur le chemin live v1.

## 8. Frontend

Application web moderne (hypothèse technique à figer en spike S0) :

- SPA/SSR léger pour auth + lobby + studio.
- Studio : canvas scène, tiles participants, barre régie, panneau diagnostics.
- Post : bibliothèque assets + jobs (écrans séparés du live pour charge cognitive).

Stack candidate (non verrouillée) : TypeScript + React/Next + SFU SDK. Alternatives OK si le spike S0 le justifie.

## 9. Backend

| Composant | Rôle |
| --- | --- |
| App API | Auth, CRUD épisodes, memberships, session lifecycle, presign upload |
| Realtime control | Presence, scene state, layout commands (peut être SFU data channel + API) |
| Worker pool | Jobs média / IA |
| Observability | logs, metrics RTC agrégés, tracing jobs |

Auth : comptes email / SSO interne selon stack corporate Sandbox (à préciser — **pas inventé** ; voir questions ouvertes).

## 10. Sécurité & droits

- Accès studio : membership Episode + session token courte durée.
- Masters : buckets privés, URLs présignées, rétention interne.
- Pas de partage public non intentionnel des recordings.
- Rôles appliqués côté API **et** room grants SFU.

## 11. Non-objectifs v1 (architecture)

- Self-host SFU / GPU on-prem.
- Monetization / billing.
- Multi-org SaaS.
- Éditeur de montage frame-perfect type Premiere.
- Fond vert hardware (explicitement hors besoin).

## 12. Critères d’architecture « DONE »

Une couche est prête pour le code produit quand :

1. Les spikes liés sont **pass / fail** documentés.
2. Les AC concernés (studio / RTC) ont un plan de test automatisable.
3. Les coûts unitaires (SFU minutes, storage Go, job IA) sont estimés pour usage interne 3–5 pax.
