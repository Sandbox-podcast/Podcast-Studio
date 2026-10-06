# Spikes — rapports et préparation

| Fichier / dossier | Statut |
| --- | --- |
| `S4-protocol-prep.md` | **WIP prep** — protocole draft, spike **non exécuté** |
| `s4/minio/` | **WIP prep** — MinIO LAN POC (locked storage S4, Loïc 2026-10-05) |
| `s4/multipart-proto/` | **WIP prep** — helper multipart presigned (lab, not product) |
| `S4-S5-candidates-prep.md` | **WIP prep** — grille candidats cloud/delivery **post-POC** |
| `S4-S5-plan-prep.md` | **WIP prep** — vue d’ensemble S4/S5, **non exécuté** |
| `S4-recording.md` | **Préliminaire** — pass 1–2 + **locked** POC path (Loïc 2026-10-05) |
| `S4-webcodecs.md` | WebCodecs / fMP4 parallel track summary |
| `S5-delivery.md` | *(à produire après lab)* — rapport spike S5 exécuté |

**S4 POC storage (locked, prep)** : self-hosted **MinIO** on the Sandbox LAN (S3-compatible, D-01). Same host as LiveKit OSS (S1); LAN hostname/IP **TBD**. Cloud vendors (R2/S3/Mux/…) stay **post-POC**.

Référence canonique : [docs/SPIKES.md](../docs/SPIKES.md) (S4–S5), [docs/DECISIONS.md](../docs/DECISIONS.md) (D-01), [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) (§6–7).

Les documents `*-prep.md` et assets sous `s4/` ne contiennent **pas** de verdict pass/fail ni de mesures lab ; ils préparent l’exécution.
