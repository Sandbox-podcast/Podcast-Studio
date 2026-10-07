# S4 desktop-ai : enregistrement 120 s, faux device Chromium (source synthétique, indicatif)

> **Copie repo (2026-10-07).** **Source synthétique, indicatif** : un seul run, sans vraie caméra.
> Les artefacts (enregistrement, remux, results.json, JSON d'analyse) restent sur la box d'analyse et ne sont **pas** commités.
> Les chemins `box …` désignent cette box. Banc : [`../desktop-nocreds/`](../desktop-nocreds/RUNBOOK.md).
> Outils : [`../analyze_ab.py`](../analyze_ab.py) et [`tools/distinct_fps.py`](../../../tools/distinct_fps.py) v2 (voir § Outils).

Edge 155 headless avec la caméra et le micro factices de Chromium (`--use-fake-device-for-media-stream=fps=30`). Pas de
vraie caméra : le motif vidéo est simple et le son est un bip. Le débit, la sync A/V et le distinct-fps **ne sont donc pas
représentatifs** d'une vraie caméra.

- **Objet** : `spike/s4-desktop/desktop-ai-synth-1791357738106` (WebM), bucket `podcast-recordings-poc`, MinIO laptop
  192.168.1.68:9000. Le résultat est dans `…desktop-ai-synth-1791357738106.results.json`.
- **Chemin** : recorder.js v2.2 **inchangé** (= [`../dropin/public/recorder.js`](../dropin/public/recorder.js), blob `2d892e7`)
  → `server-nocreds.mjs` sur desktop-ai. Les URLs presignées sont générées sur la box ; **aucun identifiant sur desktop-ai**.
  Les parts sont envoyées en PUT **navigateur → MinIO en direct**.
- **Réglages** : getUserMedia 1280×720@30 + micro factice · `video/webm;codecs=vp8,opus` · vBitrate demandé 2,5 Mbps ·
  audio 128 kbps · timeslice 1000 ms · parts 5 MiB · OPFS on · durationSec 120 · label `synth`.

## Chronologie (Europe/Paris, 07/10/2026)
| Événement | Heure |
|---|---|
| Create MPU (POST presigné) | 09:22:29 |
| Début d'enregistrement (wallStartIso) | 09:24:02.393 |
| Fin d'enregistrement (début + elapsed 120 037 ms, calculé) | 09:26:02.43 |
| Part 1 / 2 / 3 envoyées | 09:24:47.9 / 09:25:33.8 / 09:26:02.0 (181 / 159 / 193 ms) |
| **Complete refusé** (`InvalidPart`) | 09:26:02.736 |
| Nettoyage du lanceur (11 process tués, 0 restant, profil supprimé) | 09:26:05 |
| **Complete de récupération** OK, a posteriori (serveur corrigé, relancé seul) | 09:27:12 |

## Gates
| Gate | Valeur | Verdict |
|---|---|---|
| Durée | 120,036 s (cible 120) | PASS |
| Résolution / codec | vp8 1280×720 + opus 48 kHz mono | PASS |
| Perte de frames vs 30 fps | 0,03 % (3600 paquets, fps eff. 30,001) | PASS |
| Écart max / trous > 200 ms | 50,0 ms / 0 trou | PASS |
| Débit | 0,916 Mbps (recorder 0,916) ; gate analyseur ≥ 1 Mbps | FAIL (*source synthétique* : le faux motif se compresse bien en dessous de la cible de 2,5 Mbps) |
| distinct fps **v2**, seuil 0,3 | exact 30,001 / near 30,001 · fenêtres ≥ 24 = 1,0 (120 fenêtres, min 29, p5 29) · plus long near-dup 0 ms | PASS |
| distinct fps **v2**, seuil 0,5 | exact 30,001 / near 30,001 · fenêtres ≥ 24 = 1,0 (120 fenêtres, min 29, p5 29) · plus long near-dup 0 ms | PASS |
| sha256 upload | objet `b064db7a…c0dbf` = page localSha256 ; 13 746 618 o = localBytes | PASS (après la récupération, voir l'incident) |
| Remux `-map 0 -c copy` | rc 0, 0 warning, durée 120,036 s, **Cues présents** (source : segment de taille inconnue, sans Cues ; remux : Cues + 36 Clusters) | PASS |
| Garde audio | 12 000 échantillons vus, 1er à 38 ms, 0 issue ; opus 2000 paquets | PASS |
| Sync A/V (clap auto) | −669 ms | N/A : pas de clap dans la source factice. La détection a apparié le bip avec un pic de mouvement du motif. Indicatif seulement |
| upload / watchdog (results.json) | **completeOk = false**, 1 erreur (Complete refusé), 0 gap, watchdog MediaStreamTrackProcessor | **FAIL** à l'enregistrement ; objet complété a posteriori, byte-exact (voir l'incident) |

**Distinct-fps** : on craignait une sous-estimation des quasi-doublons. Elle ne s'est pas produite : le faux motif Chromium
change à chaque frame, ce qui donne 30,001 aux deux seuils. Avec une vraie caméra, le chiffre dépendra de la scène.

## Outils (correction de libellé)
- La première version de ce rapport (box) étiquetait « distinct fps v2 » des chiffres produits par la copie box de
  `tools/distinct_fps.py`. Cette copie est l'**ancienne v1** (blob `33c21ac`, sha256 `c449e287…` ; fenêtres 1 s sur hash
  exact), différente de `tools/distinct_fps.py` sur main.
- Les lignes v2 ci-dessus viennent de `tools/distinct_fps.py` **v2 de main** (blob `23bd6aa`, sha256 `577bdc3c…` ;
  near-distinct, taille native). Il a été lancé a posteriori sur la box le 07/10 vers 09:50 (Paris), aux seuils 0,3 et 0,5.
  La v1 donnait les **mêmes valeurs** (exact = near 30,001, fenêtres ≥ 24 = 1,0, min 29).
- L'analyse générale vient de la copie box d'`analyze_ab.py` (blob `4d4e3e7`, ≠ main `3a3c4da`). Elle appelle en interne la
  copie box v1 de `distinct_fps.py`.

## Incident : Complete refusé, puis complété a posteriori
- **Cause** : un bug dans `server-nocreds.mjs`, pas dans le recorder. MinIO renvoie les ETags de ListParts sous la forme
  `&#34;…&#34;` (entité XML numérique). Le décodage XML ne gérait que `&quot;`, et les ETags renvoyés au Complete étaient donc
  altérés → `InvalidPart`. La répétition sur la box avait utilisé un faux S3 qui émettait `&quot;`, d'où le bug manqué.
- **Les 3 parts étaient intactes** dans MinIO : 5 242 880 + 5 242 880 + 3 260 858 = 13 746 618 = localBytes.
- **Correctif** : décodage des entités numériques (inclus dans
  [`../desktop-nocreds/server-nocreds.mjs`](../desktop-nocreds/server-nocreds.mjs)). Le serveur corrigé a été relancé seul,
  sans nouvel enregistrement : list-parts → complete OK à 09:27:12, ETag `4bf995d0…-3`, HEAD 200.
- **Vérification** : sha256 de l'objet téléchargé = localSha256 calculé par la page à l'enregistrement → **byte-exact**.
- **Conséquence, en toute transparence** : ce run **n'est pas** un succès d'upload de bout en bout. Le Complete du
  recorder a échoué et l'objet n'existe que grâce à une complétion manuelle a posteriori. Le `results.json` (local et bucket)
  reflète l'état réel au moment de l'enregistrement : `completeOk=false`, `remoteContentLength=null`. **Il n'a pas été
  réécrit.** Le correctif a ensuite été validé par le run take4 (Complete OK du 1er coup, voir
  [`2026-10-07-desktop-ai-take4.md`](./2026-10-07-desktop-ai-take4.md)).

## Charge desktop-ai
- **Avant** (09:23:00) : CPU 17,4 % moy. / 40 % max (5×1 s) · GPU 25 %, encodeur 0 % · aucune app lourde visible.
- **Pendant** (09:24:30–40) : CPU 12,3 % moy. / 24 % max (10×1 s) · GPU 29–35 %, encodeur 0 % · nos process : 4 % d'un cœur
  logique en instantané, 273 Mo de mémoire privée.
- **Avant le test de fumée** (09:12) : CPU 9,8 % moy. / 15 % max · GPU 21 %.

## Artefacts (box, non commités)
`s4-ab/inbox-desktop-1791357738106/` (enregistrement, results.json, autorun-record.json, server-events.jsonl) ·
`s4-ab/out/desktop-synth-1791357738106/` (report-analyzer.md/.json, distinct_fps_t0.3/0.5.json = v1,
distinct_fps_v2native_t0.3/0.5.json = v2, remux, analysis.json).
