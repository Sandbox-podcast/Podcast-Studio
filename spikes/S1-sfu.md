# Spike S1 — SFU self-host (RTC serveur interne) + diagnostics

| | |
| --- | --- |
| **Date** | 2026-10-05 (pivot Loïc via lead) |
| **Auteur** | Podcast RTC |
| **Statut** | **PIVOTED — self-host prep** ; lab SaaS free-tier **annulé** |
| **Décision stack** | **Aucun verrouillage** — vote salon QCM ([`S1-QCM.md`](S1-QCM.md)) en attente |
| **D-04** | Override **POC uniquement** — voir [`S1-D04-POC-override.md`](S1-D04-POC-override.md) |

> **Pivot Loïc (explicite)**  
> - **Stop** tout push cloud SFU SaaS : pas de clés / comptes / runs LiveKit Cloud, Daily, Agora.  
> - POC = **RTC serveur interne self-host** sur infra Sandbox (**LAN** et/ou **VPS EU**). Participants en **France**.  
> - **D-04** : le SFU cloud managé reste l’**hypothèse produit post-POC** ; override POC documenté, pas d’effacement de D-04.  
> - **Ne pas verrouiller** mediasoup / LiveKit OSS / DIY avant le vote salon A/B/C/D — **comparaison et prep seulement**.

---

## Hypothèse testée

Un **SFU self-hosté** sur infra Sandbox (candidats POC : **mediasoup**, **LiveKit OSS** ; option **DIY WebRTC** si le vote le retient) permet de :

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
| **PREP self-host (actif)** | Grille mediasoup vs LiveKit OSS, protocole VPS/LAN, QCM salon | **En cours** |
| **LAB self-host** | Déploiement VPS/LAN, 5 pax FR, ≥20 min, throttling | **À démarrer** après accès infra + vote (pas de stack lock avant vote) |

**Interdit** : créer des projets / clés **SFU SaaS** ; verrouiller une stack sans vote salon ; code Phase 1 produit dans ce repo spike.

---

## Setup (LAB — à remplir pendant le lab)

*(Ne pas inventer de chiffres.)*

**Cible lab** : participants en **France** ; SFU sur **LAN Sandbox** et/ou **VPS EU** (hébergement et accès à confirmer avec Loïc / lead).

| Champ | Valeur |
| --- | --- |
| Hôte SFU (LAN IP / VPS EU FQDN) | |
| Région / datacenter VPS | |
| TURN / STUN (coturn, LiveKit TURN, autre) | |
| Devices / OS clients | |
| Navigateurs (versions) | |
| Nb machines physiques (≥ 2) | |
| Réseau clients (fibre / Wi‑Fi / VPN) | |
| Stack candidat (mediasoup / LiveKit OSS / DIY) | |
| Versions serveur + SDK client | |
| Date début / fin lab | |

---

## Comparatif principal — self-host POC

Comparaison **préparatoire** pour le salon — **pas de recommandation**, **pas de lock** avant vote.

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

## Protocole de lab (self-host — VPS/LAN)

> Prérequis : accès **VPS EU** et/ou **LAN** fourni par Loïc/lead ; candidat serveur aligné sur le **vote salon** (en attendant, prep doc + squelettes [`s1-lab/mediasoup/`](s1-lab/mediasoup/), [`s1-lab/livekit-oss/`](s1-lab/livekit-oss/)).

### Jour 1 — Déploiement minimal

- [ ] Obtenir détails VPS/LAN (IP, ports UDP, TLS, firewall)
- [ ] Déployer **un** candidat (selon vote ou branche lab parallèle **sans lock**)
- [ ] TURN/STUN opérationnel ; 2 navigateurs join (2 machines si possible)
- [ ] Publier cam/mic 720p ; subscribe croisé
- [ ] Brancher tableau AC-RTC-002 (`getStats()`)

### Jour 2 — 3 pax + diag

- [ ] UI ou tableau live 6 métriques AC-RTC-002
- [ ] Session 3 pax (France) ≥ 20 min stable
- [ ] RTT baseline Paris → hôte SFU

### Jour 3 — 5 pax + dégradation

- [ ] 5 clients réels, ≥ 2 machines, **France**
- [ ] Session ≥ 20 min (AC-RTC-001)
- [ ] Chrome throttling (Slow 3G / custom) ; option `tc`
- [ ] Smoke : masters locaux intacts si dégradation réseau

### Jour 4 — Egress bonus (optionnel)

- [ ] Un flux egress **serveur** (si stack le permet) → fichier test
- [ ] Confirmer : egress ≠ master unique
- [ ] Noter charge CPU / bande passante observée (pas de chiffres inventés)

### Jour 5 — 2ᵉ candidat (si temps) + synthèse

- [ ] Smoke 10–15 min sur l’autre stack self-host si infra le permet
- [ ] Remplir mesures ; alimenter QCM salon — **sans verrouiller** sans vote

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

- **Stack POC** : **en attente vote salon** (mediasoup / LiveKit OSS / DIY / reprise cloud — option D hors POC actuel).
- **Aucune option verrouillée** par ce document.
- **D-04 produit** : cloud public managé = hypothèse **post-POC** ; override POC = [`S1-D04-POC-override.md`](S1-D04-POC-override.md).

---

## Blockers

| ID | Blocker | Owner | Statut |
| --- | --- | --- | --- |
| B1 | **Vote salon** A/B/C/D ([`S1-QCM.md`](S1-QCM.md)) | Lead / salon | Ouvert — **pas de stack lock** avant vote |
| B2 | Détails **VPS EU** et/ou **LAN** (ports, TLS, TURN) | Loïc / lead | Ouvert |
| B3 | Go formel post-S0 ([PR #5](https://github.com/Sandbox-podcast/Podcast-Studio/pull/5)) pour enchaînement produit | Lead | Ouvert (parallèle prep OK) |
| B4 | ~~SFU SaaS free tier~~ | — | **Annulé** — SaaS stop per Loïc |

---

## Plan phasé

```text
┌─────────────────────────────────────────────────────────────┐
│ PIVOT (actuel)                                              │
│  ✓ Stop SaaS SFU (pas de clés / runs cloud)                 │
│  ✓ Doc self-host + D-04 override POC only                   │
│  → Vote salon QCM (pas de lock avant vote)                  │
│  → Prep s1-lab/mediasoup + livekit-oss                      │
└───────────────────────────┬─────────────────────────────────┘
                            │ vote + accès VPS/LAN
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ LAB self-host (VPS EU / LAN, participants FR)               │
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
