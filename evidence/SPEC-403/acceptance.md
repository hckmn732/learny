# SPEC-403 — critères d'acceptation

- ✅ CA-1 — Deux réponses à 100 % et 0 %, espacées de 14 jours, donnent 33,333… % si la réussite est
  l'ancienne et 66,666… % si elle est la récente. Preuve : `packages/learning-engine/src/mastery/calculate.test.ts`
  (test « donne 33,333… % si la réussite est l’ancienne… ») et `test/integration/mastery.test.ts`
  (composition avec `buildAnswer` et `ENGINE.mastery`) ; e2e `@SPEC-403` vérifie 33,33 % puis le
  recalcul de la barre. Sorties réelles : `unit.json`, `integration.json`, `e2e.json`.
- ✅ CA-2 — Une seule réponse à 80 % donne exactement le seuil 80 % (maîtrisée) ; 79,999 % reste sous
  le seuil. Preuve : tests unitaires « place exactement une réponse à 80 % au seuil… », intégration
  « compose les réponses du moteur et les paramètres de configuration », et lignes `mastery-edge-below`
  / `mastery-edge-threshold` de la page SDD contrôlées par l'e2e.
- ✅ CA-3 — Pour tout jeu valide, le résultat reste dans [0, 100], est invariant à la permutation et ne
  diminue pas quand un score augmente à date égale. Preuve : propriétés fast-check (seed 20261111,
  200 exécutions) dans `calculate.test.ts` (bornes, permutation exacte, monotonie) et invariance à la
  répétition dans `test/integration/mastery.test.ts`.
- ✅ CA-4 — Entrée vide, future ou hors bornes : 0 % sans NaN pour la liste vide, `INVALID_INPUT` avec
  chemin `answers.0.answeredAt` pour une réponse future et `answers.0.score` hors [0, 1], sans mutation
  de l'entrée. Preuve : tests unitaires CL-1/CL-3/EF-3 et intégration « traite l’historique vide et la
  réponse future » ; l'e2e affiche le cas limite `INVALID_INPUT` réellement levé.
- ✅ CA-5 — La page `/_dev/sdd/SPEC-403` affiche les poids et le résultat calculés, avec vidéo et test
  `@visual` sans violation axe. Preuve : `apps/web/e2e/specs/p4/spec-403.spec.ts` (2 tests, 3 exécutions
  desktop/mobile), vidéos `video/`, captures desktop/mobile, comparaison `toHaveScreenshot` à 1 %
  (`apps/web/e2e/__screenshots__/p4/spec-403.spec.ts/`), axe sans violation serious/critical.
