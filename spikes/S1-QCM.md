# QCM décisionnel — SFU POC self-host (salon / Loïc)

| | |
| --- | --- |
| **Date** | 2026-10-05 (aligné pivot S1) |
| **Auteur** | Podcast RTC |
| **Statut** | **VOTE LOCKED — B LiveKit OSS self-host** (2026-10-05) |
| **Contexte** | Soft consensus RTC/Vision/Media + lead ; **lock Loïc / lead Podcast Studio** |
| **D-04** | Override POC seulement — cloud managé = **hypothèse produit post-POC** ([`S1-D04-POC-override.md`](S1-D04-POC-override.md)) |

> **Option B retenue pour le POC.** A / C / D non sélectionnés pour ce POC. **Q2 infra : LAN Sandbox d’abord** (VPS EU plus tard si besoin) — **IP / hôte encore TBD** (Loïc).

---

## 1. Problème

Choisir la **stack SFU pour le POC** Podcast Studio (sessions internes Sandbox, participants en **France**, SFU sur **LAN** et/ou **VPS EU**), capable de :

- ≥ 5 participants simultanés (AC-RTC-001)
- Diagnostics AC-RTC-002 (bitrate, packet loss, jitter, RTT, résolution, FPS)
- Compatibilité **local-first masters** (AC-RTC-003)
- Coût infra = **VPS / LAN** (EST. €/h) — pas de minutes SFU cloud en POC

Mesh exclu pour le produit ; ce QCM concerne le **POC self-host** uniquement.

## 2. Impacts si on se trompe

| Impact | Conséquence |
| --- | --- |
| Stack trop lourde à opérer | Retard POC ; surcharge ops Sandbox |
| TURN/NAT mal dimensionné | Échec join clients France |
| Diag insuffisants | AC-RTC-002 non tenu |
| Egress serveur comme seul master | Contradiction AC-RTC-003 |
| DIY sous-estimé | Dette et instabilité si option C sans bande passante équipe |

## 3. Options (vote salon)

| Option | Description |
| --- | --- |
| **A — mediasoup (self-host)** | SFU Node sur VPS EU / LAN Sandbox ; coturn ; client WebRTC / protoo ou équivalent |
| **B — LiveKit OSS (self-host)** | `livekit-server` sur VPS EU / LAN ; clients `livekit-client` ; tokens maison |
| **C — DIY / autre (préciser)** | Stack WebRTC custom ou autre OSS — **risque plus élevé** ; préciser : _______________ |
| **D — Revenir cloud managé** | LiveKit Cloud / Daily / Agora ou autre SaaS — **hors POC actuel** ; nécessite **OK Loïc explicite** + révision override D-04 POC |

**Ancien QCM SaaS (LiveKit Cloud / Daily / Agora)** : **retiré comme chemin de lock POC** — archivé dans [`S1-sfu.md`](S1-sfu.md) annexe.

## 4. Avantages / inconvénients (prep — à compléter post-lab)

### A — mediasoup

| + | − |
| --- | --- |
| Contrôle total ; trafic sur infra Sandbox | Ops + TURN + monitoring à notre charge |
| Licence permissive ; écosystème Node | DX plus bas niveau que LiveKit « room » |
| Bon fit SFU pur | AC-RTC-002 : assembly UI / getStats |

### B — LiveKit OSS

| + | − |
| --- | --- |
| Parité conceptuelle avec hypothèse cloud D-04 post-POC | Déploiement et config serveur non triviaux |
| SDK client mature ; rooms | Redis/dépendances selon topology |
| Egress OSS possible (bonus) | Risque de confondre POC self-host et produit cloud |

### C — DIY / autre

| + | − |
| --- | --- |
| Flexibilité maximale | **Risque élevé** ; délai |
| | À reserver si vote explicite |

### D — Cloud managé (hors POC actuel)

| + | − |
| --- | --- |
| Aligné **hypothèse produit D-04 post-POC** | **Interdit POC** sans OK Loïc |
| Moins ops immédiat | Coût minutes + données ; SaaS stop pour l’instant |

## 5. Observations prep (pas une recommandation)

- Stack POC : **LiveKit OSS** — lab [`s1-lab/livekit-oss/`](s1-lab/livekit-oss/).
- Grille historique mediasoup vs OSS : [`S1-sfu.md`](S1-sfu.md).
- Lab cible : **France** ; déploiement **LAN Sandbox first** ; VPS EU en repli ultérieur si besoin.

## 6. Questions pour le salon / Loïc

### Q1 — Choix stack POC

Après lecture de [`S1-sfu.md`](S1-sfu.md) (grille + mesures lab quand remplies) :

- [ ] **A** mediasoup (self-host) — *non retenu POC*  
- [x] **B** LiveKit OSS (self-host) — **LOCKED 2026-10-05**  
- [ ] **C** DIY / autre — *non retenu POC*  
- [ ] **D** Revenir cloud managé — *hors POC actuel*  

Commentaire : Vote salon / lead + Loïc — **B** pour exécution lab.

### Q2 — Infra lab (**répondu — LAN first**)

| Question | Réponse |
| --- | --- |
| **Ordre de déploiement** | **LAN Sandbox d’abord** ; VPS EU plus tard si nécessaire (Loïc) |
| LAN Sandbox (IP, SSH, ports) | **TBD** — à fournir par Loïc (ne pas inventer) |
| VPS EU (fournisseur, spec, €/h EST.) | *Reporté* — seulement si LAN insuffisant |
| TURN (coturn / intégré) | _______________ (après IP LAN connue) |

### Q3 — Post-POC produit (rappel D-04)

Confirmer que l’**hypothèse produit** reste le **SFU cloud public managé** (D-04) **après POC**, sauf nouvel OK Loïc pour amendement :

- [ ] Oui, rappel accepté  
- [ ] À discuter (préciser) : _______________  

---

## 7. Suite process

1. **Vote B** → lab **GO** ([`livekit-oss/`](s1-lab/livekit-oss/)).  
2. Obtenir **IP / accès hôte LAN** (Loïc) — Q2 mode = LAN first.  
3. Exécuter protocole `S1-sfu.md` ; remplir mesures.  
4. Post-POC : hypothèse produit D-04 cloud sauf amendement Loïc.
