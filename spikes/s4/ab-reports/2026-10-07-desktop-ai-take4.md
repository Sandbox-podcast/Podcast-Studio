# S4 desktop-ai : enregistrement 120 s alimenté par take4 (source fichier take4 (vraie cam en boucle), indicatif)

> **Copie repo (2026-10-07).** **Source fichier take4 (vraie cam en boucle), indicatif** : un seul run.
> Images caméra de Loïc : ce rapport ne contient **que du texte et des chiffres**. Aucune frame, image, empreinte par
> frame, ni audio ou vidéo n'est commité ; les artefacts restent sur la box d'analyse.
> Banc : [`../desktop-nocreds/`](../desktop-nocreds/RUNBOOK.md). Outils : [`../analyze_ab.py`](../analyze_ab.py) et
> [`tools/distinct_fps.py`](../../../tools/distinct_fps.py) v2 (voir § Outils).

Edge 155 headless sur desktop-ai. Le faux device Chromium est nourri par des fichiers (`run-s4.ps1 -VideoFile -AudioFile`) :
- vidéo : take4 720p30 en y4m, 1280×720, 30 fps, 600 frames, soit une boucle de 20 s ;
- audio : un wav de 20 s, qui est **une tonalité continue à 300 Hz, pas de la parole** (voir Sync A/V).

- **Objet** : `spike/s4-desktop/desktop-ai-take4-1791358605161` (WebM), 39 510 469 octets, ETag
  `"e3523cf40a3e57eed37b6e25b78f83de-8"` (8 parts), bucket `podcast-recordings-poc` (MinIO laptop). L'objet reste dans le
  bucket, avec `…take4-1791358605161.results.json`.
- **Chemin** : recorder.js v2.2 **inchangé** (= [`../dropin/public/recorder.js`](../dropin/public/recorder.js), blob `2d892e7`)
  → `server-nocreds.mjs`, avec les deux correctifs du run synth. Les URLs presignées sont générées sur la box ; aucun
  identifiant sur desktop-ai. Les parts sont envoyées en PUT navigateur → MinIO en direct.
- **Réglages** : `video/webm;codecs=vp8,opus` · vBitrate 2,5 Mbps · audio 128 kbps · timeslice 1000 ms · parts 5 MiB ·
  OPFS on · 120 s · label `synth` (valeur par défaut d'autorun ; la clé objet porte `take4`).
- **Entrées vérifiées** (sha256 sur desktop-ai) : vidéo `fae7f83d…0e90` (829 443 679 o) et audio `9d8785e6…335d`
  (1 920 078 o), conformes.

## Chronologie (Europe/Paris, 07/10/2026)
| Événement | Heure |
|---|---|
| Test de fumée avec les fichiers (5 s, sans upload) | 09:36:27–09:36:33 |
| Create MPU (POST presigné) | 09:36:54 |
| Début d'enregistrement (wallStartIso) | 09:37:48.230 |
| Fin d'enregistrement (début + 120 044 ms, calculé) | 09:39:48.274 |
| **Complete OK du 1er coup** (8 parts) | 09:39:48.383 |
| Nettoyage du lanceur (11 process tués, 0 restant, profil supprimé) | 09:39:51 |

## Points de boucle mesurés
**Méthode** : chaque frame enregistrée est appariée à la frame source la plus proche (luma 160×90, moyenne 8×8, L2). Une
boucle est la 1re frame après un saut arrière de l'index source de plus de 300 frames.
- **Boucles (s, depuis la 1re frame)** : **19.437, 39.460, 59.493, 79.526, 99.564, 119.603** (6 sauts, tous 599 → 0).
- **Période** : 20.023 / 20.033 / 20.033 / 20.038 / 20.039 s. Phase au début de l'enregistrement : frame source 17, soit 0.567 s.
- **Fiabilité** : pente 29.952 frames source/s. 100 % des frames sont à ±2 frames d'une droite (résidu médian 0.24, max 0.78).
- **Discontinuité** : le MAD entre frames consécutives aux boucles vaut 2.77–2.84, contre une médiane de 2.50. Le saut est
  faible : la fin et le début de la source se ressemblent.
- **Fenêtres exclues à ±3 s** : 16–22, 36–42, 56–62, 76–82, 96–102, 116–120. Les fenêtres pleines gardées sont au nombre de
  81. La fenêtre partielle 120 est déjà exclue.

## Gates : fichier complet vs hors boucle (±3 s)
| Gate | Fichier complet | Hors boucle | Verdict |
|---|---|---|---|
| Durée | 120.043 s (cible 120) | — | PASS |
| Résolution / codec | vp8 1280×720 + opus 48 kHz mono | — | PASS |
| Perte de frames vs 30 fps | 0.01 % (analyseur : 3601 paquets, fps eff. 30.002) | 0.0 % (2432 frames / 81 fenêtres pleines) | PASS / PASS |
| Écart max / trous > 200 ms | 48.0 ms / 0 | 48.0 ms / 0 | PASS / PASS |
| Débit (gate ≥ 1 Mbps) | 2.633 Mbps (recorder 2.633 ; flux vidéo 2.370) | 2.636 Mbps (vidéo 2.375) | PASS / PASS |
| distinct fps **v2**, seuil 0.3 | near 29.970 / exact 30.003 · share ≥ 24 = 1.0 (120 fenêtres pleines, min 29, p5 29) ; 0.9917 si la partielle est comptée | share ≥ 24 = 1.0 (81, min 29, p5 29) | PASS / PASS |
| distinct fps **v2**, seuil 0.5 | near 29.953 / exact 30.003 · share ≥ 24 = 1.0 (120, min 28, p5 29) ; 0.9917 si la partielle est comptée | share ≥ 24 = 1.0 (81, min 29, p5 29) | PASS / PASS |
| distinct fps **v1** (copie box, fenêtres sur hash exact), 0.3 / 0.5 | near 29.970 / 29.953 · share ≥ 24 = 1.0 (min 29) | — | PASS |
| Gels near-dup > 200 ms | aucun (le plus long : 2 frames, 30 ms) | aucun | PASS |
| sha256 upload | objet `d089b7a6…195f` = page localSha256 ; 39 510 469 o = localBytes = remote | — | PASS |
| Complete au 1er coup | `completeOk=true`, 0 erreur, 8/8 parts en 1 tentative (48–319 ms) | — | PASS |
| Remux `-map 0 -c copy` | rc 0, 0 warning, 120.043 s, **Cues présents** (36 Clusters ; la source est un segment de taille inconnue, sans Cues) | — | PASS |
| Garde audio | 12 001 échantillons vus, 1er à 39 ms, 0 issue ; opus 2000 paquets / 5 760 000 échantillons | — | PASS |
| Sync A/V | non mesurable | — | **N/A** (voir ci-dessous) |

**Pourquoi la sync A/V est N/A** : le wav take4 n'est pas de la parole. C'est une **tonalité continue à 300 Hz** :
- RMS de 0.0884 constant sur chacune des 20 secondes, pic à 0.125, aucun transitoire d'enveloppe ;
- donc ni clap ni transitoire, et le détecteur de clap d'analyze_ab rend « not measurable » ;
- une corrélation croisée audio contre source est ambiguë au pas de 3.33 ms de la tonalité ; ses résultats ont été écartés.

L'enregistrement contient bien la tonalité à 300 Hz, et non le bip par défaut de Chromium : le fichier audio a donc bien été
utilisé.

**Observation audio, NON VALIDÉ** ([issue #15](https://github.com/Sandbox-podcast/Podcast-Studio/issues/15)) : le RMS enregistré
passe de 0.0323 (1re seconde) à 0.0157, puis se stabilise à 0.0097 dès 3 s, soit environ **−10 dB**.
- **Hypothèse non vérifiée** : le traitement audio par défaut du navigateur (`autoGainControl` / `noiseSuppression` /
  `echoCancellation`, actifs avec `getUserMedia({audio:true})`) agit sur un signal stationnaire.
- La source étant une tonalité et non une voix, cette observation **ne permet aucune conclusion** sur le niveau d'une vraie
  voix.
- Le test A/B (contraintes par défaut vs AGC/NS/EC off, vraie voix + clap) est suivi dans #15. Rien ne change dans le
  recorder avant ce test.

## Outils
- **v2** = `tools/distinct_fps.py` de main (blob `23bd6aa`, sha256 `577bdc3c…` ; near-distinct, taille native). Il a été
  lancé depuis une copie box identique (même blob) et sert à l'exclusion des boucles.
- **v1** = copie box plus ancienne de `tools/distinct_fps.py` (blob `33c21ac`, sha256 `c449e287…` ; fenêtres 1 s sur hash
  exact). C'est elle qu'appelle la copie box d'`analyze_ab.py` (blob `4d4e3e7`, ≠ main `3a3c4da`).
- Les deux versions donnent PASS ici.
- Le script d'appariement et des points de boucle (`s4-ab/loop_take4_desktop.py`) est resté sur la box. Il n'est pas commité,
  car il lit les frames source.

## Charge desktop-ai
- **Avant** (09:37:34) : CPU 10.6 % moy. / 18 % max (5×1 s) · GPU 21 %, encodeur 0 %.
- **Pendant** (09:38:24–34) : CPU 18.5 % moy. / 42 % max (10×1 s) · GPU 21–24 %, encodeur 0 %. Nos process : 76 % d'un cœur
  logique en instantané (16 cœurs logiques au total), 258 Mo de mémoire privée.

## Nettoyage
Supprimés après l'analyse :
- sur desktop-ai : les fichiers source take4 copiés pour ce run, l'objet téléchargé et les URLs presignées ;
- sur la box : l'objet téléchargé (l'inbox ne garde que les JSON) et les URLs presignées.

L'objet reste dans le bucket MinIO.

## Artefacts (box, texte uniquement, non commités)
`s4-ab/inbox-desktop-take4-1791358605161/` (results.json, autorun-record.json) ·
`s4-ab/out/desktop-take4-1791358605161/` : report-analyzer.md/.json, loop-excluded.json, distinct_fps_tools_t0.3/0.5.json (v1),
distinct_fps_v2native_t0.3/0.5.json (v2), `desktop-ai-take4-1791358605161/{analysis.json, distinct_fps.json}`.
