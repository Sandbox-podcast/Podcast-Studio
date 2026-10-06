# S1 séquence alternée cam 2L-a · 3L-a · 2L-b · 3L-b — laptop seul, sans 2e publisher, sampling 1 s (2026-10-06 17:07:46–17:24:08 Paris)

Indicatif, 1 run par condition et par passe. **Pas de PASS/FAIL** (le Designer juge). Raw = autorité. Causes non prouvées = **NON VALIDÉ**.

- Laptop LAPTOP-BI8P2KF3 : LifeCam réelle. Scène : Loïc face caméra, parle et bouge les mains (même scène active sur les 4 runs).
  VP8, rec S4 ON (drop-in Media :3320), warmup 20 s, fenêtre 120 s. Séries getStats sur grille 1 s (120 samples par run),
  sampler CPU à 2 s. Room unique par run, abonnés ab-sub-hi (HIGH) + ab-sub-lo (LOW), pas de pub2, desktop-ai non touché.
- Runner : `run-cam-pair-lan.ps1 -Sequence -GoConfirmed` (dab4738), pause 60 s entre runs. Pré-check webcam libre + aucun
  process Vision/Media : OK avant les 4 runs (pair.log). CPU idle avant chaque run (WMI) : 12 / 21 / 17 / 21 %.
- Analyse : analyze-ab.py, align-bwe.py `--win-s 2.0` (ALIGN.w2.json, align-series.csv) et `--win-s 1.0` (ALIGN.w1.json),
  distinct_fps v2 + varsize t0.3/t0.5 sur sub-hi rx, gels > 200 ms, capture_loss.py (Media) sur le rec S4, BWE-STATS.json.

> **Décision lead 2026-10-06 17:40 :** simulcast 3L retenu pour le POC live (indicatif, N=2 par condition ; D-12, PR #13, OK Loïc en attente). Voir [`S1-verdict.md`](../../../../../S1-verdict.md#décision-lead-2026-10-06-1740--simulcast-3-couches-3l-pour-le-poc-live).

## Bornes exactes (Paris)

| run | fenêtre RTC | rec S4 | wallStartIso (UTC) | offset t_rec = t_RTC − x | objet S4 |
|---|---|---|---|---|---|
| 2L-a | 17:08:51.991 → 17:10:52.763 | 17:08:52.209 → 17:10:52.759 | 15:08:52.154Z | 0,163 s | ab-cam-2L-on-raw-1791299332154 |
| 3L-a | 17:13:11.600 → 17:15:12.413 | 17:13:11.912 → 17:15:12.409 | 15:13:11.836Z | 0,236 s | ab-cam-3L-on-raw-1791299591836 |
| 2L-b | 17:17:30.874 → 17:19:31.671 | 17:17:31.122 → 17:19:31.668 | 15:17:31.053Z | 0,179 s | ab-cam-2L-on-raw-1791299851053 |
| 3L-b | 17:21:50.292 → 17:23:51.151 | 17:21:50.625 → 17:23:51.148 | 15:21:50.514Z | 0,222 s | ab-cam-3L-on-raw-1791300110515 |

## Tableau par run

| | 2L-a | 3L-a | 2L-b | 3L-b |
|---|---|---|---|---|
| couche haute envoyée | **absente t=1→27 s**, 720p dès t=28 (rampe 2→30 fps jusqu'à t≈44), puis 720p30 | 720p30, 120/120 | 720p30, 120/120 (cible 1,08–1,27 Mbps jusqu'à t≈45, puis 1,7) | 720p30, 120/120 |
| QLR fenêtre (s) none / bandwidth / cpu | 92,1 / **26,9** / 0 | 119 / 0 / 0 | 119 / 0 / 0 | 119 / 0 / 0 |
| QLR bandwidth avant fenêtre (cumul au 1er sample, depuis publish) | **27,4 s** (none 1,4 s) → épisode total ≈ 54 s, début ≈ 1,4 s après publish (pendant le warmup, non échantillonné) | 1,2 s | 0,2 s | 1,4 s |
| onset / fin bandwidth (t fenêtre) | déjà actif à t=1 ; fin t=28,0 | — | — | — |
| availableOutgoingBitrate (kbps) 1er / min (t) / méd / final | 808 / **808 (t=1)** / 3 049 / 3 172 | 3 976 / 3 976 (t=1) / 4 018 / 4 136 | 1 384 / 1 384 (t=1) / 3 048 / 3 191 | 4 022 / 3 331 (t=32) / 3 951 / 4 002 |
| pente BWE | t=1→28 : **+4 kbps/s** (808→916) ; après t=28 rapide (≈ +7 %/s, 1 860→2 633 en 5 s) ; 90 % méd atteint t=46 | plateau | t=1→45 : **+4 kbps/s** (1 384→1 560) ; puis rapide t≈45→55 (1 560→2 799) ; 90 % méd t=55 | creux 4 022→3 331 à t=32, remonté à 90 % méd t=36 (≈ +70 kbps/s), pas de QLR |
| creux capture media-source < 24 fps (fps / fps_frames) | **0** (min 29 / 29) | **0** (28 / 27,8) | **0** (28 / 28,4) | **0** (28 / 27,9) |
| creux → bascule QLR (±2 s et ±1 s) | 0 → 0 ; la seule transition (bandwidth→none t=28) sans creux | 0 → 0 | 0 → 0 | 0 → 0 |
| sub-hi reçu | 180p 560 f → 720p 9 f → 180p 78 f → **720p 2 441 f** | 720p 3 582 f | 720p 3 585 f | 720p 3 576 f |
| part fenêtres 1 s ≥24 t0.3 / t0.5 | 0,658 / 0,658 | 0,992 / 0,983 | **1,000 / 1,000** | **1,000 / 1,000** |
| plafond capture (samples src ≥24) → ratio t0.3 | 1,000 → 0,658 | 1,000 → 0,992 | 1,000 → 1,000 | 1,000 → 1,000 |
| distinct near fps t0.3 / t0.5 | 25,73 / 25,73 | 29,83 / 29,74 | 29,88 / 29,83 | 29,80 / 29,74 |
| gels > 200 ms (t0.3 = t0.5) | 3 (1,41 s, max 639 ms ; t=28,6–29,9 = bascule 180p→720p) | 0 | 0 | 0 |
| freezeCount navigateur sub-hi (Δ) | 3 | 0 | 0 | 1 |
| sauts encodeur (enc < min(src,cap) − 3, QLR none) | h 15 (t=28–42) · q 17 (t=29–45) : tous dans la rampe de reprise | f 2 (t=10, 22) | h 1 (t=36) | f 2 (t=5, 31) |
| encodeur | SimulcastEncoderAdapter libvpx logiciel, h ~10 ms/f | f ~12 ms/f | h ~10 ms/f | f ~12 ms/f |
| CPU Edge pub / sub (machine, méd) | 16,1 % / 2,9 % | 20,0 % / 9,0 % | 17,7 % / 7,8 % | 18,6 % / 6,9 % |
| CPU machine total (méd) | 47,5 % | 63,0 % | 53,0 % | 56,5 % |
| perte rec S4 vs capture (capture_loss.py) clipped / net | 0,81 % / 0,0 % | 1,07 % / 0,0 % | 0,98 % / −0,06 % | 1,26 % / −0,08 % |

Perte S4 : avec des intervalles de 1 s, le biais de bord (±1 frame) pèse deux fois plus qu'à 2 s. Le plancher de bruit est égal
à la valeur clipped sur les 4 runs et la perte nette est d'environ 0 : aucune perte de frames n'est mesurable au-delà du bruit.

## Constats (mesurés)

1. **Les deux 3L sont stables.** 720p30 sur toute la fenêtre, QLR none, BWE déjà vers 4 Mbps dès t=1 (rampe terminée pendant le
   warmup), part ≥24 de 0,992 et 1,000, 0 gel. Un seul creux de BWE (3L-b t=32, −17 %) remonté en 4 s, sans effet sur les couches.
2. **Les deux 2L démarrent avec une BWE basse qui monte d'environ 4 kbps/s**, puis passent en montée rapide (≈ +7 %/s).
   - 2L-a : BWE 808 kbps à t=1 avec h coupé depuis ≈ 1,4 s après publish (27,4 s cumulés avant la fenêtre, 26,9 s dedans).
     h revient à t=28, quand la BWE atteint ≈ 916 kbps. Ensuite la montée rapide démarre, et la cible de h atteint 1,7 Mbps à t≈45.
   - 2L-b : BWE 1 384 kbps à t=1, au-dessus du seuil de h. h reste en 720p30 mais avec une cible réduite (1,08–1,27 Mbps)
     jusqu'à la montée rapide à t≈45–55. Aucun QLR, rien de visible côté sub-hi (part ≥24 1,000).
   - Même pente lente (~4 kbps/s) que l'épisode du 2L solo de 11:50 (714→853 kbps en 34 s, h jamais revenu dans la fenêtre).
3. **Aucun creux caméra sur les 4 runs** (media-source ≥ 28 fps sur les 480 samples à 1 s), et pourtant le 2L-a a passé ≈ 54 s en
   QLR bandwidth. Cet épisode n'est donc pas expliqué par un creux caméra dans la fenêtre. Son début, pendant le warmup, n'a pas
   été échantillonné. L'hypothèse « creux cam → chute débit → BWE basse » n'est ni confirmée ni infirmée par cette séquence (0 creux
   à tester). Elle n'est plus nécessaire pour expliquer une BWE basse en 2L.
4. **2L contre 3L, à scène égale :** sur cette séquence, la BWE basse ou lente n'apparaît qu'en 2L (2/2 passes), jamais en 3L
   (0/2). Plateau BWE : ≈ 3,05–3,19 Mbps en 2L contre ≈ 3,95–4,14 Mbps en 3L. 2 passes par condition : l'effet du nombre de couches
   sur la rampe BWE de démarrage reste **NON VALIDÉ**, car l'ordre et le hasard du démarrage ne sont pas séparés.
   Hypothèse à tester (NON VALIDÉE) : en 2L, l'estimateur reste dans sa phase d'augmentation lente tant que l'encodeur n'envoie
   pas près de l'estimation. Le padding de q en 2L-a monte jusqu'à ≈ 800 kbps ≈ BWE, sans accélérer la BWE.

Fichiers : `<run>/` (outbound-rid-series.csv targetBitrate/bytesSent/src_*, media-source-series.csv (ts, src_frames),
bwe-series.csv, inbound-series.csv, cpu.csv, ab-summary.json, AB-ANALYSIS.json, align-series.csv, ALIGN.w1/w2.json,
sub-hi .v2/.varsize/.freeze t0.3/t0.5, S4 results.json (wallStartIso) + s4-capture-loss.json), `BWE-STATS.json`, `pair.log`.
Webm (sub-hi rx + rec S4) non commités : box `/workspace/s1-soak/ab/seq-170746/<run>/` (+ `s4-rec/`) ; inbox Media
`/workspace/podcast-studio/s4-ab/inbox-seq170746/<run>/` + MANIFEST.txt ; laptop `scripts\ab\seq-20261006-170746\<run>\`.
