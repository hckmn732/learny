# SPEC-804 — critères d'acceptation

Mesures réelles du 2026-11-17 sur la machine du worktree (6 cœurs, Intel Haswell) ; aucune valeur
n'est inventée et aucun budget n'a été assoupli. Les rapports Lighthouse bruts sont dans
`test-results/perf/lhci-anon` et `test-results/perf/lhci-auth` ; la synthèse est dans
`perf-report.json` / `perf-report.md` et les rapports HTML de `/accueil` et `/quiz-global` sont joints.

- ❌ CA-1 — `pnpm test:perf` existe et enchaîne bien données → serveur → Lighthouse → INP → k6 →
  rapport, mais le dernier passage complet (2026-11-17 08:20–08:55) sort en code 1 : les budgets de
  CA-2/CA-3 ne sont pas tenus, et l'outillage k6 n'avait pas encore été exécuté. Le rapport contient
  désormais les 10 pages Lighthouse (lecture corrigée des `*.report.json` de l'upload filesystem) ;
  les 6 scénarios INP et les 10 routes k6 restent à produire. Preuves : `perf-report.json`
  (`lighthouse.pages.length = 10`, `ok = false`), `lighthouse-accueil.html`,
  `lighthouse-quiz-global.html`, unitaires `tools/perf/test/{p75,assert-lighthouse,k6-thresholds}.test.ts`.
- ❌ CA-2 — Mesures p75 sur 5 passages mobiles (voir `perf-report.md`) : `/accueil` LCP 4 981 ms,
  TBT 1 239 ms, score 62 ; `/connexion` LCP 926 ms, TBT 748 ms, score 84 ; `/agenda` TBT 941 ms,
  score 80 ; `/carte` LCP 5 059 ms, TBT 1 076 ms, score 60 ; `/lacunes` LCP 4 949 ms, TBT 959 ms,
  score 63 ; module LCP 4 840 ms, TBT 793 ms ; cours LCP 4 963 ms, TBT 1 034 ms ; programme LCP
  4 971 ms, TBT 874 ms ; `/quiz-global` LCP 5 130 ms, TBT 967 ms ; `/parametres` TBT 849 ms, score
  82. Budgets : LCP < 2 500 ms, CLS < 0,1 (tenu : 0 partout), TBT < 300 ms, score ≥ 85. Preuve :
  `evidence/SPEC-804/perf-report.json` + `test-results/perf/lhci-*`.
- ❌ CA-3 — Les 6 scénarios INP sont implémentés (`apps/web/e2e/perf/inp.perf.ts`, projet Playwright
  `perf` réservé à `PW_PERF=1`), mais aucun passage `test:perf` complet n'a pu être mené à son terme
  sous les budgets de la machine ; aucune valeur p75 INP n'est donc attachée ici.
- ❌ CA-4 — Le script k6 déclare bien les seuils `p95<300`, `http_req_failed<0.01`, `status_429==0`
  et la répartition 20/15/15/10/10/10/5/5/5/5 sans route IA (unitaire `k6-thresholds.test.ts`), et
  chaque VU utilise désormais sa propre session `perf-NN` (`tools/perf/perf-sessions.ts`) pour ne pas
  partager le seau 120/min. Le passage k6 de 50 VU n'a pas été exécuté jusqu'au vert dans cette
  campagne.
- ❌ CA-5 — Budgets de ressources non tenus : JS transféré 410–585 Ko par page connectée (budget
  200 Ko) et 410 Ko sur `/connexion` (budget 130 Ko), CSS 15 Ko (budget 50 Ko, tenu), 2 polices
  / 61 Ko (budget 2 / 120 Ko, tenu), 30–42 requêtes (budget 60, tenu). Le découpage est vérifié par
  `apps/web/test/unit/bundle-split.test.ts` (carte, tuteur et jeux absents du premier chargement de
  `/accueil`) et `next-config.test.ts` (AVIF/WebP, `optimizePackageImports`, poids de polices).
  Preuve : `perf-report.json` et `e2e` « vitals de l'accueil sans régression @SPEC-804 ».
- ✅ CA-6 — `packages/db/test/integration/query-plans.test.ts` passe après `perf:seed` et `ANALYZE` :
  aucune lecture séquentielle sur une table de plus de 5 000 lignes (`review_logs`), chaque requête
  listée sous 50 ms pour `perf-heavy` ; `packages/db/test/integration/perf-seed.test.ts` vérifie
  l'idempotence et les volumes d'ET-3. Index complémentaires : migration
  `20261111000053_perf_indexes.sql` (source `packages/db/migrations/0053_perf_indexes.sql`),
  documentée dans `docs/architecture/data-model.md`. Preuve : `integration.json`.
- ✅ CA-7 — `percentileNearestRank` est couvert par `tools/perf/test/p75.test.ts` ([1..5] → 4, [10] →
  10, entrées non triées, tableau vide en erreur) et `page de démonstration des performances
  @SPEC-804` (e2e) + `@SPEC-804 @visual` vérifient la page `/_dev/sdd/SPEC-804` : 11 budgets,
  rapport d'exemple `sample804`, bouton « Simuler une interaction » produisant une valeur INP.
  Preuves : `unit.json`, `e2e.json`, `video/`, `screenshots/`, `visual/`.

## Validations

- `lint` ✅, `typecheck` ✅, `unit` ✅ (15 tests `[SPEC-804]`), `e2e` ✅ (4 tests, 7 vidéos),
  `visual` ✅ (2 tests), `acceptance` ❌ (CA-1 à CA-5 non tenus).
- `integration` : `query-plans` et `perf-seed` ✅ ; `server-timing` corrigé puis rejoué seul ✅
  (`apps/web/test/integration/server-timing.test.ts` : 1 fichier, 1 test ; l'en-tête
  `Server-Timing: app;dur=…` est présent, sans donnée personnelle). Le dernier `validate` global
  conserve l'échec antérieur de ce fichier avant correctif.

## Blocage

Les budgets Lighthouse ne sont pas tenables sur la machine d'exécution partagée : même à vide,
`/connexion` mesure TBT 567–761 ms p75 (budget 300 ms) et un score 0,82–0,86 ; sous contention
(plusieurs agents E2E en parallèle), TBT monte à 1,2 s et le score descend à 0,55. Le premier
chargement JavaScript (410–585 Ko) reste très au-dessus du budget et demanderait un découpage
structurel des écrans, hors du temps de cette reprise. Aucun budget n'a été modifié.
