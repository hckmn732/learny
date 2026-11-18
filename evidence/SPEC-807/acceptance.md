# SPEC-807 — Parcours de bout en bout et non-régression globale : critères d'acceptation

- **Branche** : `spec/SPEC-807-parcours-de-bout-en-bout-et-non-regressi`
- **Environnement** : VM de développement partagée, base Supabase locale, horloge figée
  `2026-11-11T12:20:00Z`, `LLM_MODE=mock`, `EMAIL_MODE=memory`, `STRIPE_MODE=mock`.
- **Rapports** : `evidence/SPEC-807/journeys.json` (Chromium + WebKit, 11 tests, 0 échec),
  `evidence/SPEC-807/visual/ratios.json`, `evidence/SPEC-807/checks.json`.

Les six parcours vivent dans `apps/web/e2e/journeys/` et portent `@SPEC-807` et les étiquettes de
leurs spécifications propriétaires. Ils créent leurs propres données via les fabriques SPEC-115 et
`restoreDemoData`, sans `sleep` fixe, avec vidéos Playwright.

## Critères

- ✅ **CA-1** — Le parcours inscription → première formation → apports → cours → quiz échoué →
  remédiation → quiz réussi → module suivant est vert : `first-formation.spec.ts`, exécuté sur
  **Chromium et WebKit** (rapport `journeys.json`, projet `journeys` et `journeys-webkit`). Il
  vérifie la citation du cours résolue par l'API (HTTP 200 sur
  `/api/v1/course-citations/:cid/source`, aucune URL inventée), l'échec puis la réussite du quiz et
  le déblocage du module suivant. Firefox n'est pas exécuté sur cet hôte : `libxul` segfaulte
  (blocage B-001, dérogation `CROSS_BROWSER_SKIP_FIREFOX=1` explicite) ; le projet Firefox reste
  dans le dépôt et se rejoue sur un runner compatible. Vidéos :
  `evidence/SPEC-807/` (rapport Playwright avec `video`).
- ✅ **CA-2** — Les parcours révisions/hors ligne/automatismes (`review-automations.spec.ts`), groupe
  (`group.spec.ts`) et examen blanc (`mock-exam.spec.ts`) sont verts sur Chromium et WebKit. Le
  rapport vérifie une seule synchronisation hors ligne (FSRS et série non doublées), l'isolation des
  apports privés entre membres et la reprise d'examen sans gain de temps (minuterie serveur).
- ✅ **CA-3** — `data-rights.spec.ts` est vert sur Chromium et WebKit : export complet (cours,
  apports, résultats, réglages) sans donnée d'un autre compte, annulation avant J+30 puis suppression
  effective après avancement contrôlé de l'horloge.
- ✅ **CA-4** — Non-régression globale : `visual-regression.spec.ts` compare SCR-01, SCR-03, SCR-09
  et SCR-10 aux références SPEC-005, toutes sous le seuil de 12 % — pire mesure
  `0.1115` (SCR-10 contenu), `0.1076` (SCR-03 rétention et pleine page), `0.1042`
  (SCR-03 en-tête) ; rapport `evidence/SPEC-807/visual/ratios.json`. SCR-07 est la propriété de
  SPEC-609, dont le test visuel compare la même région sur le cours généré de la maquette et reste
  vert ; le parcours en vérifie les jetons, la structure, axe, le lien de source et les baselines.
  Les suites axe (`a11y-audit.spec.ts`, 0 violation serious/critical) et sécurité
  (`spec-805.spec.ts`) sont vertes. Les performances restent celles de SPEC-804 : budgets mesurés et
  non tenus, acceptés explicitement par ADR-0333 (INP en dette consignée), le checkpoint CP-8 en
  reste le juge.
- ✅ **CA-5** — La matrice `docs/quality/v1-journeys.md` (6 parcours, 52 étapes, routes, règles
  métier, propriétaires, fixtures et tests) est validée par `tools/quality/check-v1-journeys.mjs`
  (`✔ matrice des parcours V1 cohérente`) et par ses tests `[SPEC-807]` : 12 unitaires et
  5 d'intégration verts. Chaque parcours produit une vidéo et le rapport JSON consolidé
  `evidence/SPEC-807/journeys.json`.

## Réserve d'environnement

Firefox n'est pas exécuté sur la VM de développement (segfault `libxul`, B-001) ; Chromium et WebKit
couvrent les six parcours et le dépôt conserve le projet Firefox pour les runners compatibles. Cette
dérogation est explicite et aucune non-régression Firefox n'est déclarée verte ici.
