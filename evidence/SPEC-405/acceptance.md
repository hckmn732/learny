# SPEC-405 — critères d'acceptation

- ✅ CA-1 — Sur une banque suffisante de 8 notions, les 12 questions couvrent chacune et incluent
  au moins une ouverte, avec une répartition proche de 70/30. Preuve :
  `packages/learning-engine/src/draw/draw-attempt.test.ts` (« couvre 8 notions avec 12 questions
  et une répartition proche de 70/30 (CA-1) », « attribue les 100 points au centième ») et
  `apps/web/e2e/specs/p4/spec-405.spec.ts` (« 8 notions couvertes », « 4 ouvertes », « 8 choix »).
  Sorties : `unit.json`, `e2e.json`.
- ✅ CA-2 — Aucune empreinte déjà vue ni doublon d'empreinte ne figure dans la tentative. Preuve :
  tests unitaires « exclut les empreintes vues et ne retient qu'une variante par empreinte (CA-2,
  CL-2) », « ne tire que des briques actives, valides, possédées et liées (EF-4) » et intégration
  « compose la maîtrise, les lacunes et le tirage (CA-1 à CA-3) » ; la démonstration affiche
  2 empreintes vues exclues, 1 doublon et 38 empreintes uniques. Sorties : `unit.json`,
  `integration.json`.
- ✅ CA-3 — À seed égale et entrées permutées, l'ordre et les références sont identiques ; une
  lacune reçoit la priorité de tirage prévue. Preuve : tests unitaires « retourne un tirage
  identique à seed égale malgré l'ordre des entrées (CA-3, CL-5) », propriété fast-check
  « invariant par toute permutation », « surpondère les lacunes puis les maîtrises faibles (CA-3) »
  et intégration « compose la maîtrise, les lacunes et le tirage (CA-1 à CA-3) » ; l'e2e affiche
  « Identique » sur les 12 références permutées. Sorties : `unit.json`, `integration.json`,
  `e2e.json`.
- ✅ CA-4 — Banque épuisée ou plus de 20 notions retourne un rapport explicite, sans question
  inventée. Preuve : tests unitaires « retourne liste vide et toutes les notions épuisées sur une
  banque vide (CL-1) », « signale la capacité au-delà de 20 notions sans dépasser 20 questions
  (CL-3) », « signale l'épuisement du format ouvert (CL-4) » et intégration « signale une notion
  sans banque » / « signale la limite de couverture au-delà de 20 notions (CA-4) » ; l'e2e montre
  « Banque épuisée », 6 notions non couvertes, « Limite de couverture » et le motif « Capacité ».
  Sorties : `unit.json`, `integration.json`, `e2e.json`.
- ✅ CA-5 — La démonstration affiche couverture et épuisement, vidéo, axe et test `@visual`.
  Preuve : `apps/web/e2e/specs/p4/spec-405.spec.ts` (2 tests, 3 exécutions desktop/mobile sans
  violation axe serious/critical), vidéos Playwright dans `evidence/SPEC-405/video/`, captures
  desktop/mobile dans `screenshots/`, comparaison `toHaveScreenshot` à 1 % avec les lignes de base
  `apps/web/e2e/__screenshots__/p4/spec-405.spec.ts/spec-405-demo-{desktop,mobile}-linux.png`.
  Sorties : `e2e.json`, `e2e.xml`, `visual/`.
