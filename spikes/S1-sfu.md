# Spike S1 — SFU cloud 5 participants + diagnostics

| | |
| --- | --- |
| **Date** | 2026-10-05 |
| **Auteur** | Podcast RTC |
| **Statut** | **LAB STARTED (free tier)** — harnais `spikes/s1-lab/` (LiveKit, Daily, Agora) |
| **Décision SFU** | **pending mesures lab + QCM Loïc** (aucune option verrouillée) |
| **Prérequis** | Go lead post-S0 ([PR #5](https://github.com/Sandbox-podcast/Podcast-Studio/pull/5)) pour décision formelle ; **lab free tier** démarré sans infra payante ; plafond coût €/h Loïc requis avant pass/fail coût |

> **Périmètre de ce document**  
> - Sections **PREP** : recherche desk (pricing public, DX docs, egress, diagnostics, EU). Aucun compte cloud payant créé.  
> - Sections **LAB** : protocole à exécuter **après** go S0 + seuil coût Loïc. Ne pas lancer tant que ces blockers ne sont pas levés.  
> - IdP / SSO : **hors scope S1** (bloque S0, pas ce spike).

---

## Hypothèse testée

Un SFU cloud managé (candidats : LiveKit Cloud, Daily, Agora) permet de :

1. Tenir **≥ 5 participants** A/V simultanés stables ≥ 20 min (AC-RTC-001).
2. Exposer un dashboard diag avec **bitrate, packet loss, jitter, RTT, résolution, FPS** (AC-RTC-002) via `getStats()` + events SFU.
3. Rester compatible avec la stratégie **local-first masters** (AC-RTC-003) : l’egress SFU est un bonus, jamais le seul master.
4. Avoir un coût horaire **acceptable pour usage interne Sandbox** — le seuil €/h est à fixer avec Loïc (**ne pas inventer** ; pas de pass/fail coût tant que non fixé).

---

## État PREP vs LAB

| Phase | Contenu | Quand | Actions autorisées |
| --- | --- | --- | --- |
| **PREP (livré)** | Comparatif desk, formules de coût, protocole lab, grille mesures vide, QCM | 2026-10-05 | Lecture docs publiques ; rédaction ; coordination lead |
| **LAB (en cours, free tier)** | Harnais navigateur + room 5 pax, throttling, mesures | Démarré — comptes **Build / free** uniquement | Voir [`spikes/s1-lab/README.md`](s1-lab/README.md) ; **pas de PR produit** ; décision SFU après mesures + QCM |

**Interdit** : projet SFU **payant** sans OK Loïc ; verrouiller un choix SFU avant QCM ; code Phase 1 produit dans ce repo spike.

---

## Setup (LAB — à remplir pendant le lab)

*(Colonnes vides volontairement — ne pas inventer de chiffres de lab.)*

| Champ | Valeur |
| --- | --- |
| Devices / OS | |
| Navigateurs (versions) | |
| Nb machines physiques (≥ 2) | |
| Réseau (fibre / Wi‑Fi / VPN) | |
| Région SFU utilisée | |
| SDK / versions | |
| Compte (free / trial — noter plan) | |
| Date début / fin lab | |

---

## Comparatif candidats (PREP — desk research)

Sources consultées le **2026-10-05**. Estimations clairement marquées **ESTIMATION** ; formules documentées. Chiffres de lab = à mesurer plus tard.

### Formules coût (minutes participant)

Convention commune : **1 participant-minute** = 1 personne connectée pendant 1 minute.

| Scénario (1 h wall-clock, vidéo 720p) | Participant-minutes |
| --- | --- |
| 3 pax | \(3 \times 60 = 180\) |
| 5 pax | \(5 \times 60 = 300\) |

### Tableau comparatif

| Critère | A — LiveKit Cloud | B — Daily | C — Agora |
| --- | --- | --- | --- |
| **Coût estimé /h 3 pax 720p** | **ESTIMATION** : ~**$0.09–0.18/h** hors free (Ship overage WebRTC **$0.0005**/participant-min → \(180 \times 0.0005 = \$0.09\) ; estimate LiveKit « connection + data » **$0.001**/min → \(180 \times 0.001 = \$0.18\)). Free Build : 5 000 WebRTC min/mois (hard cap). | **ESTIMATION** : ~**$0.72/h** hors free (taux list **$0.004**/participant-min → \(180 \times 0.004 = \$0.72\)). Free : 10 000 participant-min/mois. | **ESTIMATION** : ~**$0.72/h** hors free (Video HD list **$3.99 / 1 000** participant-min → \(180 \times 0.00399 ≈ \$0.72\)). Free : 10 000 *standard minutes*/mois (HD convertie ×4 → **attention** consommation accélérée). |
| **Coût estimé /h 5 pax 720p** | **ESTIMATION** : ~**$0.15–0.30/h** (300 × 0.0005 / 0.001). | **ESTIMATION** : ~**$1.20/h** (300 × 0.004). | **ESTIMATION** : ~**$1.20/h** (300 × 0.00399) ; vérifier si agrégat résolutions reçues pousse en Full HD (×9 standard min). |
| **Sources pricing** | [livekit.com/pricing](https://livekit.com/pricing) / [pricing.md](https://livekit.com/pricing.md) — consulté 2026-10-05 | [daily.co/pricing/video-sdk](https://www.daily.co/pricing/video-sdk/) — consulté 2026-10-05 | [agora.io pricing RTC](https://www.agora.io/en/pricing/agora-rtc/) / [docs pricing](https://docs.agora.io/en/realtime-media/rtc/reference/pricing) — consulté 2026-10-05 |
| **Opaque ?** | Partiellement : data transfer **$0.12/GB** (Ship) peut faire varier le réel selon bitrate SFU ; estimate « $0.001/min » = approximation vendeur. | Clair sur participant-min + recording séparé. | Conversion *standard minutes* (HD 1:4) à bien modéliser ; packages prépayés vs list. |
| **DX JS/TS** | `livekit-client` + `@livekit/components-react` ; tokens JWT server-side ; rooms explicites ; data channels. | `daily-js` + `@daily-co/daily-react` ; rooms REST ; tokens meeting ; DX rooms très documentée. | Agora Web SDK 4.x + React Video SDK ; App ID + tokens RTC ; API plus « channel » que « room ». |
| **Diagnostics vs AC-RTC-002** | `ConnectionQuality` + stats internes tracks (`packetsLost`, `jitter`, `roundTripTime`, bitrate dérivé) ; dashboard Cloud. **À mapper** bitrate / loss / jitter / RTT / résolution / FPS via getStats navigateur + events. | `getNetworkStats()` + `useNetwork` : bitrate, packet loss, jitter, RTT, `networkState` — **très proche** AC-RTC-002 ; résolution/FPS via tracks/`getStats` WebRTC. | `network-quality` (score 0–6) + `getLocal/RemoteVideo/AudioStats` + `getRTCStats` — métriques riches ; mapping dashboard à construire. |
| **Egress / recording** | RoomComposite, TrackComposite, Track egress, webhooks ; sortie S3/fichier/RTMP. **Bonus** program — pas master unique. | `cloud`, `cloud-audio-only`, **`local`** (client), **`raw-tracks`** → S3. Mode `local` aligné esprit local-first ; raw-tracks = bonus tracks. | Cloud Recording (REST, régions EU API) → stockage tiers. Bonus serveur ; masters restent côté client (S4). |
| **Fit local-first** | Egress optionnel, ne remplace pas MediaRecorder client (S4). | `local` + masters client S4 + raw-tracks optionnels. | Cloud Recording ≠ master HQ client ; OK si traité comme bonus. |
| **Free / trial** | Build $0 : 5 000 WebRTC min/mois, hard cap. | 10 000 participant-min/mois free. | 10 000 standard min/mois free (suspension si dépassement). |
| **EU / latence Europe (docs vendeur)** | Edge global ; region agents `eu-central` (Frankfurt) documentée ; **region pinning** plan Scale+. Residency stricte : à vérifier en lab / avec vendeur. | Call servers `eu-central-1` (Frankfurt) via `geo` ; blog Daily : certaines dépendances US encore possibles — **pas de garantie residency EU totale** dans la doc publique citée. GDPR / DPA disponibles. | Endpoints REST EU (`api-eu-central-1`, `api-eu-west-1`) pour Cloud Recording ; edge Agora Europe. Residency : confirmer subprocessors / DPA. |
| **Risques** | Coût réel sensible au **bandwidth** ; pinning EU = plan supérieur. | Coût participant-min plus élevé que LiveKit list ; recording cloud payant. | Pricing par résolution agrégée peut surprendre à 5 pax ; DX plus « télécom ». |
| **Observations desk (sans verdict)** | Pricing WebRTC list bas ; egress riche ; DX React solide ; AC-RTC-002 nécessite assemblage getStats. | DX diag native très proche AC-RTC-002 ; recording `local` intéressant ; EU geo dispo avec caveats residency. | Métriques natives fortes ; modèle standard-minutes à maîtriser ; fit podcast moins « room-first ». |

**Rappel coût** : aucune colonne ci-dessus ne constitue un **pass/fail**. Le plafond €/h (3 pax et 5 pax) est une **question ouverte pour Loïc** (voir QCM).

---

## Protocole de lab détaillé (LAB — checklist jours 1–5)

> **Free tier** : le harnais LiveKit sous `spikes/s1-lab/livekit/` peut être exécuté dès maintenant (compte Build). Pour **pass/fail coût** et décision SFU formelle : (1) go lead post-S0 ([PR #5](https://github.com/Sandbox-podcast/Podcast-Studio/pull/5)), (2) plafond coût Loïc, (3) mesures lab remplies ci-dessous.

### Jour 1 — Harnais minimal (1 candidat prioritaire desk, puis les autres)

- [ ] Compte **free/trial** uniquement (ne pas upgrader sans OK Loïc)
- [x] Harnais minimal LiveKit : `spikes/s1-lab/livekit/` (token local + join navigateur)
- [ ] App hello : join 2 navigateurs (2 machines si possible) — **à exécuter avec compte Cloud**
- [ ] Publier caméra/micro 720p ; subscribe croisé
- [x] Polling `getStats()` → tableau UI (AC-RTC-002)
- [ ] Checklist AC-RTC-002 validée sur run réel (marquer écarts)

### Jour 2 — Dashboard diag minimal + 3 pax

- [ ] UI opérateur : tableau live des 6 métriques AC-RTC-002
- [ ] Session 3 pax ≥ 20 min stable
- [ ] Noter versions SDK, région, RTT baseline Europe/Paris

### Jour 3 — 5 pax + dégradation réseau

- [ ] Room 5 clients navigateurs réels, **≥ 2 machines physiques**
- [ ] Session A/V ≥ 20 min (critère pass stabilité)
- [ ] Chrome throttling (Slow 3G / custom) + éventuellement `tc` sur 1 machine
- [ ] Vérifier : live dégradé ≠ corruption masters locaux (smoke MediaRecorder court — foreshadow S4 ; pas remplacer S4)

### Jour 4 — Egress bonus (optionnel) + coûts

- [ ] Tester **un** egress composite **ou** raw-tracks / track egress (selon candidat) → fichier test
- [ ] Confirmer explicitement : egress ≠ master unique
- [ ] Relever usage dashboard vendeur (minutes, GB) vs formules ESTIMATION
- [ ] Remplir tableau « Mesures » + « Coûts observés »

### Jour 5 — Comparaison courte candidat #2 (si temps) + synthèse

- [ ] Smoke 5 pax 10–15 min sur 2ᵉ candidat si free tier le permet
- [ ] Remplir Pass/Fail stabilité + diag (toujours **pas** pass/fail coût sans plafond)
- [ ] Mettre à jour ce doc + préparer réponses QCM pour Loïc via le lead
- [ ] **Stop** : pas de PR produit ; pas de verrouillage SFU sans QCM Loïc

---

## Mesures (LAB — à remplir)

### Stabilité

| Run | Candidat | Pax | Durée | A/V OK ? | Décos | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |
| | | | | | | |

### Diagnostics AC-RTC-002 (échantillon médiane / p95)

| Candidat | Pax | Bitrate ↓/↑ | Packet loss % | Jitter | RTT | Résolution | FPS | Source (getStats / SDK) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | | |
| | | | | | | | | |

### Dégradation réseau

| Condition | Candidat | Effet live | Masters locaux intacts ? | Notes |
| --- | --- | --- | --- | --- |
| Throttle Chrome | | | | |
| tc / loss simulé | | | | |

---

## Pass / Fail

### Pass (techniques — hors coût)

- [ ] 5 pax A/V stables ≥ 20 min (AC-RTC-001)
- [ ] Métriques AC-RTC-002 exposées (bitrate, packet loss, jitter, RTT, résolution, FPS)
- [ ] DX / recording **compatible** local-first (egress = bonus, pas seul master)

### Fail

- [ ] Instabilité au-delà de 3 pax
- [ ] DX / recording incompatible avec local-first masters

### Coût

- **Non évalué en pass/fail** tant que Loïc n’a pas fixé le plafond €/h (3 pax et 5 pax).
- Après fixation du seuil : comparer **coûts observés lab** (+ ESTIMATION desk) au plafond — alors seulement marquer OK / hors budget.

---

## Décision

**État : pending mesures lab + QCM Loïc.**

- Aucune option A / B / C / D **verrouillée** dans ce document PREP.
- Les *observations desk* du tableau ne constituent **pas** une recommandation.
- Le choix final SFU sera tranché **après** lab et réponse QCM (transmis via le lead Podcast Studio).

---

## Coûts observés

### ESTIMATION desk uniquement (2026-10-05)

| Candidat | 3 pax / h (720p) | 5 pax / h (720p) | Notes |
| --- | --- | --- | --- |
| LiveKit Cloud | **EST.** $0.09–0.18 | **EST.** $0.15–0.30 | Hors free ; + data transfer réel à mesurer |
| Daily | **EST.** $0.72 | **EST.** $1.20 | Hors free 10k ; recording cloud non inclus |
| Agora | **EST.** ~$0.72 | **EST.** ~$1.20 | HD list ; vérifier conversion standard-min & agrégat résolutions |

**Plafond €/h** : à fixer explicitement avec Loïc — **non inventé ici**.

### Observés lab (après go)

| Candidat | Minutes facturées | $ / € relevés | Écart vs EST. | Notes |
| --- | --- | --- | --- | --- |
| | | | | |

---

## Blockers

| ID | Blocker | Bloque | Owner | Statut |
| --- | --- | --- | --- | --- |
| B1 | Spike **S0** non pass / pas de go lead post-S0 ([PR #5](https://github.com/Sandbox-podcast/Podcast-Studio/pull/5)) | Décision SFU formelle ; pass/fail coût | Lead Podcast Studio | Ouvert — lab free tier autorisé en parallèle |
| B2 | **Plafond coût €/h** (3 pax et 5 pax) non fixé avec Loïc | Pass/fail coût ; décision budget | Loïc via lead + QCM | Ouvert |
| B3 | Accords comptes free/trial vs éventuel payant | Lab multi-candidats prolongé | Loïc / lead | Ouvert |
| B4 | Clarifier **exigence residency EU** Sandbox (si stricte) vs geo latency seule | Choix région / plan (ex. LiveKit pinning Scale) | Loïc / legal — **ne pas inventer policy** | Ouvert (question) |
| — | IdP / SSO | **S0 uniquement** — hors scope S1 | — | N/A S1 |

---

## Plan phasé

```text
┌─────────────────────────────────────────────────────────────┐
│ PREP (livré)                                                │
│  ✓ Desk research pricing / DX / egress / diag / EU          │
│  ✓ Draft spikes/S1-sfu.md + QCM                             │
│  → Transmettre QCM à Loïc via lead (pas exécuter la décision)│
└───────────────────────────┬─────────────────────────────────┘
                            │ lab free tier (en cours)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ LAB (free tier — en cours)                                  │
│  ✓ Harnais spikes/s1-lab/ (LiveKit) ; Daily/Agora stubs     │
│  J1–J5 protocole ci-dessus (free/trial d’abord)             │
│  Remplir mesures + coûts observés                           │
│  Pass/Fail techniques ; coût seulement si plafond connu     │
│  Réponses QCM → lead → Loïc                                 │
│  ✗ Stop avant verrouillage unilatéral et avant PR produit   │
└───────────────────────────┬─────────────────────────────────┘
                            │ QCM Loïc répondu
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ DÉCISION (post-lab)                                         │
│  Choix SFU A/B/C/D verrouillé + ADR si besoin               │
│  Déblocage Phase 1 RTC / couplage S3–S4                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Suite

| Après… | Action |
| --- | --- |
| PREP livré | Lead transmet QCM Loïc ; lab free tier via `s1-lab/` ; attendre go S0 ([PR #5](https://github.com/Sandbox-podcast/Podcast-Studio/pull/5)) + seuil coût pour décision |
| LAB pass technique | Amender ADR / ARCHITECTURE §4 avec SFU choisi |
| LAB fail | Documenter no-go ; option D / re-spike ; pas d’enchaînement Phase 1 RTC |
| SFU verrouillé | Débloque chemin S4 (recording local) couplé au même SFU ; S3 matting peut paralléliser |

**ADR** : à amender **après** décision post-lab uniquement.  
**Roadmap** : Phase 1 produit RTC **non** engagée tant que S1 n’est pas pass (SPIKES.md).

---

## Annexes PREP — détails sources

### LiveKit — points salients

- WebRTC participant minutes : Build 5 000 inclus ; Ship 150 000 puis **$0.0005/min** ; Scale 1.5M puis **$0.0004/min**.
- Downstream data : Ship 250 GB puis **$0.12/GB**.
- Recording/export (RoomComposite etc.) : transcode minutes partagées (Ship 600 puis **$0.02/min** vidéo).
- Track egress : **$0.001/min** au-delà de l’included.
- Docs egress : RoomComposite / TrackComposite / Track ; sortie S3 possible.

### Daily — points salients

- Video calls : **$0.004**/participant-min (premier palier après 10k free) ; paliers volume jusqu’à **$0.0015**.
- Cloud recording : **$0.01349**/recorded-min (+ **$0.003**/min storage Daily) — facturé wall-clock, pas × pax.
- `getNetworkStats` / `useNetwork` alignés diag.
- Recording `local` et `raw-tracks` (S3) documentés.

### Agora — points salients

- Video HD : **$3.99 / 1 000** participant-min (list) ; conversion standard-min HD **1:4**.
- Free 10 000 standard min ; packages Starter+ avec overage.
- Monitoring : `network-quality`, stats audio/vidéo locales et remote.
- Cloud Recording via REST ; domaines régionaux EU documentés pour API.

### Mapping AC-RTC-002 (cible lab)

| Métrique | LiveKit (approche) | Daily (approche) | Agora (approche) |
| --- | --- | --- | --- |
| Bitrate | stats track / getStats | `*BitsPerSecond` | `getLocal/RemoteVideoStats` |
| Packet loss | packetsLost | `*PacketLoss` | stats + quality |
| Jitter | jitter stats | `*Jitter` | stats video/audio |
| RTT | roundTripTime | `networkRoundTripTime` | `getRTCStats` / delay |
| Résolution | dimensions publication / track | track settings + getStats | video stats |
| FPS | framesPerSecond getStats | getStats / track | video stats |
