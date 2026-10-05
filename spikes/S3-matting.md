# Spike S3 — Détourage client temps réel

**Date** : 2026-10-05  
**Auteur** : _à compléter_  
**Statut** : **PREP** — profils matériels **verrouillés par Loïc** (voir Setup) ; en attente de (a) SKU / modèle exact pour la **cible MID** (i7 + dGPU milieu de gamme — **TBD**), (b) feu vert lead Podcast Studio post-S0 (D-00).

> **Mesures MID inventaire (2026-10-05)** : **python-mediapipe** sur **`LAPTOP-BI8P2KF3`** (LifeCam 720p) — voir table **Mesures** ; exports `spikes/s3-matting-harness/exports/mid-mediapipe-*.json`. **≠ pass officiel LOW-END** (i5 + iGPU). Harness **Edge** (`:8088`, RAF + canvas composite) et chemin **CaptureStream matting navigateur** : **toujours bloqués** (frames n’avancent pas). Aucune conclusion pass/fail S3 tant que le protocole n’est pas exécuté sur la **cible LOW-END** et le go spike acté.

---

## Hypothèse testée

Le détourage **côté client** (backends candidats : MediaPipe, WebGPU, WASM) peut atteindre **≥ 24 FPS** stables sur la **cible basse (LOW-END)** : laptop **Windows**, **Intel Core i5** + **iGPU** (unité physique à aligner avec le verrou Loïc — voir **Inventaire matériel**), avec une qualité **subjectivement acceptable pour podcast** (jury interne), et un **fallback explicite** (désactivation du matting → caméra brute) qui **ne casse pas la session** live.

La **cible MID** (Windows · **Intel Core i7** · **dGPU milieu de gamme**, SKU exact **TBD**) est documentée pour campagne complémentaire / matrice ; le **pass officiel S3** reste défini sur **LOW-END** ci-dessus.

Alignement architecture : pipeline client décrit en [ARCHITECTURE.md §5](../docs/ARCHITECTURE.md) et décision [D-02](../docs/DECISIONS.md) (live + matting client ; post-prod serveur).

---

## Setup (devices, réseau, versions)

| Élément | Valeur |
| --- | --- |
| **Cible LOW-END (Loïc) — pass officiel Windows** | Laptop **Windows** · CPU **Intel Core i5** · **iGPU** · hôte nommé **`LAPTOP-BI8P2KF3`** au verrou — **écart inventaire 2026-10-05** (voir Inventaire) ; confirmation Loïc **en attente** (changer la cible ou utiliser une autre machine i5 + iGPU) |
| **Cible MID (Loïc)** | **Windows** · CPU **Intel Core i7** · **dGPU milieu de gamme** · SKU / modèle exact **TBD** |
| Devices (runs officiels) | **`LAPTOP-BI8P2KF3`** — **CONNECTED** ; harness S3 **`http://127.0.0.1:8088/`** (Edge, matting **bloqué**). **2026-10-05** : mesures **python-mediapipe** (ffmpeg dshow → ImageSegmenter selfie, CPU/XNNPACK) = **inventaire MID réel** — **pas** LOW-END officiel. |
| OS / navigateurs | **`LAPTOP-BI8P2KF3`** : **Windows 11 Famille** · **Edge** (harness) · **python/3.9.13** + **mediapipe/0.10.14** (runs mesurés). Autres unités : _TBD_ |
| Caméra(s) testées | **Microsoft® LifeCam Cinema(TM)** — max natif **1280×720@30** (pas de mode 1080p dshow) |
| Harness | `spikes/s3-matting-harness/` (statique, hors produit) |
| Réseau | Local ; LiveKit OSS S1 **`s1-lab`** — sur **`LAPTOP-BI8P2KF3`** : `ws://192.168.1.68:7880` (LAN) et `ws://127.0.0.1:7880` · token `http://127.0.0.1:5190/api/token` · harness S3 **`http://127.0.0.1:8088/`** — smoke / pub-sub host-local uniquement (voir **DRAFT** ci-dessous) |
| Versions backends | **mediapipe 0.10.14** (python ImageSegmenter selfie, delegate CPU) · harness navigateur tasks-vision : _Edge run matting non exécuté (bloqué)_ |

### Inventaire matériel (sondage — pas de FPS)

_Sondage local **2026-10-05** sur l’hôte connecté. Ne remplace pas le verrou profil tant que Loïc n’a pas tranché._

| Champ | `LAPTOP-BI8P2KF3` (CONNECTED) |
| --- | --- |
| État harness | S3 harness actif · **`http://127.0.0.1:8088/`** · navigateur **Edge** |
| OS | **Windows 11 Famille** |
| CPU | **11th Gen Intel Core i7-11370H** (4 cœurs) |
| GPU | **Intel Iris Xe** + **NVIDIA GeForce RTX 3070 Laptop GPU** |
| vs profil LOW-END (i5 + iGPU) | **Ne correspond pas** — classer les runs sur cette machine en **inventaire réel / MID-like** |
| Suite | Attendre Loïc : ajuster la cible LOW-END **ou** fournir une autre unité **i5 + iGPU** pour le pass officiel |

---

## Protocole (SPIKES S3)

Exécuter au minimum sur la **cible LOW-END** (pass officiel), et sur **MID** si la campagne le prévoit, pour **720p** et **1080p** (contraintes `getUserMedia` du harness).

1. **Mesures perf** : FPS matting (moyenne + p5), CPU %, GPU % si disponible (overlay harness + export CSV/JSON).
2. **Scénarios qualité** : lumière difficile (contre-jour / ombres), cheveux fins, gestes rapides (mains / tête).
3. **Couplage SFU** (après S1) : publier la piste détourée via le SFU retenu — **hors scope PREP** ; room test RTC requise.
4. **Fallback** : définir et valider seuils automatiques (ex. FPS matting &lt; 20 → disable matting, UX visible) ; tester que la session continue en vidéo brute.

Critères spike (référence, **non évalués ici**) :

- **Pass** : ≥ 24 FPS matting stable sur laptop **LOW-END** ; qualité OK jury 3 personnes ; fallback sans rupture de session.
- **Fail** : &lt; 15 FPS sur machines cibles → matting reporté / optionnel / offline only.

---

## Mesures (pass officiel Windows — LOW-END / MID)

_Runs **LOW-END officiels** : toujours **ouverts** (pas de ligne i5+iGPU). Ci-dessous : **MID inventaire réel** sur **`LAPTOP-BI8P2KF3`** — **python-mediapipe**, scope **`segment_for_video` uniquement** (pas RAF+canvas Edge). Chiffres issus des exports JSON ; ne pas extrapoler._

| device | OS | browser / runtime | camera res | backend (mediapipe \| webgpu \| wasm) | FPS avg | FPS p5 | CPU % | GPU % | notes | pass? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **LAPTOP-BI8P2KF3** · MID inventaire réel (i7-11370H + RTX 3070) · **≠ LOW-END** | Windows | **python-mediapipe** (ffmpeg-dshow) · **≠ Edge harness** | 1280×720 | mediapipe **CPU** | **174.0** | **194.3** | | | frameMsAvg **5.75** · frameMsP5 **5.15** · sampleCount **600** · boucle capture+infer ~**29 FPS** (cam 30 fps) ; headroom infer = fpsAvg · export `exports/mid-mediapipe-720.json` | **N/A** (MID inventaire ; pas pass LOW-END) |
| **LAPTOP-BI8P2KF3** · MID inventaire réel · **≠ LOW-END** | Windows | **python-mediapipe** | 1920×1080 (tentative) | mediapipe CPU | — | — | | | **BLOCKED** · `camera_max_720p` — LifeCam max **1280×720@30** · export `exports/mid-mediapipe-1080.json` | **BLOCKED** |

_Exporter les samples : harness Edge (bouton Export) quand débloqué ; runs python : `spikes/s3-matting-harness/exports/`._

---

## Matrice qualité (device × résolution × backend)

_Placeholder — à remplir après campagne de mesures._

| device ↓ / res × backend → | 720p MediaPipe | 720p WebGPU | 720p WASM | 1080p MediaPipe | 1080p WebGPU | 1080p WASM |
| --- | --- | --- | --- | --- | --- | --- |
| _LOW-END · Windows · i5 · iGPU (unité TBD si ≠ inventaire LAPTOP)_ | | | | | | |
| _MID / inventaire réel · LAPTOP-BI8P2KF3 · Win11 · i7-11370H · Iris Xe + RTX 3070 · LifeCam Cinema_ | **perf OK** (python mediapipe CPU **174** fpsAvg — voir Mesures ; qualité visuelle non jury : LifeCam / overhead → masque selfie surtout vert) | _non mesuré_ | _non mesuré_ | **BLOCKED** (cam max 720p) | _non mesuré_ | _non mesuré_ |
| _MID · Windows · i7 · dGPU (SKU TBD — autre unité)_ | | | | | | |
| _autre device_ | | | | | | |

Légende qualité subjective (à définir avant jury) : _ex. OK / limite / KO + commentaire court par cellule._

---

## BOX-ONLY provisional (hors pass officiel S3)

> **Ce bloc n’est pas le pass S3.** Aucun chiffre FPS matting officiel. Notes optionnelles depuis une box / environnement sans la cible Windows LOW-END (ex. smoke LiveKit synthétique uniquement).

| Élément | Valeur |
| --- | --- |
| Hôte connecté | **`LAPTOP-BI8P2KF3`** — harness **`http://127.0.0.1:8088/`** (Edge) ; matériel sondé **i7 + dGPU** → **MID-like**, pas LOW-END (détail : Inventaire) |
| Mesures FPS matting | **MID inventaire** : python-mediapipe **720p PASS** (fpsAvg **174.0**, export JSON) · **1080p BLOCKED** (cam) · Edge harness matting / CaptureStream navigateur : **bloqué** — **pas** LOW-END officiel |
| LiveKit smoke (synthétique) | Harness S3 : **Smoke synthétique** + publish vers `s1-lab` — voir `spikes/s3-matting-harness/README.md` · **DRAFT** pub/sub host-local Python (2026-10-05) : section ci-dessous |
| Conclusion pass/fail | **N/A** — pass officiel S3 reste sur **LOW-END** **i5 + iGPU** (unité à confirmer avec Loïc) |

### DRAFT — LiveKit laptop host-local pub/sub (2026-10-05)

> **DRAFT — smoke mesuré sur l’hôte lui-même** (soir **2026-10-05**, fuseau **Europe/Paris**). **Ce n’est pas le pass S3.** Hôte **`LAPTOP-BI8P2KF3`** (ASUS TUF Dash F15 · Win11 · i7-11370H · Iris Xe + RTX 3070) = **inventaire réel / MID-like** — **pas** la cible **LOW-END** verrouillée (i5 + iGPU). **LifeCam Cinema** branchée : **python-mediapipe 720p** mesuré (table **Mesures**) ; harness **Edge** matting + chemin **CaptureStream** matted **toujours bloqués** (frames n’avancent pas sous Playwright).

| Paramètre | Valeur (LAPTOP-BI8P2KF3) |
| --- | --- |
| SFU WebSocket | `ws://192.168.1.68:7880` (LAN) · aussi `ws://127.0.0.1:7880` |
| Token | `http://127.0.0.1:5190/api/token` |
| Room | `s1-lab` |
| Harness S3 (navigateur) | `http://127.0.0.1:8088/` |

**Smoke 1 — publish only (host-local)**

| Champ | Valeur |
| --- | --- |
| Identity | `vision-s3-laptop` |
| Track | `vision-s3-synth` — **Python** `livekit` **VideoSource** RGBA synthétique (**pas** MediaPipe navigateur / harness matting) |
| Durée / volume | ~**12 s** · **167** frames publiées · déconnexion OK |
| Résultat smoke | **PASS** (publish host-local) |

**Smoke 2 — publish + subscribe (host-local)**

| Champ | Valeur |
| --- | --- |
| Publisher identity / track | `vision-s3-pub` · `vision-s3-synth` |
| Subscriber identity | `vision-s3-sub` |
| Réception | track **`TR_VCzwELgi8QsDMf`** · `got_track=True` · ~**22** frames drainées · `connection_quality=2` |
| Résultat smoke | **PASS** (pub/sub host-local) |

_Interprétation : valide la chaîne SFU + token + pistes synthétiques sur la box laptop ; **ne remplace pas** le protocole S3 (FPS matting caméra sur **LOW-END**)._

---

## Pass / Fail

**Non déterminé (PREP).** Ne pas remplir avant fin de protocole sur **LOW-END** + go spike.

---

## Décision

_En attente._

---

## Coûts observés

_N/A pour matting client (pas de coût cloud direct). Coût SFU publish (étape 3) à croiser avec S1._

---

## Suite

- [x] Profil **LOW-END** verrouillé (Loïc) : Windows laptop **i5 + iGPU** (hostname **`LAPTOP-BI8P2KF3`** au verrou — **réconciliation inventaire en attente**)
- [x] **`LAPTOP-BI8P2KF3`** connecté ; harness S3 sur **`http://127.0.0.1:8088/`** (Edge) — inventaire réel **MID-like** (sondage 2026-10-05)
- [x] Profil **MID** verrouillé (Loïc) : Windows i7 + dGPU milieu de gamme · SKU **TBD**
- [ ] SKU / unité physique MID pour les runs
- [ ] Go lead post-S0
- [ ] Exécuter protocole via harness sur **LOW-END** ; remplir tables
- [ ] (Optionnel) Campagne **MID** + matrice qualité
- [ ] Jury qualité podcast (3 personnes)
- [ ] Seuils fallback documentés + test session
- [x] Chemin publish LiveKit OSS prêt (harness S3, optionnel) — **smoke box sans caméra** via piste synthétique (canvas + audio silencieux) ; défauts `ws://127.0.0.1:7880`, room `s1-lab`, identity `vision-s3`, token `http://127.0.0.1:5190/api/token` (forme S1 lab). Le harness RTC S1 (`:5190`) exige `getUserMedia` avant join — ne pas l’utiliser pour smoke headless ; utiliser `spikes/s3-matting-harness/` avec **Smoke synthétique** (défaut).
- [x] **DRAFT** smoke host-local **pub/sub** LiveKit sur **`LAPTOP-BI8P2KF3`** (2026-10-05) — Python synth **`vision-s3-synth`** · smoke 1 publish **PASS** · smoke 2 pub+sub **PASS** — détail : **BOX-ONLY → DRAFT LiveKit laptop** ; **MID-like**, **≠ LOW-END**, **≠ pass S3**
- [x] **MediaPipe 720p mesuré** (python-mediapipe, LifeCam, export `exports/mid-mediapipe-720.json`) — **MID inventaire** ; **≠** pass LOW-END officiel
- [ ] Harness **Edge** boucle matting (RAF+canvas) + **Export JSON navigateur** — **bloqué** (frames n’avancent pas ; CaptureStream matted path inchangé)
- [ ] **1080p** matting sur **`LAPTOP-BI8P2KF3`** — **bloqué** caméra (`camera_max_720p`) ; export `exports/mid-mediapipe-1080.json`
- [ ] Pass officiel **LOW-END** (i5 + iGPU, unité à confirmer) — protocole + tables **ouvert**
- [ ] Couplage publish SFU en conditions réelles (caméra + matting mesuré sur **LOW-END**)
- [ ] ADR / roadmap : débloquer Phase 3 seulement si S3 pass (ou no-go plan B explicite, SPIKES.md)

**Smoke box / inventaire réel ≠ pass S3** : FPS **720p** ci-dessus = **python-mediapipe MID inventaire uniquement** (chiffres JSON) ; le pass officiel reste le protocole sur **Windows LOW-END** · **i5 + iGPU** (unité physique à confirmer après arbitrage Loïc sur l’écart **`LAPTOP-BI8P2KF3`**).

**Livrables associés** : ce rapport + matrice device → qualité ; harness `spikes/s3-matting-harness/`.
