# SPEC-511 — critères d’acceptation

- ✅ CA-1 — Une recherche de fixture ordonne les passages par similarité cosinus, mais n’inclut aucun passage d’un second membre du groupe.
  Preuve : `packages/ingestion/src/retrieval/search-context.test.ts` (« trie par score… »), `packages/ingestion/test/integration/search-context.test.ts` (« CA-1, CL-1… », deux utilisateurs d’un même groupe, scores 1 puis 0, passage du membre exclu), e2e `@SPEC-511` (scores décroissants, `spec-511-member-excluded`).
- ✅ CA-2 — Les budgets 6k/24k/4k/8k incluent balises et identifiants et ne sont jamais dépassés.
  Preuve : tests unitaires « respecte les budgets 6k, 24k, 4k et 8k… » et « réserve le coût des balises… » ; test d’intégration « CA-2 — les budgets… » (`estimatedTokens ≤ tokenBudget`, documents complets) ; e2e `@SPEC-511` (jauge `spec-511-budget-*`).
- ✅ CA-3 — Passages dupliqués ou chevauchants sont dédupliqués et ordre stable à entrées permutées.
  Preuve : tests unitaires « déduplique un passage identique… » et « trie par score… » (entrées inversées, texte identique) ; test d’intégration « CA-3 — déduplique… (permutation) » ; démonstration `spec-511-context-card` (« doublon(s) écarté(s) »).
- ✅ CA-4 — Un texte injectant `</document>` reste contenu dans les balises et ne crée aucune instruction hors donnée.
  Preuve : tests unitaires « échappe le texte et les attributs… » (`&lt;/document&gt;`, une seule fermeture) ; test d’intégration « CA-4 — un texte injectant `</document>`… » ; e2e `@SPEC-511` (`spec-511-trap-formatted`, absence de `<system>`).
- ✅ CA-5 — La démonstration montre scores, budget et balises sûres avec vidéo, axe et `@visual`.
  Preuve : `apps/web/e2e/specs/p5/spec-511.spec.ts` (test `@SPEC-511` avec vidéo et capture `spec-511-demo`, test `@SPEC-511 @visual @mobile`), axe sans violation serious/critical, captures desktop/mobile et lignes de base `apps/web/e2e/__screenshots__/p5/spec-511.spec.ts/`, rapports `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, vidéos dans `evidence/SPEC-511/`.
