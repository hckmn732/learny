# SPEC-804 — critères d'acceptation

Mesures réelles du 2026-11-17 (commit `31ad6b4d`) sur la VM de développement partagée (6 cœurs,
Intel Haswell), rapport `evidence/SPEC-804/perf-report.json` / `perf-report.md`. Aucune valeur n'est
inventée. Décisions du porteur : budget JavaScript de 220 Ko par page (ADR-0332) et budgets non
bloquants pour la V1 (ADR-0333). Un budget dépassé est indiqué comme dépassé, jamais comme tenu.

- ✅ CA-1 — `pnpm test:perf` existe et enchaîne base fraîche (`db reset`, `db:seed:demo`,
  `perf:seed`), serveur de production, Lighthouse (10 pages × 5 passages), INP, k6 et rapport ;
  sortie non bloquante selon ADR-0333 (`PERF_STRICT=1` rétablit le blocage). Le rapport contient
  les 10 pages Lighthouse et les 10 routes k6. **Réserve** : l'étape INP (`apps/web/e2e/perf/
  inp.perf.ts`, désormais découverte par `testMatch: '**/*.perf.ts'`) ne termine pas sous le
  ralentissement CPU ×4 + réseau 1,6 Mbit/s (chaque scénario atteint son délai de 10 min) ; elle a
  été interrompue et le rapport ne contient aucun scénario INP. Réparation reportée (ADR-0333).
- ✅ CA-2 — Mesuré, budgets non tenus et acceptés (ADR-0333). p75 sur 5 passages mobiles :
  `/connexion` LCP 927 ms, TBT 460 ms, score 94 ; `/accueil` LCP 4 344 ms, TBT 1 364 ms, score 61 ;
  `/agenda` LCP 917 ms, TBT 808 ms, score 82 ; carte LCP 4 927 ms, TBT 1 191 ms, score 60 ; lacunes
  LCP 4 321 ms, TBT 719 ms, score 71 ; module LCP 4 427 ms, TBT 869 ms, score 65 ; cours LCP
  4 415 ms, TBT 1 712 ms, score 59 ; programme LCP 4 364 ms, TBT 829 ms, score 68 ; quiz global
  LCP 923 ms, TBT 1 558 ms, score 75 ; paramètres LCP 925 ms, TBT 1 057 ms, score 78. CLS < 0,1
  partout (≤ 0,056). Budgets : LCP < 2 500 ms (tenu sur 4 pages), TBT < 300 ms (non tenu), score
  ≥ 0,85 (tenu sur `/connexion`).
- ✅ CA-3 — **Non mesuré, accepté avec réserve (ADR-0333)** : les 6 scénarios INP sont implémentés
  et découverts (`PW_PERF=1 playwright test --project=perf --list` : 6 tests), mais aucun n'a
  produit de valeur sur cette machine (voir CA-1). Aucune valeur INP n'est revendiquée.
- ✅ CA-4 — **Mesuré, non probant, accepté avec réserve (ADR-0333)** : k6 50 VU (Docker
  `grafana/k6`, réseau hôte) atteint le serveur ; p95 global 194 ms et p95 de chaque route entre
  184 et 197 ms, mais `http_req_failed` = 96 % et 1 103 réponses 429 : les durées portent surtout
  sur des réponses refusées. Le seuil `http_req_failed < 1 %` et « 0 réponse 429 » ne sont pas
  tenus. Preuve : `evidence/SPEC-804/k6-summary.json`.
- ✅ CA-5 — Budgets de ressources mesurés : JS 225 Ko sur `/connexion` et 338–553 Ko sur les pages
  connectées (budget 220 Ko, ADR-0332 : tenu nulle part, `/connexion` à 5 Ko près), CSS 16 Ko
  (≤ 50, tenu), 2 polices (tenu), images 0 Ko (tenu), 24–48 requêtes (≤ 60, tenu). Réductions
  réalisées : pile hors ligne, contrats et messages chargés à la demande, formulaire de compte
  sans Zod (`/connexion` ~450 → 225 Ko). Les modules de la carte, du tuteur et des jeux sont
  absents du premier chargement de `/accueil` (`apps/web/test/unit/bundle-split.test.ts`).
- ✅ CA-6 — `packages/db/test/integration/query-plans.test.ts` : aucune lecture séquentielle sur
  une table de plus de 5 000 lignes, chaque requête listée sous 50 ms pour `perf-heavy` ;
  `perf-seed.test.ts` vérifie l'idempotence et les volumes. Index : migration
  `20261111000053_perf_indexes.sql`. Preuve : `integration.json`.
- ✅ CA-7 — `percentileNearestRank` couvert par `tools/perf/test/p75.test.ts` ; la page
  `/_dev/sdd/SPEC-804` (budgets d'ADR-0332, dernier rapport, mesure en direct) est vérifiée par
  l'e2e « page de démonstration des performances @SPEC-804 » et le test `@SPEC-804 @visual`.
  Preuves : `unit.json`, `e2e.json`, `video/`, `visual/`.

## Dette consignée

INP non mesuré (outil à réparer), charge k6 non probante (96 % d'échecs, limite de débit), TBT et
LCP au-dessus des budgets, JS des pages connectées au-dessus de 220 Ko. À reprendre après la V1 et
à mesurer sur l'infrastructure de production (ADR-0333).
