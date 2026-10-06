# S4 LAN upload test: desktop-ai → MinIO laptop (06/10/2026, Europe/Paris)

- **Client** : `desktop-ai` (Windows, 192.168.1.168, Ethernet Realtek 2.5GbE, route vers 192.168.1.68 via `Ethernet`), PowerShell 7.6.6, .NET HttpClient.
- **Serveur** : MinIO sur LAPTOP-BI8P2KF3 `http://192.168.1.68:9000`, bucket `podcast-recordings-poc` (le laptop est en Wi-Fi, profil Privé).
- **Auth** : URLs presignées SigV4 (path-style, us-east-1, expiration 1 h), générées hors ligne sur la box (`presign.py`). **Aucun identifiant MinIO copié sur desktop-ai.** Les fichiers d'URLs presignées ont été supprimés de la box et de desktop-ai après le test.
- **Laptop** : non touché (aucune commande lancée dessus ; Vision faisait tourner DirectML en parallèle, ce qui a pu charger MinIO/le Wi-Fi). Aucun changement de pare-feu, aucune installation.
- Parts de 5 MiB, charge utile aléatoire (RNG crypto), un seul run par cas → **chiffres indicatifs**.

## 1. Joignabilité (11:16:44)
- `Test-NetConnection 192.168.1.68 -Port 9000` → TcpTestSucceeded **True** (source 192.168.1.168).
- `GET /minio/health/live` → **HTTP 200** en 53 ms.
- CreateMultipartUpload presigné (POST `?uploads`) → OK ×4 (11:17:55).

## 2. Débit d'upload multipart
| Cas | Heure | Parts | Total (incl. Complete) | Débit agrégé | Part 5 MiB médiane / p95 | Débit par part médian / p5 |
|---|---|---|---|---|---|---|
| A 64 MiB séquentiel | 11:19:08.3–11:19:09.9 | 13 | 1,62 s | 41,5 MB/s = 332 Mbps | 92,1 / 233,8 ms | 457 / 247 Mbps |
| B 256 MiB séquentiel | 11:19:09.9–11:19:14.8 | 52 | 4,87 s | 55,1 MB/s = 441 Mbps | 88,3 / 119,3 ms | 475 / 352 Mbps |
| D 256 MiB, 4 parts en vol | 11:19:14.8–11:19:18.1 | 52 | 3,35 s | 80,2 MB/s = 642 Mbps | 223,8 / 369,4 ms (max 1 552) | 187 / 114 Mbps par flux |

- 1re part de A : 376 ms (ouverture de connexion incluse). CompleteMultipartUpload : 15 ms (A), 18 ms (B), 29 ms (D).
- Par rapport au besoin S4 (≈2,5 Mbps par flux de rec), la marge est d'environ ×100 en séquentiel. La limite probable est le Wi-Fi du laptop ou MinIO sous Docker, desktop-ai étant en 2.5GbE. **Non vérifié.**

## 3. Reprise après coupure (cas C, 64 MiB, 13 parts)
- 11:19:18.150 : parts 1–6 envoyées (74–117 ms chacune).
- Part 7 annulée en plein transfert (CancelAfter 30 ms), puis le client HTTP est détruit, ce qui simule une coupure onglet/réseau. Coupure à **11:19:18.759**.
- Pause de 5 s, puis redémarrage à **11:19:23.764** avec un nouveau client. ListParts (138 ms) renvoie les parts **1–6**, de 5 242 880 octets chacune. La part 7, partielle, **n'a pas été conservée** par MinIO.
- Seules les parts manquantes 7–13 ont été envoyées (69–258 ms chacune), puis Complete (11 ms) avec les ETags de ListParts pour 1–6.
- **Du redémarrage à la fin : 1,443 s** (fin à 11:19:25.229). **Aucune part déjà présente n'a été renvoyée** (`resent_parts_already_present = []`). Seule la part 7, interrompue, est repartie, ce qui est normal.

## 4. Intégrité (11:19:27–11:19:45)
| Objet | HEAD taille = source | ETag HEAD = ETag multipart attendu (md5 des md5 des parts) | GET retour | sha256 identique |
|---|---|---|---|---|
| A | 67 108 864 ✔ | `d01f8943…-13` ✔ | 1,72 s | **oui** |
| B | 268 435 456 ✔ | `c62a6a3f…-52` ✔ | 6,60 s | **oui** |
| C (reprise) | 67 108 864 ✔ | `94b58ed8…-13` ✔ | 2,40 s | **oui** |
| D (parallèle) | 268 435 456 ✔ | `c62a6a3f…-52` ✔ | 7,57 s | **oui** |

Le GET retour vers desktop-ai, écriture disque comprise, tourne à environ 39–41 MB/s (A, B).

## 5. Nettoyage (11:20:30)
- DELETE sur les 4 objets `spike/s4-lan/lan-test-20261006-111730-*` → 204 ×4. ListObjects sur le préfixe → vide. ListMultipartUploads sur le préfixe → **aucun upload en attente**.
- `%TEMP%\s4-lan-test` supprimé sur desktop-ai (fichiers source, scripts, résultats).
- Les résultats bruts sont conservés sur la box : [`results-desktop-ai.json`](./results-desktop-ai.json) (copie compacte dans ce dossier).

## Limites
- Un seul run par cas, sans répétition. Le débit est mesuré pendant le run DirectML de Vision sur le laptop.
- Le client est en HttpClient .NET, pas en `fetch` navigateur : le chemin S4 réel (Edge, MediaRecorder, timeslices) n'est pas rejoué ici.
- La coupure est simulée par une annulation côté client, pas par une vraie coupure réseau ou Wi-Fi.

## Fichiers
`presign.py` (presigner SigV4 sans dépendance ; identifiants lus dans le fichier `.env` désigné par `$S4_ENV_FILE`, jamais en dur ; les URLs signées produites ne sont pas commitées), `step1-gen-create.ps1`, `step2-upload-resume-verify.ps1`, `step3-cleanup.ps1`, `plan.json`, [`results-desktop-ai.json`](./results-desktop-ai.json) (copie compacte dans ce dossier), `analyze.py`.
