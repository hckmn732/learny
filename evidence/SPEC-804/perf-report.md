# Rapport de performances

- Date : 2026-11-11T12:20:00Z
- Commit : 31ad6b4d
- Environnement : Node v24.22.3, k6 1.2.0, CPU Intel Core Processor (Haswell, no TSX) ×6

## Lighthouse (p75 de 5 passages, profil mobile)

| Page | LCP p75 (ms) | CLS p75 | TBT p75 (ms) | Score | JS (Ko) | CSS (Ko) | Polices | Images (Ko) | Requêtes | Statut |
|---|---|---|---|---|---|---|---|---|---|---|
| /connexion | 927 | 0 | 460 | 94 | 225 | 16 | 2 | 0 | 24 | ko |
| /accueil | 4344 | 0.0554216220994524 | 1364 | 61 | 399 | 16 | 2 | 0 | 45 | ko |
| /agenda | 917 | 0.0554216220994524 | 808 | 82 | 358 | 16 | 2 | 0 | 37 | ko |
| /formations/79c6d8b4-ee55-5f27-9da1-e958882bfdfc/carte | 4927 | 0.0554216220994524 | 1191 | 60 | 357 | 16 | 2 | 0 | 37 | ko |
| /formations/79c6d8b4-ee55-5f27-9da1-e958882bfdfc/lacunes | 4321 | 0.0554216220994524 | 719 | 71 | 338 | 16 | 2 | 0 | 35 | ko |
| /formations/79c6d8b4-ee55-5f27-9da1-e958882bfdfc/modules/cc5035ad-7ab4-597e-a2af-15a815151f4d | 4427 | 0.0554216220994524 | 869 | 65 | 343 | 16 | 2 | 0 | 47 | ko |
| /formations/79c6d8b4-ee55-5f27-9da1-e958882bfdfc/modules/cc5035ad-7ab4-597e-a2af-15a815151f4d/cours | 4415 | 0.0554216220994524 | 1712 | 59 | 553 | 16 | 2 | 0 | 42 | ko |
| /formations/79c6d8b4-ee55-5f27-9da1-e958882bfdfc/programme | 4364 | 0.0554216220994524 | 829 | 68 | 347 | 16 | 2 | 0 | 35 | ko |
| /formations/79c6d8b4-ee55-5f27-9da1-e958882bfdfc/quiz-global | 923 | 0.0554216220994524 | 1558 | 75 | 457 | 16 | 2 | 0 | 48 | ko |
| /parametres | 925 | 0.0554216220994524 | 1057 | 78 | 447 | 16 | 2 | 0 | 39 | ko |

## INP (p75 de 5 passages)

| Scénario | p75 (ms) | Statut |
|---|---|---|

## k6 (50 utilisateurs virtuels)

- p50 — ms, p95 193.74675189999985 ms, p99 — ms
- Échecs : 0.9596614950634696 ; 429 : 1103

| Route | p50 (ms) | p95 (ms) | p99 (ms) | Statut |
|---|---|---|---|---|
| route_agenda_duration | — | 196.07393975000002 | — | ok |
| route_notifications_duration | — | 189.29130735 | — | ok |
| route_notion_graph_duration | — | 187.3606539999999 | — | ok |
| route_home_duration | — | 194.76091259999998 | — | ok |
| route_programme_duration | — | 195.8584649999999 | — | ok |
| route_notifications_read_all_duration | — | 197.1710520999999 | — | ok |
| route_global_quiz_today_duration | — | 184.00502519999998 | — | ok |
| route_unread_count_duration | — | 189.4998265499999 | — | ok |
| route_gaps_duration | — | 185.671333 | — | ok |
| route_search_duration | — | 195.61350679999998 | — | ok |
