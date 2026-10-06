# Décisions verrouillées (ADR léger)

Date : 2026-10-05  
Repo : [Sandbox-podcast/Podcast-Studio](https://github.com/Sandbox-podcast/Podcast-Studio)

Ces décisions structurent l’architecture. Ne pas les changer silencieusement ; ouvrir un ADR amendé si besoin.

| ID | Sujet | Choix | Impact |
| --- | --- | --- | --- |
| D-00 | Approche initiale | Architecture détaillée + roadmap phasée + spikes, **peu de code produit** | Pas de MVP feature avant validation des spikes critiques |
| D-01 | Stockage média | **Hybride** : object storage S3-compatible pour les masters ; service vidéo managé pour delivery / transcode / preview | Masters contrôlés ; delivery et ABR délégués |
| D-02 | Traitement vidéo / IA | **Hybride** : live + détourage côté client ; post-prod IA + transcodes côté serveur | Latence live maîtrisée ; coûts GPU/IA isolés du live |
| D-03 | Collaboration | **Comptes utilisateur + rôles structurés** (animateur, modérateur, invité, opérateur) | Auth obligatoire ; modèle Episode / Session / Membership |
| D-04 | Déploiement | **Cloud public** | SFU, workers et storage managés ou cloud-native |
| D-05 | Monétisation | **Usage interne / entreprise** (Sandbox) | Pas de multi-tenant commercial v1 ; auth/org simple suffisante |

## Implications concrètes

- Pas de sessions anonymes en v1.
- Pas d’objectif self-hosted pour le live.
- Le « wow » studio virtuel reste un **spike** avant engagement produit.
- La publication multi-plateformes et le montage IA ne sont **pas** dans le chemin critique du live.

## Décisions du 2026-10-06 (post-spikes nuit)

Décidées par Loïc le 2026-10-06 — lead : Podcast Studio.

| ID | Sujet | Choix | Impact |
| --- | --- | --- | --- |
| D-06 | Master HQ | **Piste brute caméra + micro enregistrée en local (re-détourable)**. Détourage livré en async côté serveur avec RVM (post-process E2-fgr = candidat POC ; FAIL connu en mouvement, main fantôme ~33–34 s, qualité à améliorer). Le canvas détouré navigateur n'est **pas** le master (son rec FAIL : ~14 fps, 53 % de perte) | Le master reste re-détourable ; qualité du détourage indépendante du live |
| D-07 | Codec rec S4 | **VP8/WebM conservé (lock S4 inchangé)**. H.264 MediaRecorder (QuickSync confirmé, ~36 pts de CPU en moins, aucun gain live mesuré sur 1 run) **non adopté** | Pas d'amendement S4 |
| D-08 | Détourage live | Lock Phase 0 « détourage live côté client » (D-02) **inchangé pour l'instant** ; décision d'amendement (détourage live régie ou serveur) **reportée aux chiffres GPU** (DirectML sur RTX 3070 Laptop maintenant, puis CUDA en venv isolé — approuvé). Détourage client navigateur mesuré FAIL (invité ~15–16 fps MID ; régie en échec dès N=2 flux) | D-02 à réévaluer après chiffres GPU |
| D-09 | Critère UI Phase 1 | Indicateur de rec persistant, alerte « enregistrement possiblement interrompu pendant X s » au retour d'un onglet invité depuis l'arrière-plan, et marqueur de trou sur la timeline régie alimenté par le watchdog S4 `results.gaps` (trou de 27,2 s observé). Issue dédiée : issue à venir (Designer) | Critère d'acceptation Phase 1 |
| D-10 | Test LAN multi-machines | LiveKit et MinIO restent sur le laptop labo LAPTOP-BI8P2KF3 (192.168.1.68) ; règles pare-feu Windows entrantes approuvées (TCP 7880/7881, UDP 50000–50200, TCP 9000 ; profil Privé, RemoteAddress 192.168.1.0/24) ; 2e machine cliente = `desktop-ai`. Pas encore d'hôte Sandbox dédié | Avec 2 machines, HD 5 pax reste **NON VALIDÉE** ; 2L-on et plancher régie re-jugeables |
| D-11 | Démarrage Phase 1 | **OUVERT** (le lead recommande d'abord un test LAN multi-machines court) | À trancher par Loïc |
