# Spike S1 — SFU self-host (RTC serveur interne) + diagnostics

| | |
| --- | --- |
| **Date** | 2026-10-05 (pivot Loïc via lead) |
| **Auteur** | Podcast RTC |
| **Statut** | **LAB DEV LOCAL UP** — stack **LiveKit OSS (B)** ; instance Docker Compose sur poste dev (2026-10-05) |
| **Décision stack POC** | **B — LiveKit OSS self-host** (vote locked 2026-10-05, lead / Loïc) ; A/C/D non retenus |
| **D-04** | Override **POC uniquement** — voir [`S1-D04-POC-override.md`](S1-D04-POC-override.md) |
| **Plafond SFU €/h** | **N/A (POC self-host)** — Loïc via lead, 2026-10-05 ; plafond **cloud** reporté post-POC |

> **Pivot Loïc (explicite)**  
> - **Stop** tout push cloud SFU SaaS : pas de clés / comptes / runs LiveKit Cloud, Daily, Agora.  
> - POC = **RTC serveur interne self-host** sur infra Sandbox (**LAN** et/ou **VPS EU**). Participants en **France**.  
> - **D-04** : le SFU cloud managé reste l’**hypothèse produit post-POC** ; override POC documenté, pas d’effacement de D-04.  
> - **Vote B** : lab via [`s1-lab/livekit-oss/`](s1-lab/livekit-oss/). **Q2** : **LAN Sandbox first** (VPS EU plus tard si besoin) — **IP/hôte/SSH TBD** Loïc.

---

## Hypothèse testée

Un **SFU LiveKit OSS self-hosté** sur infra Sandbox (**LAN** et/ou **VPS EU**) permet de :

1. Tenir **≥ 5 participants** A/V simultanés stables ≥ 20 min (AC-RTC-001), clients en **France**.
2. Exposer les métriques AC-RTC-002 (**bitrate, packet loss, jitter, RTT, résolution, FPS**) via `getStats()` navigateur + instrumentation serveur si besoin.
3. Rester compatible **local-first masters** (AC-RTC-003) : egress serveur = bonus, jamais seul master.
4. Garder le **trafic média sur infra Sandbox** (LAN ou VPS EU) — pas de minutes SFU SaaS en POC.

Coût POC : **ESTIMATION VPS €/h** uniquement (pas de facturation minutes cloud) — **pas de pass/fail coût inventé**.

---

## État des phases

| Phase | Contenu | Statut |
| --- | --- | --- |
| **PREP SaaS (archivé)** | Desk LiveKit Cloud / Daily / Agora | **Superseded** — POC SaaS abandonné ([annexe](#annexe--desk-saas-superseded)) |
| **PREP self-host** | Grille comparatif (historique) + QCM | Vote **B** |
| **LAB LiveKit OSS** | `docker compose` + harnais [`livekit-oss/`](s1-lab/livekit-oss/) | **DEV local UP** (Loïc unblocked) ; **LAN Sandbox IP** reporté pour multi-pax FR |

**Interdit** : **SFU SaaS** (Cloud/Daily/Agora) ; code Phase 1 produit dans ce repo spike.

---

## Setup (LAB — à remplir pendant le lab)

*(Ne pas inventer de chiffres.)*

**Cible lab** : participants en **France** ; SFU sur **LAN Sandbox en priorité** (VPS EU en repli). **Dev local** : pas d’attente IP Sandbox pour smoke (Loïc, 2026-10-05). **IP LAN Sandbox** : **TBD** pour sessions multi-pax sur le réseau Sandbox (ne pas inventer).

| Champ | Valeur |
| --- | --- |
| Hôte SFU (LAN IP / VPS EU FQDN) | **dev** : `127.0.0.1` (localhost) — **LAN Sandbox IP : TBD** Loïc |
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

> Harnais : [`s1-lab/livekit-oss/README.md`](s1-lab/livekit-oss/README.md). **Blocker** : **IP / hôte / SSH LAN Sandbox** manquants (Loïc) — Q2 = LAN first, pas d’hostname inventé.

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

## Mesures (LAB — à remplir)

### Stabilité

| Run | Stack | Hôte (LAN/VPS EU) | Pax | Durée | A/V OK ? | Décos | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | |
| | | | | | | | |

### Diagnostics AC-RTC-002

| Stack | Pax | Bitrate ↓/↑ | Packet loss % | Jitter | RTT | Résolution | FPS | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | | |
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

### Pass (techniques uniquement)

- [ ] 5 pax A/V stables ≥ 20 min (AC-RTC-001)
- [ ] AC-RTC-002 exposé (6 métriques)
- [ ] Compatible local-first (egress serveur = bonus)

### Fail

- [ ] Instabilité > 3 pax non résolue
- [ ] Incompatible local-first

### Coût

- **Pas de pass/fail coût inventé** pour le POC.
- EST. VPS documentées si disponibles ; comparaison budget = **après** indications Loïc (hors scope lock salon).

---

## Décision

- **Stack POC (locked)** : **B — LiveKit OSS self-host** (2026-10-05, lead / Loïc).
- **Non retenus POC** : A mediasoup, C DIY, D cloud managé (hors POC actuel ; OK Loïc explicite pour SaaS).
- **Infra** : **LAN Sandbox first** (Q2 lock Loïc) ; VPS EU si besoin plus tard ; **IP/hôte TBD**.
- **D-04 produit** : cloud public managé = hypothèse **post-POC** ; override POC = [`S1-D04-POC-override.md`](S1-D04-POC-override.md).

---

## Blockers

| ID | Blocker | Owner | Statut |
| --- | --- | --- | --- |
| B1 | Vote stack POC | — | **Fermé** — **B LiveKit OSS** |
| B2 | **IP / hôte / SSH LAN Sandbox** pour lab **multi-pax France** (Q2 = LAN first) | Loïc | **Reporté** — dev local **UP** sans IP Sandbox |
| B3 | Go formel post-S0 ([PR #5](https://github.com/Sandbox-podcast/Podcast-Studio/pull/5)) pour enchaînement produit | Lead | Ouvert (parallèle prep OK) |
| B4 | ~~SFU SaaS free tier~~ | — | **Annulé** — SaaS stop per Loïc |

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
