# Podcast Studio

Studio web de production de podcasts vidéo collaboratifs (usage **interne** Sandbox).

Repo greenfield : [Sandbox-podcast/Podcast-Studio](https://github.com/Sandbox-podcast/Podcast-Studio).

## Statut

Phase 0 — **architecture + roadmap + spikes**. Peu / pas de code produit tant que les spikes critiques ne sont pas validés.

## Documents

| Doc | Contenu |
| --- | --- |
| [docs/PRODUCT-VISION.md](./docs/PRODUCT-VISION.md) | Vision produit & AC d’origine |
| [docs/DECISIONS.md](./docs/DECISIONS.md) | Décisions structurantes verrouillées |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Architecture cible |
| [docs/ROADMAP.md](./docs/ROADMAP.md) | Roadmap phasée |
| [docs/SPIKES.md](./docs/SPIKES.md) | Spikes techniques go/no-go |

## Décisions en une ligne

- Stockage : S3 masters + delivery managé  
- Media : matting/live client · IA/transcode serveur  
- Auth : comptes + rôles  
- Deploy : cloud public  
- Business : usage interne  

## Prochaine action

Exécuter les spikes **S0 → S1 / S3** (voir [docs/SPIKES.md](./docs/SPIKES.md)), puis figer SFU + stack + mode de compose.
