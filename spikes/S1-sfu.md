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

## Annexe — desk SaaS (superseded)

> **Statut : superseded** — recherche desk 2026-10-05 sur LiveKit Cloud, Daily, Agora. Le POC SaaS (free tier) est **abandonné** ; conservé comme contexte historique uniquement. **Ne pas** créer de comptes ni exécuter [`s1-lab/livekit/`](s1-lab/livekit/) (Cloud), [`daily/`](s1-lab/daily/), [`agora/`](s1-lab/agora/) contre les vendeurs.

Résumé archivé :

- Comparatif pricing participant-minute et free tiers (Build / 10k min) — voir commit git antérieur ou PR #3 historique.
- AC-RTC-002 : Daily `getNetworkStats` proche ; LiveKit/Agora via getStats + SDK.
- **Aucune** de ces options n’est le chemin POC actuel.

Harnais navigateur SaaS : **gelés** sous `spikes/s1-lab/` — voir [`s1-lab/README.md`](s1-lab/README.md).
