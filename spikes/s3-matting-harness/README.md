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

Puis ouvrir `http://localhost:8080/` (HTTPS non requis en local ; `getUserMedia` demande une permission caméra).

Servir via `file://` ne fonctionne en général pas (modules ES + caméra).

## Utilisation

1. Choisir la résolution cible (720p / 1080p) et la caméra.
2. Choisir le backend : **Mock** (toujours disponible), **MediaPipe** (CDN, modèle selfie), **WebGPU** / **WASM** (stubs — TODO).
3. Démarrer la caméra, puis **Start matting loop** pour lancer la boucle de traitement + overlay FPS.
4. **Fallback (raw camera)** : désactive le matting et affiche la vidéo brute (chemin d’échec UX).
5. **Export JSON** : exporte un snapshot des métriques samples (à coller dans `spikes/S3-matting.md`).

## Ce qu’il ne faut **pas** faire (PREP)

- Ne pas intégrer ce dossier dans l’app produit.
- Ne pas ajouter le SDK SFU ni publier vers une room tant que **S1** n’a pas fourni un SFU + **room test RTC** Podcast Studio.
- Ne pas reporter de chiffres FPS « officiels » dans le spike report sans run sur l’inventaire machines validé.

## Fichiers

- `index.html` — page unique
- `js/harness.js` — caméra, métriques, export, orchestration
- `js/backends.js` — stubs MediaPipe / WebGPU / WASM + mock alpha

## MediaPipe

Le backend MediaPipe charge `@mediapipe/tasks-vision` depuis jsDelivr et le modèle selfie depuis Google Cloud Storage. Connexion réseau requise au premier chargement. En cas d’échec, utiliser **Mock** pour valider le harness (FPS sur composite simulé).
