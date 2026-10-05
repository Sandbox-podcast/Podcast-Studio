# Spike S3 — Détourage client temps réel

**Date** : 2026-10-05  
**Auteur** : _à compléter_  
**Statut** : **PREP** — profils matériels **verrouillés par Loïc** (voir Setup) ; en attente de (a) SKU / modèle exact pour la **cible MID** (i7 + dGPU milieu de gamme — **TBD**), (b) feu vert lead Podcast Studio post-S0 (D-00).

> **Aucune mesure ni conclusion pass/fail** dans ce document tant que les runs officiels Windows ne sont pas exécutés sur la **cible LOW-END** et le go spike acté. Le harness local (`spikes/s3-matting-harness/`) est prêt pour les runs futurs uniquement.

---

## Hypothèse testée

Le détourage **côté client** (backends candidats : MediaPipe, WebGPU, WASM) peut atteindre **≥ 24 FPS** stables sur la **cible basse (LOW-END)** : laptop **Windows**, **Intel Core i5** + **iGPU**, unité **`LAPTOP-BI8P2KF3`**, avec une qualité **subjectivement acceptable pour podcast** (jury interne), et un **fallback explicite** (désactivation du matting → caméra brute) qui **ne casse pas la session** live.

La **cible MID** (Windows · **Intel Core i7** · **dGPU milieu de gamme**, SKU exact **TBD**) est documentée pour campagne complémentaire / matrice ; le **pass officiel S3** reste défini sur **LOW-END** ci-dessus.

Alignement architecture : pipeline client décrit en [ARCHITECTURE.md §5](../docs/ARCHITECTURE.md) et décision [D-02](../docs/DECISIONS.md) (live + matting client ; post-prod serveur).

---

## Setup (devices, réseau, versions)

| Élément | Valeur |
| --- | --- |
| **Cible LOW-END (Loïc) — pass officiel Windows** | Laptop **Windows** · CPU **Intel Core i5** · **iGPU** · hôte **`LAPTOP-BI8P2KF3`** |
| **Cible MID (Loïc)** | **Windows** · CPU **Intel Core i7** · **dGPU milieu de gamme** · SKU / modèle exact **TBD** |
| Devices (runs officiels) | _vide — à renseigner après runs sur LOW-END (+ MID si campagne étendue)_ |
| OS / navigateurs | **Windows** (build / édition _TBD_ par unité) · navigateurs de campagne _TBD_ (ex. Chrome / Edge) |
| Caméra(s) testées | _vide_ |
| Harness | `spikes/s3-matting-harness/` (statique, hors produit) |
| Réseau | Local ; publish SFU **optionnel** via harness S3 → LiveKit OSS S1 (`s1-lab`) — smoke seulement |
| Versions backends | _à renseigner au run (MediaPipe tasks-vision, etc.)_ |

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

_Table vide tant que les runs officiels ne sont pas faits. Ne pas inventer de FPS._

| device | OS | browser | camera res | backend (mediapipe \| webgpu \| wasm) | FPS avg | FPS p5 | CPU % | GPU % | notes | pass? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | | | | |
| | | | | | | | | | | |

_Exporter les samples depuis le harness (bouton Export) et coller / synthétiser ici après les runs._

---

## Matrice qualité (device × résolution × backend)

_Placeholder — à remplir après campagne de mesures._

| device ↓ / res × backend → | 720p MediaPipe | 720p WebGPU | 720p WASM | 1080p MediaPipe | 1080p WebGPU | 1080p WASM |
| --- | --- | --- | --- | --- | --- | --- |
| _LOW-END · Windows · i5 · iGPU · LAPTOP-BI8P2KF3_ | | | | | | |
| _MID · Windows · i7 · dGPU (SKU TBD)_ | | | | | | |
| _autre device_ | | | | | | |

Légende qualité subjective (à définir avant jury) : _ex. OK / limite / KO + commentaire court par cellule._

---

## BOX-ONLY provisional (hors pass officiel S3)

> **Ce bloc n’est pas le pass S3.** Aucun chiffre FPS matting officiel. Notes optionnelles depuis une box / environnement sans la cible Windows LOW-END (ex. smoke LiveKit synthétique uniquement).

| Élément | Valeur |
| --- | --- |
| Mesures FPS matting | _vide — non applicable sur smoke synthétique_ |
| LiveKit smoke (synthétique) | Harness S3 : **Smoke synthétique** + publish vers `s1-lab` / `vision-s3` — voir `spikes/s3-matting-harness/README.md` |
| Conclusion pass/fail | **N/A** — ne remplace pas le protocole sur **LOW-END** (`LAPTOP-BI8P2KF3`) |

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

- [x] Profil **LOW-END** verrouillé (Loïc) : Windows laptop i5 + iGPU · **`LAPTOP-BI8P2KF3`**
- [x] Profil **MID** verrouillé (Loïc) : Windows i7 + dGPU milieu de gamme · SKU **TBD**
- [ ] SKU / unité physique MID pour les runs
- [ ] Go lead post-S0
- [ ] Exécuter protocole via harness sur **LOW-END** ; remplir tables
- [ ] (Optionnel) Campagne **MID** + matrice qualité
- [ ] Jury qualité podcast (3 personnes)
- [ ] Seuils fallback documentés + test session
- [x] Chemin publish LiveKit OSS prêt (harness S3, optionnel) — **smoke box sans caméra** via piste synthétique (canvas + audio silencieux) ; défauts `ws://127.0.0.1:7880`, room `s1-lab`, identity `vision-s3`, token `http://127.0.0.1:5190/api/token` (forme S1 lab). Le harness RTC S1 (`:5190`) exige `getUserMedia` avant join — ne pas l’utiliser pour smoke headless ; utiliser `spikes/s3-matting-harness/` avec **Smoke synthétique** (défaut).
- [ ] Couplage publish SFU en conditions réelles (caméra + matting mesuré sur **LOW-END**)
- [ ] ADR / roadmap : débloquer Phase 3 seulement si S3 pass (ou no-go plan B explicite, SPIKES.md)

**Smoke box ≠ pass S3** : aucun chiffre FPS inventé ici ; le pass officiel reste le protocole sur **Windows LOW-END** · i5 + iGPU · **`LAPTOP-BI8P2KF3`**.

**Livrables associés** : ce rapport + matrice device → qualité ; harness `spikes/s3-matting-harness/`.
