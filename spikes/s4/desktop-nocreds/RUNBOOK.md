# S4 desktop-nocreds: enregistrement headless sans identifiants sur la machine d'enregistrement

Utilisé le 2026-10-07 sur **desktop-ai** (Windows, Edge 155, Node existant, **aucune installation**).
Rapports : [`../ab-reports/2026-10-07-desktop-ai-synth.md`](../ab-reports/2026-10-07-desktop-ai-synth.md) et
[`../ab-reports/2026-10-07-desktop-ai-take4.md`](../ab-reports/2026-10-07-desktop-ai-take4.md).

## Principe
- **Box** (machine qui détient le `.env` MinIO) : `presign_desktop.py` génère des URLs presignées SigV4 (2 h par défaut)
  avec [`../lan-upload/presign.py`](../lan-upload/presign.py). Les creds sont lus **uniquement** dans le fichier désigné par
  `S4_ENV_FILE`, jamais en dur, jamais affichés.
- **Machine d'enregistrement** : elle ne reçoit **que** `create.json` puis `urls.json` (URLs presignées). Jamais de `.env`,
  de clé ou d'access key ID. `server-nocreds.mjs` (Node seul, zéro dépendance npm) expose la même API que
  [`../dropin/server.mjs`](../dropin/server.mjs) ; chaque appel S3 utilise une URL presignée.
- Les parts sont envoyées **navigateur → MinIO en direct** (PUT presigné, comme les runs S4 précédents). `-ProxyParts` sert de repli.
- **Recorder** : [`../dropin/public/recorder.js`](../dropin/public/recorder.js) v2.2 **inchangé**, non dupliqué ici.
  `server-nocreds.mjs` sert `/recorder.js` en cherchant dans cet ordre :
  1. `public/recorder.js` (copie posée sur la machine cible) ;
  2. `$env:S4_RECORDER_JS` ;
  3. `../dropin/public/recorder.js` (si le dossier `spikes/s4/` du repo est présent tel quel).

  `/api/health` renvoie le chemin dans `recorderJs`. `run-s4.ps1` s'arrête si le recorder est introuvable.
- **Pilote** : `public/autorun.html`, avec `?mode=smoke|record&dur=&w=&h=&fps=&vbr=&mime=&label=`.
  Il appelle `S4Recorder.startSession({ partMiB: 5, timeslice: 1000, opfs: true, … })`.
- **Edge** : headless séparé, avec un profil temporaire `%TEMP%\s4-edge-profile-<stamp>`. Caméra et micro factices Chromium
  (`--use-fake-device-for-media-stream=fps=30 --use-fake-ui-for-media-stream`). Les options `-VideoFile` (fichier y4m) et
  `-AudioFile` (fichier wav) alimentent ce faux device depuis des fichiers.
  Le lanceur ne tue **que** ses propres process : Edge dont la ligne de commande contient le profil temporaire, et node
  qui exécute ce `server-nocreds.mjs`. Il supprime ensuite le profil. Il ne touche jamais aux fenêtres ni au profil Edge
  de l'utilisateur.

## Fichiers
| Fichier | Où | Rôle |
|---|---|---|
| `presign_desktop.py` | box | `step-a` (clé + POST `?uploads`), `step-b UPLOAD_ID` (parts 1..N, list, complete, abort, head, get, results), `probe KEY…` (HEAD/GET 15 min) |
| `server-nocreds.mjs` | cible | API `/api/multipart/*`, `/api/results` (out\ local + PUT presigné), `/api/autorun/*`, `/proxy/part` |
| `public/autorun.html` | cible | modes smoke (2 s local, aucun upload) et record |
| `run-s4.ps1` | cible | lanceur : vérifie l'expiration des URLs, démarre node + Edge, attend la fin, nettoie |
| `abort-s4.ps1` | cible | arrêt d'urgence : tue nos process, supprime le profil, DELETE-abort du multipart (`-KeepUpload` pour le garder) |
| `create-mpu.ps1` | cible | exécute le POST `?uploads` presigné et affiche `UPLOAD_ID` |
| `fetch-object.ps1` | cible | HEAD + GET de l'objet et du results.json, sha256 comparé au `localSha256` de la page |
| `cors-check.ps1` | cible | OPTIONS non signé (preflight PUT depuis `http://localhost:<port>`), lecture seule |

## Pré-requis
- **MinIO** : `MINIO_API_CORS_ALLOW_ORIGIN=*` (origine reflétée, `ETag` exposé). Le vérifier avec `.\cors-check.ps1`.
- **Cible** : Node présent (`-Node`, défaut `C:\nvm4w\nodejs\node.exe`) et Edge (`-Edge`). PowerShell 7
  (`-SkipHttpErrorCheck`). Aucune installation.

## Séquence (run du 2026-10-07)
Dossier de travail sur la cible : par exemple `%USERPROFILE%\podcast-studio\s4-desktop-run\`. Y copier le contenu de ce
dossier, puis `spikes/s4/dropin/public/recorder.js` vers `public\recorder.js` (ou définir `S4_RECORDER_JS`).
La box n'a pas besoin du repo complet : seulement `desktop-nocreds/` et `lan-upload/presign.py` côte à côte.

0. Cible : `.\run-s4.ps1 -Mode smoke`. Il dure moins de 5 s et n'écrit rien dans MinIO (mode forcé sans `urls.json`).
   Contrôle de charge avant le run : CPU moyen ≤ 40 %.
1. Box : `S4_ENV_FILE=<chemin du .env MinIO> python3 presign_desktop.py step-a --name <synth|take4>`
   → `handoff/create.json` (fichier en 600).
2. Copier `create.json` dans le dossier de travail de la cible.
3. Cible : `.\create-mpu.ps1` → affiche `UPLOAD_ID=…`.
4. Box : `S4_ENV_FILE=… python3 presign_desktop.py step-b <UPLOAD_ID>` → `handoff/urls.json` (parts 1..60). Vérifier que
   l'uploadId recopié est bien le bon.
5. Copier `urls.json` dans le dossier de travail de la cible.
6. Cible : `.\run-s4.ps1 -Mode record -Dur 120`. Il bloque environ 2,5 min (timeout = dur + 180 s) et affiche autorun-record.json.
   Pour le run take4 : `-VideoFile <y4m> -AudioFile <wav>`.
   **Urgence** : `.\abort-s4.ps1` (ou `-KeepUpload`).
7. Cible : `.\fetch-object.ps1` → objet et results.json dans `out\`, avec la comparaison sha256.
8. Copier l'objet et le results.json vers la box (`s4-ab/inbox-desktop-<ms>/`), puis
   `python3 analyze_ab.py --source inbox --inbox inbox-desktop-<ms> --filter desktop-ai-<name>- --tag desktop-<name>-<ms>`.
   Ensuite, `tools/distinct_fps.py` aux seuils 0.3 et 0.5.
9. Nettoyage :
   - cible : supprimer `urls.json`, `create.json`, `upload-id.txt`, l'objet téléchargé dans `out\` et les fichiers
     média éventuels ;
   - box : supprimer `handoff/*.json`.
   L'objet reste dans le bucket.

## Correctifs après le run 1 (2026-10-07), déjà inclus ici
- `run-s4.ps1` : `expiresAt` est lu comme chaîne ISO brute et parsé avec InvariantCulture. Avant, `ConvertFrom-Json`
  (PS7) en locale fr-FR inversait jour et mois → faux « expired ».
- `server-nocreds.mjs` : le décodage XML gère maintenant les entités numériques. MinIO renvoie l'ETag de ListParts sous la
  forme `&#34;…&#34;` ; sans ce décodage, Complete → `InvalidPart`. La répétition sur un faux S3 qui émettait `&quot;`
  n'avait pas détecté le bug.

## Changements post-run (repo uniquement, non exercés sur desktop-ai)
Ces changements ont été testés sur la box : `node --check`, tests HTTP du serveur, parse PowerShell 7.4 et
`presign_desktop.py` avec un `.env` factice.
- `recorder.js` est résolu hors du dossier (voir plus haut) ; les runs du 07/10 utilisaient une copie identique dans `public/`.
- Ajout de `run-s4.ps1 -Label/-Node/-Edge` et de `autorun.html ?label=` (défaut `synth`, comme les deux runs).
- Clé results dérivée par remplacement de l'extension (même résultat que pendant les runs).
- `cors-check.ps1 -Endpoint/-Bucket` (défauts identiques au run). `fetch-object.ps1` utilise `ChangeExtension`.
- `presign_desktop.py` utilise `../lan-upload/presign.py` (S4_ENV_FILE, MINIO_HOST) au lieu d'un chemin box en dur.
  Il ajoute `--out-dir`/`S4_HANDOFF_DIR` et `--ext`.

## Hygiène
- Ne jamais commiter `create.json`, `urls.json`, `probe.json`, `upload-id.txt`, `out/` ou `pids.json`. Ils contiennent des
  URLs presignées ou des résultats locaux.
- Aucun média dans le repo, en particulier les images caméra de Loïc (run take4).
