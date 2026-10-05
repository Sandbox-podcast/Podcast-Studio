# Spike S3 — Détourage client temps réel

**Date** : 2026-10-05  
**Auteur** : _à compléter_  
**Statut** : **PREP** — cible basse **verrouillée par Loïc** (voir Setup) ; en attente de (a) référence matérielle **mid** concrète (unité / génération i5 — **TBD**), (b) feu vert lead Podcast Studio post-S0 (D-00).

> **Aucune mesure ni conclusion pass/fail** dans ce document tant que l’unité de test mid est assignée et le go spike acté. Le harness local (`spikes/s3-matting-harness/`) est prêt pour les runs futurs uniquement.

---

## Hypothèse testée

Le détourage **côté client** (backends candidats : MediaPipe, WebGPU, WASM) peut atteindre **≥ 24 FPS** stables sur la **cible basse** : laptop **Windows**, **Intel Core i5** + **iGPU** (segment **mid** — référence exacte **TBD**), avec une qualité **subjectivement acceptable pour podcast** (jury interne), et un **fallback explicite** (désactivation du matting → caméra brute) qui **ne casse pas la session** live.

Alignement architecture : pipeline client décrit en [ARCHITECTURE.md §5](../docs/ARCHITECTURE.md) et décision [D-02](../docs/DECISIONS.md) (live + matting client ; post-prod serveur).

---

## Setup (devices, réseau, versions)

| Élément | Valeur |
| --- | --- |
| **Cible basse (Loïc)** | Laptop **Windows** · CPU **Intel Core i5** · **iGPU** · segment **mid** (**TBD** : modèle, génération i5, RAM, unité physique de test) |
| Devices (runs) | _vide — à renseigner une fois la référence mid assignée_ |
| OS / navigateurs | **Windows** (build / édition _TBD_) · navigateurs de campagne _TBD_ (ex. Chrome / Edge) |
| Caméra(s) testées | _vide_ |
| Harness | `spikes/s3-matting-harness/` (statique, hors produit) |
| Réseau | Local ; **pas** de publish SFU tant que S1 / room test RTC Podcast Studio |
| Versions backends | _à renseigner au run (MediaPipe tasks-vision, etc.)_ |

---

## Protocole (SPIKES S3)

Exécuter au minimum sur la **cible basse** ci-dessus (et tout autre device de l’inventaire interne), pour **720p** et **1080p** (contraintes `getUserMedia` du harness).

1. **Mesures perf** : FPS matting (moyenne + p5), CPU %, GPU % si disponible (overlay harness + export CSV/JSON).
2. **Scénarios qualité** : lumière difficile (contre-jour / ombres), cheveux fins, gestes rapides (mains / tête).
3. **Couplage SFU** (après S1) : publier la piste détourée via le SFU retenu — **hors scope PREP** ; room test RTC requise.
4. **Fallback** : définir et valider seuils automatiques (ex. FPS matting &lt; 20 → disable matting, UX visible) ; tester que la session continue en vidéo brute.

Critères spike (référence, **non évalués ici**) :

- **Pass** : ≥ 24 FPS matting stable sur laptop cible basse ; qualité OK jury 3 personnes ; fallback sans rupture de session.
- **Fail** : &lt; 15 FPS sur machines cibles → matting reporté / optionnel / offline only.

---

## Mesures

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
| _Windows · i5 · iGPU (mid TBD)_ | | | | | | |
| _autre device_ | | | | | | |

Légende qualité subjective (à définir avant jury) : _ex. OK / limite / KO + commentaire court par cellule._

---

## Pass / Fail

**Non déterminé (PREP).** Ne pas remplir avant fin de protocole sur unité mid + go spike.

---

## Décision

_En attente._

---

## Coûts observés

_N/A pour matting client (pas de coût cloud direct). Coût SFU publish (étape 3) à croiser avec S1._

---

## Suite

- [x] Profil cible basse verrouillé (Loïc) : Windows laptop i5 + iGPU, mid **TBD**
- [ ] Référence mid concrète + unité physique pour les runs
- [ ] Go lead post-S0
- [ ] Exécuter protocole via harness ; remplir tables
- [ ] Jury qualité podcast (3 personnes)
- [ ] Seuils fallback documentés + test session
- [ ] Couplage publish SFU (après S1 + room test)
- [ ] ADR / roadmap : débloquer Phase 3 seulement si S3 pass (ou no-go plan B explicite, SPIKES.md)

**Livrables associés** : ce rapport + matrice device → qualité ; harness `spikes/s3-matting-harness/`.
