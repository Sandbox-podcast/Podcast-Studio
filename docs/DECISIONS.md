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
