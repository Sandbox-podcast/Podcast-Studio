# QCM décisionnel — SFU Podcast Studio (post-S1)

| | |
| --- | --- |
| **Date** | 2026-10-05 |
| **Auteur** | Podcast RTC |
| **Statut** | **Brouillon prêt à transmettre via le lead** — **ne pas exécuter** comme décision maintenant |
| **Contexte** | OPEN-QUESTIONS : SFU après S1 = A LiveKit Cloud / B Daily / C Autre. Seuil coût à fixer avec Loïc. |
| **Préalable** | Réponses **après** lab S1 (go post-S0). Ce QCM peut être **lu** en PREP pour cadrer ; le **vote** attend les mesures. |

> Style aligné PRODUCT-VISION §6.  
> **Pas de recommandation A/B/C verrouillée** en PREP. Observations desk ≠ verdict.

---

## 1. Problème

Choisir le **SFU cloud managé** pour le live Podcast Studio (usage interne Sandbox, clients typiquement en Europe / Paris), capable de :

- ≥ 5 participants simultanés (AC-RTC-001)
- Dashboard diag : bitrate, packet loss, jitter, RTT, résolution, FPS (AC-RTC-002)
- Compatibilité **local-first masters** (AC-RTC-003) — egress SFU = complément, jamais seul master
- Coût horaire acceptable pour sessions internes 3 et 5 pax 720p — **plafond à définir**

Mesh exclu ; mediasoup self-managed hors scope v1 (ARCHITECTURE §4).

## 2. Impacts si on se trompe

| Impact | Conséquence |
| --- | --- |
| Instabilité > 3 pax | Blocage Phase 1 RTC / AC-RTC-001 fail |
| Diag incomplets | AC-RTC-002 non tenu ; régie aveugle |
| Egress seul master | Contradiction D-01 / AC-RTC-003 ; perte qualité si réseau dégrade |
| Coût hors plafond | Usage interne non viable ; renegociation ou re-spike |
| Mauvaise région / residency | Latence Europe dégradée ou écart vs attentes compliance Sandbox (à clarifier — **ne pas inventer policy**) |

## 3. Options

| Option | Description |
| --- | --- |
| **A — LiveKit Cloud** | SFU managé LiveKit ; SDK JS/TS + React components ; egress Room/Track |
| **B — Daily** | SFU managé Daily ; daily-js / daily-react ; recording cloud / local / raw-tracks |
| **C — Agora** | RTC Agora Web ; tokens + channels ; Cloud Recording REST |
| **D — Autre** | Préciser (ex. autre vendeur managé). Self-hosted mediasoup = hors v1 sauf dérogation explicite |

## 4. Avantages / inconvénients (desk + à compléter post-lab)

### A — LiveKit Cloud

| + | − |
| --- | --- |
| Pricing WebRTC list bas (EST. desk ~$0.09–0.30/h pour 3–5 pax hors free) | Coût réel dépend du **data transfer** ($/GB) — à mesurer en lab |
| Egress riche (composite + track) → S3 | Region pinning documenté surtout plans élevés |
| DX TypeScript / React mature ; data channels | AC-RTC-002 : assemblage getStats + ConnectionQuality (moins « tout-en-un » que Daily network stats) |
| Free Build 5 000 min (hard cap) utile PREP/lab court | |

### B — Daily

| + | − |
| --- | --- |
| `getNetworkStats` / `useNetwork` très proches AC-RTC-002 | EST. desk ~$0.72–1.20/h (3–5 pax) hors free — plus cher list que LiveKit |
| Recording `local` + `raw-tracks` S3 alignés esprit dual-track | Residency EU : geo Frankfurt dispo ; doc publique indique encore des services US possibles |
| DX rooms/tokens claire ; React helpers | Cloud recording facturé à part si utilisé |
| 10 000 min free / mois | |

### C — Agora

| + | − |
| --- | --- |
| Métriques natives riches (network-quality + stats A/V) | Modèle *standard minutes* (HD ×4) — surprise coût possible à 5 pax |
| Edge / API EU documentés | DX plus « channel télécom » que room podcast |
| Free 10 000 standard min | Cloud Recording = bonus serveur, pas master HQ client |
| EST. list HD ~$0.72–1.20/h (3–5 pax) | |

### D — Autre

| + | − |
| --- | --- |
| Flexibilité si A/B/C échouent le lab | Délai ; re-spike ; mediasoup self-host = hors scope v1 |

## 5. Observations desk (PREP) — pas une recommandation

Forces relatives **documentées** (sans classer un gagnant) :

- **Coût list (hors free)** : LiveKit paraît le plus bas sur le papier ; Daily et Agora HD du même ordre (~$0.004/participant-min).
- **Diag AC-RTC-002** : Daily expose le mapping le plus direct out-of-the-box ; LiveKit et Agora couvrent via getStats / stats SDK avec un peu plus d’assemblage UI.
- **Local-first** : les trois permettent de ne **pas** dépendre de l’egress comme master ; Daily a en plus un mode recording `local` documenté.
- **EU** : les trois documentent une présence Europe (Frankfurt / EU endpoints). **Residency stricte** ≠ geo latency — à clarifier avec Loïc si besoin Sandbox.

**Incertitudes** (à lever en LAB) : stabilité 5 pax réelle, écart EST. vs facturation (surtout bandwidth LiveKit et standard-min Agora), RTT depuis Paris, qualité DX tokens dans *notre* stack S0.

**Décision SFU** : **pending mesures lab** — aucune option cochée ici.

## 6. Questions pour Loïc (à répondre après lab, via le lead)

### Q1 — Choix SFU

Après lecture du rapport `spikes/S1-sfu.md` (mesures lab remplies) :

- [ ] **A** LiveKit Cloud  
- [ ] **B** Daily  
- [ ] **C** Agora  
- [ ] **D** Autre : _______________  

Commentaire (optionnel) : _________________________________

### Q2 — Plafond coût / heure (réponse libre — **obligatoire avant pass/fail coût**)

Le spike **n’invente pas** de seuil. Indiquer un plafond acceptable pour usage interne Sandbox :

| Scénario | Plafond proposé (€/h ou $/h — préciser devise) | Fourchettes candidates (indicatif desk, **non imposées**) |
| --- | --- | --- |
| 3 pax 720p | _______________ | ex. ≤ 0,50 / ≤ 1 / ≤ 2 / autre |
| 5 pax 720p | _______________ | ex. ≤ 1 / ≤ 2 / ≤ 3 / autre |

Notes Loïc (volume sessions/mois, free tier OK, contrainte budget) : _________________________________

### Q3 — EU (optionnel mais utile)

Exigence Sandbox pour le SFU (cocher une) — **policy à fournir par Loïc, pas inventée par l’équipe spike** :

- [ ] Latence Europe suffisante (geo EU OK)  
- [ ] Residency / traitement données EU strict (DPA + confirmation vendeur)  
- [ ] À préciser avec legal : _______________  

---

## 7. Suite process

1. Lead Podcast Studio transmet ce QCM (+ lien `S1-sfu.md`) à Loïc.  
2. Lab S1 s’exécute après go S0 **et** (idéalement) réponse Q2 sur les plafonds.  
3. Après lab : mise à jour mesures → Loïc répond Q1 (+ Q3 si besoin).  
4. Lead verrouille SFU + ADR ; **pas** de verrouillage unilatéral par Podcast RTC.
