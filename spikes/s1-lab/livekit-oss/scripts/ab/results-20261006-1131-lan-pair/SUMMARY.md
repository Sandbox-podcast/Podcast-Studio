# S1 LAN pair — ab-cam-2L-on + ab-cam-3L-on, laptop + desktop-ai pub2 (2026-10-06 11:31–11:38 Paris)

Indicatif, 1 run par condition. **Pas de PASS/FAIL** (Designer juge). Raw = autorité.

- Laptop LAPTOP-BI8P2KF3 : LifeCam réelle, VP8, S4 rec ON (drop-in Media :3320), warmup 20 s / fenêtre 120 s / sample 2 s,
  room `s1-lan-pair-1129`. Abonnés : ab-sub-hi (HIGH, ab-pub seul), ab-sub-lo (LOW, ab-pub seul), ab-sub-x (HIGH, pub2 seul).
- desktop-ai : pub2 `pub2-desktop-ai`, fichier take4-raw.webm (sha256 c7289b23…, identique au laptop) en boucle, 2 couches,
  VP8, pas de rec, Edge de test (profil temp), harness servi en localhost:5191, token pré-minté (mint-token.mjs sur le laptop).
- Webcam libre et aucun process Vision/Media actif avant chaque condition (pair.log).

| cond | fenêtre (Paris) | src cam fps méd/min (plafond ≥24) | couche haute envoyée | QLR haut (s) | sub-hi reçu | distinct near fps t0.3 / t0.5 | part ≥24 t0.3 / t0.5 | ratio ≥24 / plafond (t0.3) | gels >200 ms t0.3 / t0.5 | sub-x (pub2 LAN) t0.3 |
|---|---|---|---|---|---|---|---|---|---|---|
| ab-cam-2L-on | 11:32:14.140 → 11:34:18.869 | 30 / 21 (0,983) | **coupée t≈10,8–49,7 s** (enc 0 fps), sinon 720p30 | bandwidth 38,5 · none 80,5 | 720p 267 f → **180p 669 f** → 720p 1797 f | 21,34 / 17,73 | 0,533 / 0,385 | 0,542 | 41 (14,2 s, max 705 ms) / 54 (21,9 s) | 720p 3666 f, 28,68 fps, ≥24 0,992, 0 gel, 0 perte |
| ab-cam-3L-on | 11:35:39.181 → 11:37:40.947 | 30 / 15 (0,983) | **coupée t≈49,5–110,7 s**, sinon 720p30 | bandwidth 60,3 · none 58,2 | 720p 1353 f → **360p 1230 f** → 720p 8 f | 20,48 / 18,52 | 0,339 / 0,298 | 0,345 | 9 (2,8 s, max 589 ms) / 25 (7,7 s) | 720p 3638 f, 28,69 fps, ≥24 0,992, 0 gel (t0.3), 0 perte |
| réf. cam-3L-on 11:01 (sans pub2) | 11:01:41.267 → 11:03:43.318 | non échantillonné | 720p30 continu | none 118,8 | 720p 3484 f | 28,72 / 27,46 | 0,918 / 0,877 | n/a | 2 (432 ms, max 225 ms) / 2 | — |

Constats (mesurés, cause NON VALIDÉE) :
- Sur les deux conditions, l'estimateur de bande passante du publisher laptop (`qualityLimitationReason=bandwidth`) a **suspendu la
  couche haute** pendant 38 s (2L) et ~60 s (3L) ; l'abonné HD a alors reçu 180p (2L) ou 360p (3L). Pendant ces épisodes la capture
  `media-source` restait à 29–30 fps : ce n'est pas la cam. 0 paquet perdu côté abonnés. Non vu à 11:01 (sans pub2).
- Détecteur « encodeur qui saute sans QLR » (enc < min(src, cap) − 3 avec qlr=none), couche haute : 2L = 9 (ab-summary) à 11 (AB-ANALYSIS)
  intervalles, surtout la rampe de reprise t≈49–64 s (cible 600→1 700 kbps) puis t≈74–76 s et 93 s ; 3L = 3 intervalles :
  t≈31 s (la cam elle-même à 15 fps) et t≈45–48 s, juste avant la coupure (cible ~600 kbps, qlr encore none).
- Creux cam observés via media-source : 2L t≈10,8 s (21 fps), 3L t≈31 s (15 fps) → la cam peut bien baisser seule ponctuellement.
- desktop-ai pub2 : 720p30 envoyé en continu, QLR none 100 %, enc 30/20 fps (h/q), 0 intervalle de saut, encodeur
  SimulcastEncoderAdapter (libvpx, libvpx) logiciel, ~14–15 ms/frame. Edge de test : 5,3–5,5 % machine (méd), ~85–89 % d'un cœur ;
  GPU NVIDIA machine-wide méd 31–33 % (inclut l'activité hors test), NVENC 0 %.
- ICE desktop-ai → laptop : **UDP**, distant `host` 192.168.1.68:50042/50173 (plage 50000–50200), local `prflx` 172.19.0.1
  (adresse vue par LiveKit derrière le NAT Docker du laptop), RTT 3–4 ms. Pas de repli TCP 7881, pas de relais.

Fichiers : `<cond>/` (outbound-rid-series.csv avec src_*/framesEncoded, media-source-series.csv, inbound-series.csv avec ab-sub-x,
cpu.csv, ab-summary.json, AB-ANALYSIS.json, sub-hi|sub-x .v2/.varsize/.freeze t0.3/t0.5), `pub2/` (pub2-samples.jsonl + CSV dérivés,
pub2-cpu.csv, PUB2-ANALYSIS.json). Webm reçus (sub-hi, sub-x) non commités : box `/workspace/s1-soak/ab/pair-113112/<cond>/`
et laptop `scripts\ab\pair-20261006-113112\<cond>\`.
