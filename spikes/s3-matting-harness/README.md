# S3 matting harness (spike only)

Harness navigateur **statique** pour mesurer FPS / frame-time et prototyper les backends de détourage **hors code produit** Podcast Studio.

## Ouvrir en local

Depuis ce dossier :

```bash
# Option A — Python
python3 -m http.server 8080

# Option B — npx
npx --yes serve -p 8080
```

Puis ouvrir `http://localhost:8080/` (HTTPS non requis en local).

Servir via `file://` ne fonctionne en général pas (modules ES).

## Utilisation (matting / FPS)

1. Choisir la résolution cible (720p / 1080p) et la caméra.
2. Choisir le backend : **Mock** (toujours disponible), **MediaPipe** (CDN, modèle selfie), **WebGPU** / **WASM** (stubs — TODO).
3. Démarrer la caméra, puis **Start matting loop** pour lancer la boucle de traitement + overlay FPS.
4. **Fallback (raw camera)** : désactive le matting et affiche la vidéo brute (chemin d’échec UX).
5. **Export JSON** : exporte un snapshot des métriques samples (à coller dans `spikes/S3-matting.md`).

La caméra est **optionnelle** pour le chemin LiveKit smoke (voir ci-dessous).

## LiveKit publish (optionnel, S1 lab)

Prérequis sur la box / machine de dev :

- SFU LiveKit OSS : `ws://127.0.0.1:7880`
- Token S1 lab (même forme que `spikes/s1-lab/livekit-oss/server.mjs`) : `http://127.0.0.1:5190/api/token?room=s1-lab&identity=vision-s3`

Le harness RTC S1 sur `:5190` appelle `getUserMedia` avant `connect` — **inutilisable sur une box sans caméra/micro**. Utiliser **ce harness S3** pour le smoke publish.

### Smoke sans caméra (box partagée)

1. Servir ce dossier (ex. port `8080`).
2. Cocher **Activer publish LiveKit** (laisser **Smoke synthétique** coché — défaut).
3. Vérifier les défauts : URL `ws://127.0.0.1:7880`, room `s1-lab`, identity `vision-s3`, token URL `http://127.0.0.1:5190/api/token`.
4. **Connect / Publish** — aucun `getUserMedia` : vidéo = `canvas.captureStream`, audio = oscillateur silencieux (gain 0).
5. Vérifier dans un autre client S1 (avec caméra) ou les stats room que `vision-s3` publie.

Si le token API est sur une autre origine (CORS), coller un JWT dans le champ prévu (ou `npm run mint-token` dans le lab S1).

### Publier la vraie caméra / matting

Décocher **Smoke synthétique**, démarrer la caméra, lancer la boucle matting : la piste publiée suit le canvas matting (ou la caméra brute si fallback).

**Ce smoke ≠ pass S3** — ne pas confondre avec le pass **LOW-END** (i5 + iGPU). `LAPTOP-BI8P2KF3` = inventaire **MID-like** ; **python-mediapipe 720p** mesuré (export `exports/mid-mediapipe-720.json`) — voir **Mesures** dans `spikes/S3-matting.md`. Harness **Edge** matting (`:8088`) : **bloqué** (frames n’avancent pas).

**DRAFT (2026-10-05)** : smoke **host-local pub/sub** mesuré sur le laptop (Python `VideoSource` synthétique, pas MediaPipe) — **`PASS`** publish + pub/sub, **sans caméra / sans FPS** — voir **`spikes/S3-matting.md` → BOX-ONLY → DRAFT — LiveKit laptop host-local pub/sub (2026-10-05)**.

## Ce qu’il ne faut **pas** faire (PREP)

- Ne pas intégrer ce dossier dans l’app produit.
- Ne pas reporter de chiffres FPS « officiels » dans le spike report sans run sur l’inventaire machines validé.

## Fichiers

- `index.html` — page unique
- `js/harness.js` — caméra, métriques, export, orchestration
- `js/backends.js` — stubs MediaPipe / WebGPU / WASM + mock alpha
- `js/livekit-publish.js` — client LiveKit OSS (CDN `livekit-client`)
- `js/synthetic-media.js` — canvas + audio silencieux pour smoke sans périphérique

## MediaPipe

Le backend MediaPipe charge `@mediapipe/tasks-vision` depuis jsDelivr et le modèle selfie depuis Google Cloud Storage. Connexion réseau requise au premier chargement. En cas d’échec, utiliser **Mock** pour valider le harness (FPS sur composite simulé).
