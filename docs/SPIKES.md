# Spikes techniques — Podcast Studio

Objectif (D-00) : **valider ou invalider** les hypothèses avant le code produit.

Chaque spike a : but, durée cible, protocole, critères pass/fail, livrable.

Ne pas enchaîner le code Phase 1 tant que **S1** n’est pas pass.  
Ne pas engager Phase 3 tant que **S2 et S3** ne sont pas pass (ou explicitement no-go avec plan B).

---

## S0 — Stack applicative & auth interne

**But** : choisir frontend/backend/auth compatibles usage interne Sandbox.

**Durée** : 2–3 jours.

**À trancher (QCM attendu en sortie, pas inventé ici)** :

- Framework web (ex. Next.js vs autre)
- Auth (SSO entreprise vs email/magic vs IdP existant)

**Pass** :

- Auth de bout en bout sur un hello-world déployable cloud
- Rôles mockés injectables (host/guest)

**Fail** : impossibilité d’intégrer le SSO / IdP interne sans dérogation.

**Livrable** : note `spikes/S0-stack.md` + recommandation A/B.

---

## S1 — SFU cloud 5 participants + diagnostics

**But** : prouver AC-RTC-001 / AC-RTC-002 avec un SFU managé.

**Durée** : 3–5 jours.

**Candidats** : LiveKit Cloud, Daily, Agora (comparer coût + DX + recording egress).

**Protocole** :

1. Room 5 clients (navigateurs réels, ≥ 2 machines physiques).
2. Mesurer GPS / packet loss / bitrate via getStats + dashboard minimal.
3. Simuler bande passante limitée (Chrome throttling / tc).
4. Noter coût estimé /heure pour 3 et 5 pax 720p.

**Pass** :

- 5 pax audio+vidéo stables ≥ 20 min
- Métriques listées dans AC-RTC-002 exposées
- Coût horaire acceptable pour usage interne (seuil à fixer avec Loïc — **ne pas inventer**)

**Fail** : instabilité > 3 pax ou DX/recording incompatible avec local-first masters.

**Livrable** : `spikes/S1-sfu.md` + choix SFU verrouillé.

---

## S2 — Compose scène : distribué vs régie

**But** : trancher le mode de composition du studio virtuel (ARCHITECTURE §5.2).

**Durée** : 3–5 jours.

**Protocole** :

1. Prototype A : chaque client compose localement 3 avatars détourés (ou placeholders) selon un scene state WebSocket.
2. Prototype B : un client « operator » compose et republie une piste program.
3. Comparer sync visuelle, CPU, latence perçue, facilité d’enregistrement program.

**Pass** : un mode clairement supérieur pour 3 pax internes + chemin vers 5.

**Fail** : aucun mode acceptable → **plan B** : grille classique type visio + fond studio 2D simple, sans « plateau » composé.

**Livrable** : `spikes/S2-compose.md` + décision mode A/B/plan B.

---

## S3 — Détourage client temps réel

**But** : valider MediaPipe / WebGPU / WASM sur machines cibles.

**Durée** : 3–5 jours.

**Protocole** :

1. Caméra 720p et 1080p ; mesurer FPS matting + CPU/GPU.
2. Tester lumière difficile, cheveux, gestes rapides.
3. Publier la piste détourée via SFU (couplage S1).
4. Définir seuils de fallback automatique (ex. FPS < 20 → disable matting).

**Pass** :

- ≥ 24 FPS matting stables sur laptop « cible basse » défini
- Qualité subjectivement OK pour podcast (jury interne 3 personnes)
- Fallback explicite sans casser la session

**Fail** : machines cibles < 15 FPS → matting reporté / optionnel / serveur offline only.

**Livrable** : `spikes/S3-matting.md` + matrice device → qualité.

---

## S4 — Enregistrement local HQ + upload S3

**But** : prouver AC-RTC-003 et le chemin masters (D-01).

**Durée** : 3–5 jours.

**Protocole** :

1. MediaRecorder / WebCodecs : audio+vidéo locaux 30–60 min.
2. Coupure réseau 10–30 s en cours d’upload ; vérifier conservation locale.
3. Presigned multipart upload vers bucket S3-compatible.
4. Recomposer / valider durée et sync approximative multi-tracks.

**Pass** :

- Fichiers locaux intacts après coupure
- Upload reprise / chunks
- Masters lisibles post-session

**Fail** : perte silencieuse ou sync multi-pax irrécupérable.

**Livrable** : `spikes/S4-recording.md` + format container/codec retenus.

---

## S5 — Delivery managé (proxy / ABR)

**But** : valider la jambe « managed » du stockage hybride (D-01).

**Durée** : 2–4 jours.

**Candidats** : Mux, Cloudflare Stream (autres OK).

**Protocole** :

1. Ingest d’un master S4 vers le service.
2. Playback signé dans une page interne.
3. Coût et latence d’ingest pour 1 h de media.

**Pass** : preview interne < seuil latence convenu ; pricing OK pour volume interne estimé.

**Fail** : lock-in / pricing incompatible → playback direct depuis S3 (HLS self) en plan B.

**Livrable** : `spikes/S5-delivery.md` + choix service.

---

## Ordre d’exécution recommandé

```text
S0 (auth/stack) ─┬─► S1 (SFU) ─► S4 (recording/S3) ─► S5 (delivery)
                 │
                 └─► S3 (matting) ─► S2 (compose)   [peut paralleler S1 après S0]
```

Parallélisation max conseillée : **S1 ∥ S3** après S0 ; S2 après premiers résultats S3 ; S4 après S1.

---

## Template de rapport de spike

```markdown
# Spike Sx — titre
Date / auteur
Hypothèse testée
Setup (devices, réseau, versions)
Mesures (table)
Pass / Fail
Décision
Coûts observés
Suite (ADR à amender ? phase roadmap débloquée ?)
```
