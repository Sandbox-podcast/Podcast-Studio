# Spike S1 — SFU self-host (RTC serveur interne) + diagnostics

| | |
| --- | --- |
| **Date** | 2026-10-05 (pivot Loïc via lead) |
| **Auteur** | Podcast RTC |
| **Statut** | **LAB DEV LOCAL UP** + **LAN laptop host-local UP** (2026-10-05) — stack **LiveKit OSS (B)** |
| **Décision stack POC** | **B — LiveKit OSS self-host** (vote locked 2026-10-05, lead / Loïc) ; A/C/D non retenus |
| **D-04** | Override **POC uniquement** — voir [`S1-D04-POC-override.md`](S1-D04-POC-override.md) |
| **Plafond SFU €/h** | **N/A (POC self-host)** — Loïc via lead, 2026-10-05 ; plafond **cloud** reporté post-POC |
| **Verdict POC** | **DRAFT ready for review** — [`S1-verdict.md`](S1-verdict.md) |

> **Pivot Loïc (explicite)**  
> - **Stop** tout push cloud SFU SaaS : pas de clés / comptes / runs LiveKit Cloud, Daily, Agora.  
> - POC = **RTC serveur interne self-host** sur infra Sandbox (**LAN** et/ou **VPS EU**). Participants en **France**.  
> - **D-04** : le SFU cloud managé reste l’**hypothèse produit post-POC** ; override POC documenté, pas d’effacement de D-04.  
> - **Vote B** : lab via [`s1-lab/livekit-oss/`](s1-lab/livekit-oss/). **Q2** : **LAN Sandbox first** — hôte Loïc **LAPTOP-BI8P2KF3** @ **192.168.1.68** (Wi‑Fi, 2026-10-05) ; multi-device LAN + SSH **à suivre**.

---

## Hypothèse testée

Un **SFU LiveKit OSS self-hosté** sur infra Sandbox (**LAN** et/ou **VPS EU**) permet de :

1. Tenir **≥ 5 participants** A/V simultanés stables ≥ 20 min (AC-RTC-001), clients en **France**.
2. Exposer les métriques AC-RTC-002 (**bitrate, packet loss, jitter, RTT, résolution, FPS**) via `getStats()` navigateur + instrumentation serveur si besoin.
3. Rester compatible **local-first masters** (AC-RTC-003) : egress serveur = bonus, jamais seul master.
4. Garder le **trafic média sur infra Sandbox** (LAN ou VPS EU) — pas de minutes SFU SaaS en POC.

Coût POC : **plafond SFU €/h = N/A** pour self-host (lock Loïc) — poursuivre lab local multi-pax / getStats **sans gate budget €/h**. Observations VPS optionnelles plus tard ; **pas de pass/fail coût inventé**. Plafond **cloud** €/h = **hors scope POC** (à fixer si retour SFU managé post-POC / D-04).

---

## État des phases

| Phase | Contenu | Statut |
| --- | --- | --- |
| **PREP SaaS (archivé)** | Desk LiveKit Cloud / Daily / Agora | **Superseded** — POC SaaS abandonné ([annexe](#annexe--desk-saas-superseded)) |
| **PREP self-host** | Grille comparatif (historique) + QCM | Vote **B** |
| **LAB LiveKit OSS** | `docker compose` + harnais [`livekit-oss/`](s1-lab/livekit-oss/) | **DEV local UP** + **LAN laptop host-local UP** (`192.168.1.68`) ; multi-device LAN **à faire** |

**Interdit** : **SFU SaaS** (Cloud/Daily/Agora) ; code Phase 1 produit dans ce repo spike.

---

## Setup (LAB — à remplir pendant le lab)

*(Ne pas inventer de chiffres.)*

**Cible lab** : participants en **France** ; SFU sur **LAN Sandbox en priorité** (VPS EU en repli). **Dev local** : poste partagé (loopback). **LAN laptop Loïc** : **192.168.1.68** (host-local validé 2026-10-05) ; **multi-machine LAN** (pare-feu) pas encore validé.

| Champ | Valeur |
| --- | --- |
| Hôte SFU (LAN IP / VPS EU FQDN) | **dev box** : `127.0.0.1` · **LAN laptop** : `192.168.1.68` (`LAPTOP-BI8P2KF3`, Wi‑Fi) |
| Région / datacenter VPS | n/a (dev local) |
| TURN / STUN (coturn, LiveKit TURN, autre) | non testé (dev localhost) |
| Devices / OS clients | Poste dev partagé (« Grok Bot computer ») — smoke local |
| Navigateurs (versions) | |
| Nb machines physiques (≥ 2) | 1 (dev smoke) — **≥2 requis pour protocole 5 pax** |
| Réseau clients (fibre / Wi‑Fi / VPN) | localhost |
| Stack | **LiveKit OSS (B)** |
| Versions serveur + SDK client | `livekit/livekit-server:v1.8.4` ; `livekit-client` (harnais esm) |
| Ports hôte | TCP **7880**, **7881** ; UDP **50000–50200** (pas de conflit MinIO **9000/9001** sur même machine) |
| Room par défaut | `s1-lab` |
| Clés | Placeholders `.env.example` (non prod) |
| Smoke 2026-10-05 | Token mint + HTTP **200** LiveKit vérifiés |
| Répertoire sur la box | `/workspace/s1-livekit-oss` (équivalent [`s1-lab/livekit-oss/`](s1-lab/livekit-oss/)) |
| Date début / fin lab | début dev **2026-10-05** ; fin — |

### LAB LAN LAPTOP (Loïc — 2026-10-05, Europe/Paris)

Hôte verrouillé : **`LAPTOP-BI8P2KF3`**. Déploiement : `C:\Users\azero\s1-livekit-oss`.

| Item | Valeur |
| --- | --- |
| IPv4 LAN utilisée | **192.168.1.68** (Wi‑Fi) |
| Adresses ignorées | 169.254.x (APIPA), **192.168.56.1** (VirtualBox), **172.30.144.1** (WSL/Hyper-V) |
| LiveKit | Docker `livekit/livekit-server:v1.8.4` — TCP **7880/7881**, UDP **50000–50200** ; config **`rtc.node_ip: 192.168.1.68`** |
| MinIO (Media) | Déjà sur l’hôte **9000/9001** — LiveKit évite ces ports |
| Harnais | Conteneur Docker **`s1-harness`** (`node:20-bookworm`), écoute **0.0.0.0:5190** (npm hôte cassé sur la machine) |
| URLs | Harness `http://192.168.1.68:5190` · SFU `ws://192.168.1.68:7880` · room **`s1-lab`** |
| Smoke RTC | Harness HTTP **200** ; token mint → `ws://192.168.1.68:7880` + JWT ; LiveKit HTTP **200** ; log serveur **`nodeIP=192.168.1.68`** |
| Vision (même laptop, synth — pas de caméra) | **Publish PASS** `vision-s3-laptop` / track `vision-s3-synth` ; **pub+sub PASS** `vision-s3-pub` → `vision-s3-sub`, track reçu, **22 frames**, `connection_quality=2` |
| Inventaire | **MID** (i7 + RTX3070) — **pas** un pass LOW-END i5 |
| MediaPipe / FPS | **Reporté** jusqu’à caméra réelle |
| Pare-feu | Chemin **host-local** : pas besoin d’ouvrir le pare-feu Windows (profil Private). **Multi-appareils LAN** : règles Private — TCP **7880/7881/5190** + UDP **50000–50200** (+ Media TCP **9000/9001** MinIO noté) |
| CORS harnais | DEV : `localhost` + **`192.168.x.x`** — [`server.mjs`](s1-lab/livekit-oss/server.mjs) |

#### Edge `vision-s3` → harness subscribe getStats (laptop loopback, room `s1-lab`)

##### Take 1 (2026-10-05 ~23:05 Europe/Paris)

| Item | Valeur |
| --- | --- |
| Publisher | **`vision-s3`** — Loïc a confirmé publish LiveKit sur harness Vision Edge **:8088** |
| Côté serveur (publish) | **audio/opus** + **video/VP8 1280×720** simulcast LOW/MED/HIGH |
| Subscriber | Harnais **`mode=none`**, identité **`rtc-sub-getstats`**, Playwright → `http://127.0.0.1:5190` (depuis Docker **`host.docker.internal`**) |
| Join | Connecté subscribe-only **~2046 ms** |
| Échantillons | **9** sur **~25 s** (table AC-RTC-002 harnais) |
| Inbound getStats | Audio **~1 kbps**, loss **0 %**, RTT **~2 ms** ; vidéo **0 bps**, loss **0 %**, RTT **~2 ms**, **320×180** (dynacast LOW), fps **—** |
| Verdict doc | **Connectivité PASS** ; vidéo active **NOT VALIDATED** — cause racine Take 2 : **onglet Edge en arrière-plan** (pause `rAF` / `captureStream`) |

##### Take 2 (2026-10-05 23:29–23:36 Europe/Paris, Edge tab foreground, matted canvas publish `vision-s3`, room `s1-lab`, laptop loopback)

| Item | Valeur |
| --- | --- |
| Publisher | Edge **au premier plan** ; publish matted canvas **`vision-s3`** |
| Subscriber | Headless Chromium, harnais **`mode=none`** (getStats) |
| Join | **1872 ms** |
| Échantillons | **140** (intervalle **3 s**) ; **0** erreurs console ; seuls les **derniers échantillons par piste** conservés — continuité pleine minute **non** prouvée par RTC (enregistrements côté Media) |
| Inbound getStats | Vidéo **121–178 kbps**, **20 fps**, **320×180** (dynacast LOW), loss **0 %**, RTT **2–3 ms** ; audio **~1 kbps** |
| Verdict doc | **Vidéo cam/matted active via SFU = PASS** (foreground) ; couche **HD** simulcast et **LAN/WAN** toujours **NOT VALIDATED** |

*(Les mesures multi-pax **loopback** du poste dev restent dans [§ Mesures](#mesures-lab) — couche de validation distincte.)*

---

## Comparatif principal — self-host POC

Comparaison **historique** (pré-vote). **POC retenu : colonne LiveKit OSS (B).**

| Critère | **mediasoup** (self-host) | **LiveKit OSS** (self-host) | **DIY WebRTC** (note) |
| --- | --- | --- | --- |
| **DX Node/TS** | Bibliothèque C++/Node ; API rooms/producers/consumers ; courbe d’apprentissage | Stack LiveKit complète ; `livekit-server` + `livekit-client` ; similaire au modèle cloud mais ops à nous | Signalisation + SFU maison — **risque élevé**, effort important |
| **Déploiement VPS/LAN** | Process Node + workers ; Docker communautaire ; config ports UDP/TCP | Binaire/docker `livekit-server` ; config YAML ; Redis optionnel selon topo | À concevoir entièrement |
| **TURN / ICE** | Besoin **coturn** (ou équivalent) pour clients derrière NAT ; à documenter en lab | TURN intégré / documenté côté OSS ; même besoin réseau | Idem, sans guide produit |
| **CPU / bande passante 5×720p** | Charge SFU sur CPU (simulcast/SVC selon config) ; dimensionner VPS — **à mesurer** | Idem ; dépend config room et codecs | Imprévisible |
| **Diagnostics AC-RTC-002** | `getStats()` WebRTC côté client ; stats mediasoup côté serveur (à brancher UI lab) | `getStats()` + events LiveKit ; proche harnais client existant (archivé SaaS) | Variable |
| **Recording / egress vs local-first** | Pas d’egress managé ; enregistrement **client** (S4) ; egress serveur = bonus optionnel | Egress OSS possible (composite/track) — traiter comme **bonus**, pas master unique | Dépend implémentation |
| **Charge ops** | Nous : patch, scale, monitoring, certifs TLS, TURN | Nous : idem + config LiveKit ; docs OSS | Maximale |
| **Licence** | ISC (mediasoup) | Apache 2.0 (serveur OSS) | N/A |
| **Données EU** | Trafic sur **notre** VPS EU / LAN — pas de tiers SFU SaaS en POC | Idem | Idem |
| **Coût POC** | **EST.** coût **VPS €/h** + bande passante (pas de minutes SaaS) — chiffres **non inventés** ici | Idem | Idem |
| **Risques** | Expertise SFU ; NAT/TURN mal configuré | Complexité déploiement ; dérive vs Cloud si on confond POC et prod | **Hors défaut** — seulement si vote **C** |

**Option DIY** : ligne fine uniquement — à n’envisager que si le salon coche **C** ; sinon hors chemin par défaut.

---

## Protocole de lab — LiveKit OSS uniquement

> Harnais : [`s1-lab/livekit-oss/README.md`](s1-lab/livekit-oss/README.md). **LAN laptop** : **192.168.1.68** (host-local OK) — **multi-device LAN** + pare-feu + **≥2 machines** encore à exécuter.

### Jour 1 — Déploiement minimal

- [ ] `docker compose up` sur hôte **LAN Sandbox** (IP fournie par Loïc)
- [ ] `.env` : `LIVEKIT_URL` pointe vers `ws://<host>:7880` (host fourni par lead)
- [ ] `npm run dev` harnais ; 2 navigateurs join (2 machines si possible)
- [ ] Publier cam/mic 720p ; subscribe croisé
- [ ] Tableau AC-RTC-002 (`getStats()`)

### Jour 2 — 3 pax + diag

- [ ] 3 pax (France) ≥ 20 min stable
- [ ] RTT baseline vers hôte SFU
- [ ] Noter versions `livekit-server` + `livekit-client`

### Jour 3 — 5 pax + dégradation

- [ ] 5 clients, ≥ 2 machines, **France**
- [ ] Session ≥ 20 min (AC-RTC-001)
- [ ] Chrome throttling ; option `tc`
- [ ] Masters locaux intacts (smoke AC-RTC-003)

### Jour 4 — TURN / egress (optionnel)

- [ ] Documenter TURN si requis (clients FR NAT)
- [ ] Egress OSS composite/track → fichier test ; egress ≠ master unique
- [ ] CPU / bande passante observée (pas de chiffres inventés)

### Jour 5 — Synthèse

- [ ] Remplir grilles mesures
- [ ] Documenter TURN si requis une fois IP LAN connue

---

## Mesures (LAB)

### Multi-pax local smoke — PASS connectivité (re-run post-`pickRtpReport`, 2026-10-05 18:40:56–18:41:51 Europe/Paris)

Script : [`s1-lab/livekit-oss/scripts/multi-pax-smoke.mjs`](s1-lab/livekit-oss/scripts/multi-pax-smoke.mjs) · artefacts : `multi-pax-results.md` / `.json`.

| Fait mesuré | Valeur |
| --- | --- |
| Hôte | **localhost** (`127.0.0.1`) — dev box, pas LAN Sandbox |
| Room | `s1-lab` (clean — **4** remotes script / client) |
| Clients script | **5/5** connectés (mode **canvas**, ~**1,4–1,5 s** join) |
| Durée hold | **50 s** (pas 20 min AC-RTC-001) |
| Verdict doc | **PASS** critères **connectivité** uniquement (pas de seuils perf inventés) |

**Outbound video `getStats` (harnais, n=48)** : bitrate **73 / 115 / 2410** kbps min/med/max — fix **`pickRtpReport`** validé (plus bloqué à 0 bps).

**Inbound video `getStats` (agrégat, 200 lignes)** : bitrate **73 / 112 / 164** kbps min/med/max ; loss **0 %** ; jitter **0 / 0 / 9** ms ; FPS **14 / 15 / 16** ; résolution **320×180**.

**RTT** (harnais, ICE loopback) : **0–3 ms** — localhost uniquement, pas WAN France.

**Caveats** : vidéo **canvas synthétique ~15 fps**, **pas d’audio** ; **une** machine, Chrome headless ; **pas** LAN / **pas** 5 vraies caméras.

### Stabilité

| Run | Stack | Hôte (LAN/VPS EU) | Pax | Durée | A/V OK ? | Décos | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| multi-pax-smoke 2026-10-05 (re-run 18:40) | LiveKit OSS | localhost dev | 5 script | 50 s | connectivité OK | 0 | voir ci-dessus ; AC-RTC-001 20 min **non** exécuté |
| | | | | | | | |

### Diagnostics AC-RTC-002

| Stack | Pax | Bitrate ↓/↑ | Packet loss % | Jitter | RTT | Résolution | FPS | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LiveKit OSS | 5 local smoke | ↓ 73–164 / ↑ 73–2410 kbps (in/out vid.) | 0 % (in) | 0–9 ms (in) | 0–3 ms loopback | 320×180 (in) | ~15 (in/out) | harness `getStats` + script |
| | | | | | | | | |

### Dégradation réseau

| Condition | Stack | Effet live | Masters locaux intacts ? | Notes |
| --- | --- | --- | --- | --- |
| Throttle Chrome | | | | |
| tc / loss simulé | | | | |

### Coût infra (EST. / observé — VPS uniquement)

| Stack | VPS spec | €/h EST. | € observés session | Notes |
| --- | --- | --- | --- | --- |
| | | | | |

---

## Pass / Fail

**Verdict consolidé (draft)** : [`S1-verdict.md`](S1-verdict.md) — **connectivity POC PASS** ; prod / WAN / LAN / 20 min / real A/V **INCOMPLETE ou NOT VALIDATED** ; coût **N/A**.

### Pass (techniques uniquement)

- [ ] 5 pax A/V stables ≥ 20 min (AC-RTC-001)
- [x] AC-RTC-002 exposé (6 métriques) — **harnais local** ; WAN **non**
- [ ] Compatible local-first (egress serveur = bonus) — **non testé** en lab S1

### Fail

- [ ] Instabilité > 3 pax non résolue
- [ ] Incompatible local-first

### Coût / plafond SFU €/h

| Périmètre | Décision (Loïc via lead, **2026-10-05**) |
| --- | --- |
| **POC self-host (S1 lab)** | Plafond SFU **€/h = N/A** — **aucun pass/fail coût** ; ne pas bloquer multi-pax / AC-RTC-002 sur un seuil €/h |
| **Cloud managé (post-POC)** | Plafond €/h **reporté** — à traiter si / quand hypothèse D-04 cloud est réévaluée |
| **Mesures** | Tableaux coût infra : **vides** tant qu’aucun chiffre observé (ne pas inventer) |

---

## Décision

- **Stack POC (locked)** : **B — LiveKit OSS self-host** (2026-10-05, lead / Loïc).
- **Non retenus POC** : A mediasoup, C DIY, D cloud managé (hors POC actuel ; OK Loïc explicite pour SaaS).
- **Infra** : **LAN Sandbox first** — laptop **`192.168.1.68`** (2026-10-05) ; VPS EU si besoin plus tard.
- **D-04 produit** : cloud public managé = hypothèse **post-POC** ; override POC = [`S1-D04-POC-override.md`](S1-D04-POC-override.md).

---

## Blockers

| ID | Blocker | Owner | Statut |
| --- | --- | --- | --- |
| B1 | Vote stack POC | — | **Fermé** — **B LiveKit OSS** |
| B2 | **LAN multi-device** + pare-feu + lab **multi-pax France** (≥2 machines) | Loïc | **Partiel** — hôte **192.168.1.68** host-local **PASS** ; peers LAN + SSH **ouverts** |
| B3 | Go formel post-S0 ([PR #5](https://github.com/Sandbox-podcast/Podcast-Studio/pull/5)) pour enchaînement produit | Lead | Ouvert (parallèle prep OK) |
| B4 | ~~SFU SaaS free tier~~ | — | **Annulé** — SaaS stop per Loïc |
| B5 | Plafond **€/h** SFU (gate lab) | Loïc | **Fermé** — **N/A POC self-host** ; cloud €/h plus tard |

---

## Plan phasé

```text
┌─────────────────────────────────────────────────────────────┐
│ PIVOT (actuel)                                              │
│  ✓ Stop SaaS SFU (pas de clés / runs cloud)                 │
│  ✓ Doc self-host + D-04 override POC only                   │
│  ✓ Vote B — LiveKit OSS                                     │
└───────────────────────────┬─────────────────────────────────┘
                            │ LAB GO (LAN first; IP TBD)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ LAB LiveKit OSS (livekit-oss/, participants FR)             │
│  5 pax · ≥20 min · throttling · grilles mesures             │
└───────────────────────────┬─────────────────────────────────┘
                            │ post-POC produit (hors ce spike)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Produit : hypothèse D-04 cloud public sauf nouvel OK Loïc   │
└─────────────────────────────────────────────────────────────┘
```

---

## Suite

| Étape | Action |
| --- | --- |
| Maintenant | Lead + salon : QCM self-host ; ping avec PR #3 |
| Après vote | Déployer stack choisie sur VPS/LAN ; exécuter protocole lab |
| Post-POC | ADR / D-04 : cloud managé reste hypothèse produit sauf amendement Loïc |

---



---

## Take 2 correction + Take 4 (2026-10-06, Europe/Paris) — WIP

### Take 2 correction (Media RUN2)

Media remux of take 2 **matted** WebM showed **S3 synthetic smoke** (“no camera”), not MediaPipe detourage. The LiveKit publish measured in Take 2 getStats was therefore the **same smoke canvas**.

| Claim | Corrected |
| --- | --- |
| SFU forwards video (bitrate/fps > 0, loss ~0, loopback) | **PASS** (transport) |
| Content = real matted camera | **NOT VALIDATED** (smoke) |

### Take 4 — matted content through SFU

| Item | Value |
| --- | --- |
| When | ~**00:47** Paris · harness `?v=s4-matfix7` · Edge foreground · publisher **`vision-s3`** · room **`s1-lab`** |
| Subscriber | **`rtc-sub-take4`** · harness `mode=none` · join **1589 ms** · **594** samples @ 3 s · JSON written **01:13:41** |
| Screenshots | `sub-shot-66..116` (**00:47:00–00:49:32**) — matted silhouette on dark green (live, not freeze-frame) |
| Active numeric window | **00:46:53–00:48:28**: video **94 / 155 / 196** kbps · fps **12 / 14 / 20** · **320×180** LOW · **0** zero-kbps · loss **0 %** · RTT **~3 ms** |
| Audio (last_rows) | inbound audio track **~2 kbps**, loss **0 %** (series is video-only) |
| After 00:48:31 | table bitrate often dash — kbps **NOT VALIDATED** from table; screenshots still change until 00:49:32 |
| Verdict | **content PASS** through SFU on **loopback**, **LOW** layer only · **HD** **NOT VALIDATED** on this sub |

Artifacts: laptop `C:\Users\azero\s1-livekit-oss\scripts\cam-sub-getstats.json`, `take4-window-stats-refined.json`; box `/workspace/s1-soak/`.

### Overnight soak 30 min — FINAL (loopback)

| Item | Value |
| --- | --- |
| Window | **2026-10-06T01:14:11 → 01:44:34** Paris (HOLD 1800 s) |
| Room | **`s1-soak`** (isolated from `vision-s3`) |
| Load | **5** file pubs + **1** sub · sample **10 s** · all joins OK (1.6–3.5 s) |
| Source | take4 raw → Y4M/WAV; harness **`file`** CaptureStream (gum blocked on non-secure `host.docker.internal`) |
| Subscriber inbound | video samples **880** · res seen: 160×90 … **1280×720** · HD samples **3** (fps **8**) · mid **106** · low **595** · packetsLost last **0** |
| **HD verdict** | **NOT VALIDATED** — **environment limit**, not product FAIL: 5 publish+subscribe on **one** laptop; LiveKit container CPU med **~25.3%** (min 1.8 / max 35.4, n=31) |
| Connectivity | **PASS** 6/6 for full 30 min |
| Caveat | **Single-machine loopback** — not LAN/WAN |

#### Publisher outbound `qualityLimitationReason` (verbatim)

**Capture limits (honest):**

- `qualityLimitationDurations` → **NOT CAPTURED** (`soak-5pax-hd.mjs` never read that field).
- Full 30 min per-sample per-rid raw series → **NOT CAPTURED** (only `samples-tail` last **5** samples/actor + final `publishers_outbound_last` snapshot).
- CSV `out_qlr` / `out_res` / `out_fps` = **one “best” outbound row per publisher sample** (not full simulcast rid set).

**CSV distribution (publisher rows, n=880 `out_qlr` non-empty):**

| reason | count |
| --- | --- |
| **cpu** | **487** |
| **none** | **362** |
| **bandwidth** | **31** |

**samples-tail** (t_s 1771–1811 only, last ~40 s): qlr **cpu 45 / none 30** (stable 9 cpu + 6 none per tick across 5 pubs × 3 layers).

**Last snapshot per rid (sent dims/fps when present):**

| pub | rid q | rid h | rid f | qlr |
| --- | --- | --- | --- | --- |
| soak-pub-1 | 240×135 @18 | 480×270 @18 | 960×540 @21 | all **cpu** |
| soak-pub-2 | 160×90 @30 | 320×180 @30 | (wh/fps null, bytes>0) | all **cpu** |
| soak-pub-3 | 160×90 @30 | 320×180 @30 | (wh/fps null) | all **cpu** |
| soak-pub-4 | 320×180 @20 active | inactive | inactive | **none** |
| soak-pub-5 | 320×180 @21 active | inactive | inactive | **none** |

**Per-rid from samples-tail only** (min/med/max):

| rid | width | height | fps | qlr mix |
| --- | --- | --- | --- | --- |
| q | 160 / 240 / 320 | 90 / 135 / 180 | 16 / 21 / 31 | cpu 15 / none 10 |
| h | 320 / 320 / 480 | 180 / 180 / 270 | 17 / 30 / 31 | cpu 15 / none 10 |
| f | 960 / 960 / 960 (n=5 with dims) | 540 / 540 / 540 | 21 / 25 / 30 | cpu 15 / none 10 |

CSV “best layer” when labeled **1280×720**: n=11, fps **6 / 9 / 21**, qlr mostly **none** (10) + bandwidth (1) — rare; top sustained pub encode in tail was **960×540** under **cpu** limit.

**Lead implication:** because QLR is dominated by **`cpu`**, real HD validation moves to a **multi-machine LAN** test after Loïc’s firewall OK — not another single-host soak (Vision holds the 3070).

Artifact: laptop `scripts/soak-20261006-011411/QLR-ANALYSIS.json` · box `/workspace/s1-soak/docs/QLR-ANALYSIS.json`.

### Audio speech soak 5 min — FINAL (take4 WAV)

| Item | Value |
| --- | --- |
| Window | **01:45:08 → 01:50:19** Paris · room **`s1-soak-audio`** · **3** pubs + 1 sub |
| Audio source | `/media/take4-20s.wav` (from take4 raw Opus) via harness file audio `captureStream`; Chrome `--use-file-for-fake-audio-capture` also set (unused for file mode) |
| Inbound audio | **177** samples · **3** SSRCs · loss **0%** · jitter **2–13 ms** (med **6**) · audioLevel med **0.066** max **1.0** · totalAudioEnergy **0.13 → 7.35** (grew) · concealedSamples last **1440** / events **1** |
| Bitrate kbps | **NOT VALIDATED** (NaN delta bug) — tracked in [#7](https://github.com/Sandbox-podcast/Podcast-Studio/issues/7) — do not invent / do not fix yet |
| Speech verdict | **PASS** (energy + audioLevel proof of real speech on all 3 remotes) |
| Video note (same run) | HD **23** samples, fps **14/22/30** — better than 5-pax 30 min |


### Laptop A/B ± HQ rec — protocol (instrumentation ready, **NOT RUN**)

> Tracked in [#9](https://github.com/Sandbox-podcast/Podcast-Studio/issues/9). **Measurement only — no product decision.** Do **not** run while Vision holds the 3070 (wrapper refuses without `-VisionFreeConfirmed`; runner refuses without `AB_GO=1`).

| Item | Setup |
| --- | --- |
| Topology | Laptop only: **1** publisher (Edge, `http://localhost:5190/ab/index.html` = secure context) + **2** subscribers in a **separate** Edge instance (`ab-sub-hi` pinned HIGH, `ab-sub-lo` pinned LOW, `adaptive=0`) |
| Sources | pass 1 **real camera** (`getUserMedia` 720p) · pass 2 **take4 raw** file loop (`/media/take4-raw.webm` + take4 WAV) as reference |
| Simulcast | `?layers=3` → `[h180, h360]` + source (rids q/h/f; = livekit-client 720p default) · `?layers=2` → `[h180]` + source (rids **q/h**, `h` = top) |
| HQ rec | **Media's `S4Recorder`** in the **publisher tab** on the **same published MediaStream** (`window.__publishedStream`): ON = `startSession({stream, label:'raw', participant:<cond>, apiBase:'http://127.0.0.1:3320', durationSec:120, timeslice:1000, vBitrate:2500000})`, end = `stopAll()` + `exportResults()`; OFF = never call `startSession`. Preflight `GET :3320/api/health`; on failure the ON conditions are **SKIPPED** and reported — Media's process is never restarted |
| Matrix (default 5, lead order) | `ab-file-3L-off` → `ab-file-3L-on` → `ab-file-2L-off` → `ab-file-2L-on` → `ab-cam-3L-on` (`CONDS=full8` for all 8) · warmup **20 s** · window **120 s** (= rec window) · sample **2 s** · ~**3 min**/cond |
| Received-track rec | `ab-sub-hi` (HD-pinned) records the **received** video track with MediaRecorder (VP8 2.5 Mbps, 1 s timeslice) over the same 120 s window → `<cond>-sub-hi-rx.webm` (Playwright download) → copy to box → `python3 /workspace/podcast-studio/tools/distinct_fps.py --threshold 0.5 --json-out r.json <file>`. Caveat: this encode runs in the sub Edge on the same laptop (same for every condition) |
| Logged | per-rid outbound series (w/h/fps/bytes/active/**qualityLimitationReason + qualityLimitationDurations** / resolutionChanges / **encoderImplementation** / powerEfficientEncoder / scalabilityMode / targetBitrate) · subscriber inbound series (w/h/fps/bytes/loss/jitter/freeze) · **browser CPU** (pub vs sub Edge instance, by `--user-data-dir` marker; + total CPU + GPU VideoEncode %) · **precise Paris start/end** per condition (`AB-TIMESTAMPS.md`) |
| Gotcha | Chromium hides `encoderImplementation` unless the page captures → file pass holds a **disabled, unpublished** mic track (`?unlockStats=1`, `UNLOCK_FILE=1` default) |

Run (after lead go): stage `scripts/ab/*` + `public/harness.js` + `public/index.html` into `C:\Users\azero\s1-livekit-oss\scripts\ab\`, then
`powershell -File scripts\ab\run-ab-laptop.ps1 -VisionFreeConfirmed [-Conds ab-cam-3L-off,ab-cam-3L-on]`. The wrapper deploys to `public\ab\` (root harness used by Vision untouched).

**Box dry run** (02:03–02:06 Paris, isolated box LiveKit 1.8.4 on alt ports, Chromium fake devices, **mock** S4 server — wiring only, numbers not meaningful): 3L → rids q/h/f 320×180 / 640×360 / 1280×720; 2L → q/h 320×180 / 1280×720; `qualityLimitationDurations` deltas + `encoderImplementation` captured (`SimulcastEncoderAdapter (libvpx…)`); sub-hi 1280×720 / sub-lo 320×180 pins hold; S4 hook start/stop/export OK on cam and file streams; S4-down → ON conds SKIPPED. Laptop results: see **RESULTS** below.

### Laptop A/B ± HQ rec — RESULTS (02:39–02:53 Paris, loopback, n=1 per condition)

> **Measurement only — no product decision.** Laptop-only (1 pub + 2 subs on one machine), take4 raw file loop (60 s, looped ×2 per window) as reference source. Data: [`s1-lab/livekit-oss/scripts/ab/results-20261006-0239/`](s1-lab/livekit-oss/scripts/ab/results-20261006-0239/) (raw CSVs authoritative; `AB-ANALYSIS.json` via `analyze-ab.py`). Webm on box `/workspace/s1-soak/ab/run-003936/`. Pre-run `nvidia-smi`: no python/onnx compute process.

**Timestamps (Paris, for Media/QLR alignment)**

| cond | window start | window end | S4 rec start | S4 rec stop | S4 result key |
| --- | --- | --- | --- | --- | --- |
| ab-file-3L-off | 02:40:05.320 | 02:42:07.626 | — | — | OFF |
| ab-file-3L-on | 02:42:47.024 | 02:44:47.853 | 02:42:47.326 | 02:44:47.848 | `spike/s4-dropin/ab-file-3L-on-raw-1791247367212.results.json` |
| ab-file-2L-off | 02:45:27.797 | 02:47:30.350 | — | — | OFF |
| ab-file-2L-on | 02:48:09.758 | 02:50:10.958 | 02:48:09.993 | 02:50:10.951 | `spike/s4-dropin/ab-file-2L-on-raw-1791247689896.results.json` |
| ab-cam-3L-on | 02:50:49.757 | 02:52:50.636 | — (start failed) | — | **NOT RUN** — see below |

**Per condition** (HD = top rid: `f` for 3L, `h` for 2L; medians over the 120 s window, 2 s samples)

| cond | HD sent res @fps (samples w/ dims) | QLR share (HD rid samples) | `qualityLimitationDurations` Δ s | encoderImplementation | pub Edge CPU % machine med (max) | sub-hi received res @fps | distinct fps near · 1 s windows ≥24 · longest near-dup |
| --- | --- | --- | --- | --- | --- | --- | --- |
| file-3L-off | 960×540 @30 (60/60) | cpu 0.90 · none 0.10 | cpu 109.4 · none 10.4 · bw 0 | SimulcastEncoderAdapter (libvpx ×3) | 18.6 (23.0) | 960×540 @30 · freeze Δ0 | **25.95** · **1.00** · 283 ms |
| file-3L-on | 960×540 @22 (**18/59** — `f` mostly not producing) | cpu 0.90 · none 0.10 | cpu 107.2 · none 10.8 · bw 0 | SEA (libvpx ×3) + libvpx | 20.0 (32.8) | **320×180** @30 · freeze Δ1 | **23.00** · **0.82** · 805 ms |
| file-2L-off | **1280×720 @30** (60/60) | **none 1.00** | none 119.9 · cpu 0 · bw 0 | SEA (libvpx ×2) | 15.9 (22.0) | **1280×720 @30** · freeze Δ1 | **26.26** · **0.975** · 341 ms |
| file-2L-on | 960×540 @30 (59/59) | cpu 0.93 · none 0.07 | cpu 110.5 · none 7.8 · bw 0 | SEA (libvpx ×2) | 24.6 (31.2) | 960×540 @29 · freeze Δ0 | **25.28** · **0.984** · 651 ms |

Reference: source `take4-raw.webm` itself = distinct near **29.84**, windows ≥24 **1.00**. Total laptop CPU med: 51 / 55 / 51 / 62.5 %. GPU VideoEncode engine: **0 %** in all conditions (VP8 encode is software libvpx; observation only).

**Rec ON vs OFF (same layers)**

| | 3L | 2L |
| --- | --- | --- |
| HD sent | 960×540@30 → 960×540@22, `f` active in only 31 % of samples | 1280×720@30 → 960×540@30 |
| QLR | cpu-limited in both (≈0.9) | **none 1.00 → cpu 0.93** |
| pub Edge CPU (machine %) | +1.4 pt med (+9.8 max) | +8.7 pt med (+9.2 max) |
| sub-hi received | 960×540 → **320×180** | 1280×720 → 960×540 |
| distinct near / ≥24 share | 25.95 / 1.00 → **23.00 / 0.82** | 26.26 / 0.975 → 25.28 / 0.984 |

**Reading (no decision):** on this single laptop, 2 layers without local HQ rec is the only condition where the HD layer was sent at 1280×720@30 with no quality limit. Local HQ rec (S4Recorder, VP8 2.5 Mbps software encode in the publisher tab) pushes the encoder into `cpu` limitation in both layer configurations. With 3L + rec, the HD subscriber fell back to the low layer for most of the window (distinct ≥24 share 0.82).

**ab-cam-3L-on — NOT RUN (blocker):** `getUserMedia` → `NotReadableError: Could not start video source`. Windows reports the webcam (Microsoft LifeCam Cinema) **in use by `msedge.exe`** (the user's own Edge, not the A/B instance). Nothing was killed. The runner wrongly marked it DONE (status "connected" is set before publish). Fixed afterwards: a condition now FAILs when the publisher has no published video. gUM+rec coexistence: **NOT VALIDATED**.

**Distinct fps, corrected (native per-frame-size decode, `scripts/ab/distinct_fps_varsize.py`, threshold 0.5)**

| cond | tool near | **native near** | ≥24 share: exact = frames delivered/s (tool) | **≥24 share, near-distinct** | longest near-dup (native) |
| --- | --- | --- | --- | --- | --- |
| file-3L-off | 25.95 | **26.09** | 1.00 | **0.85** | 8 f |
| file-3L-on | 23.00 | **23.31** | 0.82 | **0.60** | 23 f |
| file-2L-off | 26.26 | **26.26** | 0.975 | **0.88** | 12 f |
| file-2L-on | 25.28 | **25.48** | 0.984 | **0.84** | 20 f |

The ON vs OFF direction is unchanged. The near-distinct ≥24 share is the stricter reading. Near-dup MAD depends on the received resolution: downscaling everything to 320×180 lowers every value (see `varsize-all.json`), so cross-resolution comparisons stay approximate.

**Caveats:** n=1 × 120 s per condition. Everything on one laptop (loopback, not LAN). The sub-hi received-track MediaRecorder runs in the sub Edge in every condition. The received-track webm **changes resolution mid-stream** whenever the SFU switches layers (ffprobe: 3L-off 1280×720→960×540 at ~12 s · 3L-on 1280×720→960×540 at ~13 s→**320×180 from ~39 s to the end** · 2L-off constant 1280×720 · 2L-on 1280×720→960×540 at ~10 s). An earlier version of this caveat wrongly said it was a constant 1280×720 upscale. `distinct_fps.py` lets ffmpeg autoscale every frame to the first frame's size before the MAD diff, so near-dup values are slightly biased. Its 1 s windows use exact hashes, so they count frames delivered per second. See [#10](https://github.com/Sandbox-podcast/Podcast-Studio/issues/10) and the corrected table below. Source loops at 60 s inside each window. Two earlier attempts (02:23, 02:33) died after cond 1 (wrapper `ErrorActionPreference=Stop` killed node on a benign stderr line; Playwright `TargetClosedError` on close) and are excluded.

## Annexe — desk SaaS (superseded)

> **Statut : superseded** — recherche desk 2026-10-05 sur LiveKit Cloud, Daily, Agora. Le POC SaaS (free tier) est **abandonné** ; conservé comme contexte historique uniquement. **Ne pas** créer de comptes ni exécuter [`s1-lab/livekit/`](s1-lab/livekit/) (Cloud), [`daily/`](s1-lab/daily/), [`agora/`](s1-lab/agora/) contre les vendeurs.

Résumé archivé :

- Comparatif pricing participant-minute et free tiers (Build / 10k min) — voir commit git antérieur ou PR #3 historique.
- AC-RTC-002 : Daily `getNetworkStats` proche ; LiveKit/Agora via getStats + SDK.
- **Aucune** de ces options n’est le chemin POC actuel.

Harnais navigateur SaaS : **gelés** sous `spikes/s1-lab/` — voir [`s1-lab/README.md`](s1-lab/README.md).
