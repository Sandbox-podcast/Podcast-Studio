# D-04 — override POC uniquement (S1)

| | |
| --- | --- |
| **Date** | 2026-10-05 (pivot explicite Loïc via lead Podcast Studio) |
| **Auteur** | Podcast RTC |
| **Statut** | **Actif pour le POC S1** — ne remplace pas D-04 produit |

## Ce que dit D-04 produit (inchangé)

L’ADR **D-04** dans `docs/DECISIONS.md` (quand présent sur la branche produit) reste l’hypothèse **long terme** : SFU **cloud public managé** pour le produit Podcast Studio, sauf amendement ADR formel.

**Ce spike ne supprime pas D-04** et ne le réécrit pas comme « abandonné définitivement ».

## Override POC (exception temporaire)

Pour le **POC Sandbox uniquement**, Loïc a demandé d’**arrêter le SFU SaaS** (LiveKit Cloud / Daily / Agora : pas de clés, comptes, ni runs lab).

| Périmètre | Règle |
| --- | --- |
| **POC S1** | SFU **self-host** sur infra Sandbox (**LAN** et/ou **VPS EU**), participants en **France**. Voir [`S1-sfu.md`](S1-sfu.md) et [`s1-lab/README.md`](s1-lab/README.md). |
| **Cloud managé** | **Hors scope POC actuel** jusqu’à **nouvel OK explicite de Loïc**. |
| **Post-POC produit** | L’hypothèse **SFU cloud public managé** (D-04) **reste la direction produit** après le POC, **sauf** si Loïc ouvre un amendement ADR ou une nouvelle décision. |

## Process

- Toute reprise du cloud managé pour le POC ou le produit → **OK Loïc** + trace ADR si impact produit.
- Choix stack POC (**mediasoup** / **LiveKit OSS** / **DIY**) → **vote salon** ([`S1-QCM.md`](S1-QCM.md)) — **pas de verrouillage** avant ce vote.

## Liens

- Spike principal : [`S1-sfu.md`](S1-sfu.md)
- QCM salon : [`S1-QCM.md`](S1-QCM.md)
- Harnais : [`s1-lab/`](s1-lab/)
