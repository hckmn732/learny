# ADR-0202 — Mesure des performances et commande test:perf

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-804, ADR-0041

## Contexte

ADR-0041 fixe les budgets (LCP, INP, CLS au 75ᵉ centile, API p95) et les outils, mais pas les pages, le calcul du centile, la mesure de l'INP (indicateur de terrain que Lighthouse ne mesure pas en navigation) ni le contenu de `pnpm test:perf`, exigé par `tools/sdd/checkpoint.mjs` aux checkpoints CP-8 et CP-9.

## Décision

- `pnpm test:perf` = `node tools/perf/run.mjs` : données réinitialisées (démonstration + 50 utilisateurs de charge + un utilisateur volumineux), `next start` (port 3100, horloge figée, IA simulée), Lighthouse CI, INP Playwright, k6, rapport ; code 0 seulement si tous les budgets sont tenus. Le projet Playwright `perf` n'existe que si `PW_PERF=1`.
- Lighthouse : profil mobile par défaut, 5 passages par page, 10 pages principales ; 75ᵉ centile au rang le plus proche (4ᵉ valeur sur 5) ; LCP < 2,5 s, CLS < 0,1, TBT < 300 ms, score ≥ 0,85 ; JavaScript ≤ 200 Ko compressés par page connectée (130 Ko pour `/connexion`), CSS ≤ 50 Ko, polices ≤ 2 fichiers et 120 Ko, images ≤ 300 Ko, ≤ 60 requêtes.
- INP : Playwright Chromium mobile, CPU ×4, réseau 150 ms / 1,6 Mbit/s, `web-vitals`, 6 scénarios d'interaction, 5 passages, p75 < 200 ms.
- API : k6 (binaire ou image Docker figée), 50 utilisateurs virtuels, 3 min, 10 routes sans IA, p95 < 300 ms au global et par route, < 1 % d'échecs, aucun 429.
- Requêtes critiques vérifiées par `EXPLAIN ANALYZE` : pas de lecture séquentielle sur une table de plus de 5 000 lignes, < 50 ms.

## Conséquences

Un budget dépassé bloque le checkpoint ; il se corrige par optimisation, jamais en relâchant le budget.
