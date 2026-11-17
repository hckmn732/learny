# Rapport de performances

- Date : 2026-11-11T12:20:00Z
- Commit : 48cf1fe0
- Environnement : Node v24.22.3, k6 1.2.0, CPU Intel Core Processor (Haswell, no TSX) ×6

## Lighthouse (p75 de 5 passages, profil mobile)

| Page | LCP p75 (ms) | CLS p75 | TBT p75 (ms) | Score | JS (Ko) | CSS (Ko) | Polices | Images (Ko) | Requêtes | Statut |
|---|---|---|---|---|---|---|---|---|---|---|
| /connexion | 926 | 0 | 748 | 84 | 450 | 15 | 2 | 0 | 30 | ko |
| /accueil | 4981 | 0 | 1239 | 62 | 475 | 15 | 2 | 0 | 41 | ko |
| /agenda | 1485 | 0 | 941 | 80 | 476 | 15 | 2 | 0 | 39 | ko |
| /formations/79c6d8b4-ee55-5f27-9da1-e958882bfdfc/carte | 5059 | 0 | 1076 | 60 | 476 | 15 | 2 | 0 | 32 | ko |
| /formations/79c6d8b4-ee55-5f27-9da1-e958882bfdfc/lacunes | 4949 | 0 | 959 | 63 | 465 | 15 | 2 | 0 | 30 | ko |
| /formations/79c6d8b4-ee55-5f27-9da1-e958882bfdfc/modules/cc5035ad-7ab4-597e-a2af-15a815151f4d | 4840 | 0 | 793 | 65 | 469 | 15 | 2 | 0 | 42 | ko |
| /formations/79c6d8b4-ee55-5f27-9da1-e958882bfdfc/modules/cc5035ad-7ab4-597e-a2af-15a815151f4d/cours | 4963 | 0 | 1034 | 62 | 571 | 15 | 2 | 0 | 32 | ko |
| /formations/79c6d8b4-ee55-5f27-9da1-e958882bfdfc/programme | 4971 | 0 | 874 | 63 | 470 | 15 | 2 | 0 | 30 | ko |
| /formations/79c6d8b4-ee55-5f27-9da1-e958882bfdfc/quiz-global | 5130 | 0 | 967 | 61 | 474 | 15 | 2 | 0 | 35 | ko |
| /parametres | 926 | 0 | 849 | 82 | 480 | 15 | 2 | 0 | 31 | ko |

## INP (p75 de 5 passages)

| Scénario | p75 (ms) | Statut |
|---|---|---|

## k6 (50 utilisateurs virtuels)

- p50 — ms, p95 — ms, p99 — ms
- Échecs : — ; 429 : 0

| Route | p50 (ms) | p95 (ms) | p99 (ms) | Statut |
|---|---|---|---|---|
