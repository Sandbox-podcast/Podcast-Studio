# S1 paire solo — ab-cam-2L-on + ab-cam-3L-on, laptop seul, SANS 2e publisher (2026-10-06 11:50–11:57 Paris)

Indicatif, 1 run par condition. **Pas de PASS/FAIL** (le Designer juge). Raw = autorité. Causes non prouvées = **NON VALIDÉ**.

- Laptop LAPTOP-BI8P2KF3 : LifeCam réelle, VP8, S4 rec ON (drop-in Media :3320), warmup 20 s / fenêtre 120 s / sample 2 s,
  **room par condition** (`s1-ab-cam-2L-on-095030`, `s1-ab-cam-3L-on-095351`), abonnés ab-sub-hi (HIGH) + ab-sub-lo (LOW) seulement,
  pas de ROOM/PUB2_ID → pas d'ab-sub-x, pas de `subFrom` = même setup que cam-3L-on 11:01 (dd99efb).
  desktop-ai non touché (Vision CUDA).
- Runner : `run-cam-pair-lan.ps1 -GoConfirmed -Room '' -Pub2Id ''` (vide = variable d'env supprimée ; `-DryParse` a confirmé
  `ROOM:(per-cond)`, `PUB2_ID:(none)`). Pré-check webcam libre + aucun process Vision/Media avant chaque condition : OK (pair.log).
  CPU idle avant lancement : 16 % (2L) / 17 % (3L), contre 28 % à 11:01.
- Nouveau (ce commit) : `ab-laptop.mjs` échantillonne côté publisher la candidate-pair sélectionnée de chaque RTCPeerConnection →
  `bwe-series.csv` (`availableOutgoingBitrate`, RTT, types de candidats) + bloc `bwe` dans ab-summary.json. **Pas = 1 s : sample 2 s**
  (le run était déjà lancé quand la consigne « par seconde » est arrivée ; non relancé). `targetBitrate` + `bytesSent` par rid étaient
  déjà dans outbound-rid-series.csv. Alignement : `align-bwe.py` → `<cond>/align-series.csv` + `<cond>/ALIGN.json`.
  `media-source-series.csv` inchangé (colonnes `ts`, `src_frames` conservées) ; results.json S4 garde `recording.wallStartIso`.

## Bornes exactes (Media)

| cond | fenêtre RTC (Paris) | rec S4 start → stop (Paris) | rec wallStartIso | offset mesuré t_rec = t_RTC − x |
|---|---|---|---|---|
| ab-cam-2L-on | 11:51:21.957 → 11:53:24.023 | 11:51:22.709 → 11:53:24.017 | 2026-10-06T09:51:22.545Z (11:51:22.545) | x = 0,588 s (capture_loss.py, ts) |
| ab-cam-3L-on | 11:54:41.011 → 11:56:42.868 | 11:54:41.513 → 11:56:42.865 | 2026-10-06T09:54:41.437Z (11:54:41.437) | x = 0,426 s |

Objets S4 : `spike/s4-dropin/ab-cam-2L-on-raw-1791280282546.{webm,results.json}`, `…/ab-cam-3L-on-raw-1791280481437.{webm,results.json}`.
Perte relative à la capture (capture_loss.py de Media) : 2L clipped 0,413 % (plancher 0,359 %, net −0,177 %) ; 3L 0,115 % (plancher 0,115 %, net −0,086 %).

## Tableau par condition

| | ab-cam-2L-on (solo) | ab-cam-3L-on (solo) | réf. cam-3L-on 11:01 |
|---|---|---|---|
| couche haute envoyée | h 720p30 jusqu'à t≈85 s, puis **coupée** (enc 0 fps t=89,0 → 121,5, ~34 s) | f 720p30, 59/59 samples | f 720p30, 59/59 |
| QLR haut (Δ durées, s) | none 82,6 · **bandwidth 36,1** · cpu 0 | none 118,2 · bandwidth 0 · cpu 0 | none 118,8 |
| availableOutgoingBitrate (kbps) min / méd / max | **714,5** / 3 762,6 / 3 804,2 | 2 775,1 / 3 791,6 / 3 881,6 | non loggé |
| capture media-source fps méd / min (fps_frames min) | 30 / 13 (16,5) ; 3 samples < 24 | 30 / 28 (28,9) ; 0 < 24 | non échantillonné |
| sub-hi reçu | 720p 2 386 f → **180p 403 f** | 720p 3 598 f | 720p 3 484 f |
| distinct near fps t0.3 / t0.5 | 21,96 / 18,13 | 29,76 / 25,03 | 28,72 / 27,46 |
| part fenêtres 1 s ≥24 t0.3 / t0.5 | 0,615 / 0,426 | **0,984** / 0,752 | 0,918 / 0,877 |
| plafond capture (samples src ≥24) → ratio t0.3 | 0,949 → 0,648 | 1,000 → 0,984 | n/a |
| gels > 200 ms t0.3 / t0.5 | 52 (14,8 s, max 465 ms ; 1 seul avant t=85 s) / 60 (25,4 s, max 631 ms) | **0** / 1 (254 ms) | 2 (0,43 s, max 225 ms) / 2 |
| sauts encodeur (enc < min(src,cap) − 3 avec QLR none) | h : 3 (t=7,0 · 36,0 · 38,1) ; q : 2 (t=36,0 · 84,9) | 0 sur f/h/q | n/a |
| encodeur | SimulcastEncoderAdapter (libvpx) logiciel, ~12,5 ms/f (h) | idem, ~11,4 ms/f (f) | idem |
| CPU Edge pub / sub (machine, méd) | 16,7 % / 7,9 % | 17,2 % / 6,0 % | — |
| ICE publisher | host/udp → prflx/udp, RTT 2 ms | idem | — |

## Bande passante QLR sans 2e publisher : OUI (2L), NON (3L)

- **2L solo** : bascule `none → bandwidth` sur h ET q à **t=87,0 s** (11:52:48.9), sans aucun pub2 dans la room ni abonnement HD
  du laptop à un autre flux. `availableOutgoingBitrate` passe de 3 804 à **714,5 kbps** dans le même intervalle, puis ne remonte
  que d'environ 4 kbps/s (852,6 kbps à t=121,5) → h (cible 1 700 kbps) reste coupé jusqu'à la fin de la fenêtre.
  → L'hypothèse « le flux HD de desktop-ai reçu par le laptop perturbe la BWE » **ne suffit pas à expliquer** la coupure :
  elle se reproduit sans lui. (Cause NON VALIDÉE.)
- **3L solo** : 0 s de QLR bandwidth ; deux creux de BWE (t=88,1 : 3 512 ; t=108,4 : 2 775 kbps) récupérés en 4–8 s, couche haute
  jamais coupée, aucun creux capture à ces instants.

## Coïncidences creux capture (media-source < 24 fps) ↔ bascule QLR / coupure couche, fenêtre ±1 sample (2 s)

| run | creux capture (t, src_fps / fps_frames) | événement | t | BWE (kbps) avant → après |
|---|---|---|---|---|
| solo 2L 11:51 | t=33,9 (13 / 16,5), t=36,0 (24 / 21,0) | **aucun** (QLR reste none ; h ralenti à 13–21 fps, kbps 909) | — | 3 762 → 3 762 / 3 804 (inchangé) |
| solo 2L 11:51 | t=84,9 (21 / 21,6), t=87,0 (22 / 18,6) | QLR none→bandwidth h+q | 87,0 | 3 804 → **714,5** |
| | | couche h enc → 0 fps | 89,0 | 722,9 |
| | | h résolution → absente | 91,0 | 730,2 |
| solo 3L 11:54 | aucun creux | aucun événement | — | creux BWE 3 512 (t=88,1) et 2 775 (t=108,4) sans QLR |
| paire 2L 11:32 (réanalyse) | t=8,6 (24 / 27,0), t=10,8 (21 / 17,3) | QLR none→bandwidth h+q | 10,8 | non loggé |
| | | h enc → 0 | 13,1 | — |
| paire 3L 11:35 (réanalyse) | t=31,0 (15 / 15,2), t=33,0 (24 / 21,4) | **aucun** (QLR none ; cible f tombe 1 700 → ~650 kbps) | — | non loggé |
| paire 3L 11:35 (réanalyse) | t=49,5 (25 / 27,0), t=51,7 (30 / 20,5) | QLR none→bandwidth f+h+q | 51,7 | non loggé |
| | | f enc → 0 | 53,7 | — |

Lecture (mesurée, cause **NON VALIDÉE**) :
- Les **3 bascules vers bandwidth** observées (2L 11:32 t=10,8 · 3L 11:35 t=51,7 · 2L solo t=87,0) tombent toutes dans un
  intervalle où la capture est sous 24 fps (au moins via fps_frames). **2 creux sur 5** n'ont déclenché aucune bascule
  (solo 2L t=33,9 pourtant le plus profond à 13 fps ; paire 3L t=31,0 à 15 fps).
- Dans le seul cas avec BWE loggée (solo 2L t=87,0), la séquence est : capture 21–22 fps et débit h envoyé en baisse
  (1 518 → 1 105 kbps à t=82,9–84,9) → BWE 3 804 → 714 kbps → QLR bandwidth → h coupé → remontée de la BWE très lente
  (~4 kbps/s). Compatible avec l'hypothèse « creux cam → débit envoyé chute → BWE baisse et ne remonte pas → couche haute coupée »,
  mais un seul cas, et le creux le plus profond (t=33,9) n'a pas fait bouger la BWE.
- Pendant les creux du 2L solo (11:51:55 et 11:52:47–49), le CPU machine (WMI _Total) était à 100 % ; mais il touche 100 % sur
  12 des 72 samples du run 2L (6/73 en 3L), souvent sans creux. QLR n'est jamais passé à `cpu`.
- Après une coupure, la couche restante la plus haute envoie bien au-dessus de sa cible (solo 2L : q 690–830 kbps pour une cible
  160 ; paire 3L : h 720–960 pour 450), ce qui ressemble à du sondage/padding de l'estimateur. NON VALIDÉ.

## Comparaison avec cam-3L-on 11:01 (dd99efb)

- **3L solo** est cohérent avec 11:01 : 720p30 sur 59/59 samples, QLR none sur toute la fenêtre, part ≥24 de 0,984 à t0.3
  (0,918 à 11:01), 0 gel à t0.3 (2 à 11:01). À t0.5, la part tombe à 0,752 (0,877 à 11:01) avec 1 gel de 254 ms.
- **2L solo** : pas de référence 2L à 11:01. Coupure de la couche haute sur les 34 dernières secondes, cause bandwidth sans pub2.
- Ordre des conditions inchangé (2L d'abord). Avec un run par condition, on ne peut pas encore séparer l'effet 2L/3L du hasard
  du moment (creux cam). NON VALIDÉ.

Fichiers : `<cond>/` (outbound-rid-series.csv avec targetBitrate/bytesSent/src_*/framesEncoded, media-source-series.csv,
bwe-series.csv, inbound-series.csv, cpu.csv, ab-summary.json, AB-ANALYSIS.json, align-series.csv, ALIGN.json,
sub-hi .v2/.varsize/.freeze t0.3/t0.5, S4 results.json + s4-capture-loss.json), `align-1131-reanalysis/` (alignement de la paire
11:31, sans BWE). Webm (sub-hi rx + rec S4) non commités : box `/workspace/s1-soak/ab/pair-solo-115020/<cond>/` (+ `s4-rec/`),
laptop `scripts\ab\pair-20261006-115020\<cond>\` ; copie des recs pour Media : `/workspace/podcast-studio/s4-ab/inbox-pairsolo1150/`.
