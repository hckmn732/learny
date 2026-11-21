# Portage des tests — SPEC-2202

Référence : `evidence/SPEC-2001/test-port-map.md` et `api/oracles/vectors/learning-engine.json`.
Ce document consigne, pour chaque module du domaine déjà porté, le test TypeScript d'origine, le
fichier pytest qui le porte et le nombre de cas. Les cas sont conservés ; les assertions portent sur
les mêmes valeurs.

## Méthode de vérification du domaine

Le domaine Python est comparé au moteur TypeScript **avant** l'écriture des tests : un script
`tsx` rejoue les mêmes entrées avec `@learny/learning-engine`, un script Python rejoue les mêmes
entrées avec `learny.learning.domain`, et une comparaison récursive exige l'égalité stricte (aucune
tolérance sur les flottants, les entiers, les chaînes et l'ordre des clés). Les sorties enregistrées
depuis TypeScript sont ensuite committées comme fixtures et rejouées par pytest, donc la preuve est
reproductible sans TypeScript.

| Fixture | Producteur | Contenu |
|---|---|---|
| `packages-py/learny/tests/fixtures/learning_engine_fsrs.json` | `ts-fsrs` 5.4.2 via `applyReview` | 4 séquences de notes × 10 instants + le preview des quatre notes |
| `packages-py/learny/tests/fixtures/learning_engine_grade.json` | `gradeReview` | 12 décisions (auto-évaluation, erreur, trop lent, trop rapide, incomplet, bornes strictes) |
| `packages-py/learny/tests/fixtures/learning_engine_domain.json` | `calculateMastery`, `calculateRetention`, `calculateProgress`, `calculateStreak`, `detectMilestones` | 2 + 3 + 3 + 2 + 2 cas |
| `packages-py/learny/tests/fixtures/learning_engine_gaps.json` | `detectGap`, `clearGap` | 10 détections + 5 levées, preuves françaises comprises |
| `packages-py/learny/tests/fixtures/learning_engine_global_quiz.json` | `buildDailySession`, `drawSmoothQuizSession`, `interleaveByModule`, `weightedFormatPick`, `chooseGapFormat` | 8 variantes de session + lissage + entrelacement + 6 tirages + 8 choix de format |
| `packages-py/learny/tests/fixtures/learning_engine_warmup.json` | `selectWarmup`, `warmupCandidates` | 6 variantes (portée, taille, sans lien, autre graine) |
| `packages-py/learny/tests/fixtures/learning_engine_draw.json` | `drawAttempt` | 8 variantes (dont l'entrée inversée, la banque épuisée et les empreintes vues) |

## Modules portés (`learny/learning/domain/`)

| Test TypeScript | Cas | Équivalent pytest | Cas portés | Vérification |
|---|---|---|---|---|
| `packages/learning-engine/src/fsrs/review.test.ts` | 25 | `packages-py/learny/tests/unit/learning-engine/test_review.py` | 12 décisions de note, 4 séquences de cartes, preview, médiane personnelle, refus de rétention et de note | égalité stricte avec `ts-fsrs` 5.4.2 (aucune dépendance au paquet `fsrs`) |
| `packages/learning-engine/src/mastery/calculate.test.ts` | 14 | `.../test_calculate.py` | 2 cas enregistrés + les 2 vecteurs de `api/oracles/vectors/learning-engine.json` (maîtrise, poids, sommes, drapeaux) + réponse postérieure + historique vide | vecteurs d'oracle rejoués à l'identique |
| `packages/learning-engine/src/streak/calculate.test.ts` | 31 | `.../test_calculate.py` | 2 cas enregistrés + jour hors rythme + jalons | égalité stricte |
| `packages/learning-engine/src/metrics/retention.test.ts` | 30 | `.../test_retention.py` | 3 cas enregistrés + horizon sans revue (taux nul) + première revue de la fenêtre | égalité stricte |
| `packages/learning-engine/test/integration/metrics.test.ts` | 3 | `.../test_metrics.py` | 3 cas enregistrés + état `no_modules` | égalité stricte |
| `packages/learning-engine/src/gaps/detect.test.ts` | 39 | `.../test_detect.py` | 10 détections + 5 levées enregistrées, normalisation, dualité échec/réussite, clé d'erreur, refus d'incohérence | égalité stricte, textes de preuve compris |
| `packages/learning-engine/src/global-quiz/build-daily-session.test.ts` | 20 | `.../test_build_daily_session.py` | 8 variantes enregistrées, lissage, entrelacement, réintroduction, 6 tirages pondérés, 8 choix de format, banque invalide | égalité stricte, PRNG ensemencé identique |
| `packages/learning-engine/src/session/format-choice.test.ts` | 9 | `.../test_build_daily_session.py` | 8 choix de format (`chooseGapFormat`) + 6 tirages (`weightedFormatPick`) | égalité stricte |
| `packages/learning-engine/src/warmup/select.test.ts` | 16 | `.../test_select.py` | 6 variantes enregistrées (choix et candidats), chapitre inaccessible, taille refusée, notion en double | égalité stricte |
| `packages/learning-engine/src/draw/draw-attempt.test.ts` | 23 | `.../test_draw_attempt.py` | 8 variantes enregistrées, indépendance à l'ordre d'entrée, cible hors bornes, brique sans empreinte | égalité stricte, PRNG ensemencé identique |
| `packages/learning-engine/src/random.test.ts` | 5 | `.../test_random.py` | 5 cas (valeurs FNV-1a, reproductibilité, graines distinctes, non-mutation, départage par clé) | égalité stricte |
| `packages/learning-engine/src/params.test.ts` | 5 | `.../test_params.py` | 5 cas (défauts, fusion profonde, tableaux remplacés, liste autorisée, paramètre inconnu et protection d'`ENGINE`) | égalité stricte |
| `packages/learning-engine/src/time.test.ts` | 9 | `.../test_time.py` | instants impossibles, jour civil, heure locale, fuseau, lecture décalée par le saut DST | cas équivalents (les cas de `@learny/core` restent couverts par `packages/core`) |

Total : **126 tests pytest**, `pytestmark = pytest.mark.spec("SPEC-2202")`.

## Modules du domaine restant à porter

| Test TypeScript | Module pytest prévu | État |
|---|---|---|
| `packages/learning-engine/src/planner/*.test.ts` (30 cas) | `.../test_plan.py`, `.../test_plan_validation.py` | à porter (`planner/plan.ts`, `grid.ts`, `find-compatible-slots.ts`, `replan.ts`) |
| `packages/learning-engine/test/integration/{planner,gaps,fsrs,mastery,metrics,engine-boundaries,draw-attempt}.test.ts` | `.../integration/learning-engine/test_*.py` | à porter |
| `packages/learning-engine/src/fixtures/*.test.ts` (10 cas) | `.../test_builders.py`, `.../test_sap_reference.py` | fixtures de démonstration, à porter avec le planificateur |
| `packages/learning-engine/src/types.test.ts` (9 cas) | `.../test_types.py` | validateurs partiellement couverts par `test_review.py` (`validate_card`) et `test_select.py` (`assert_availability` reste à couvrir) |
| `packages/bricks/src/*.test.ts` (≈ 150 cas) | `packages-py/learny/tests/unit/bricks/test_*.py` | à porter (`learny/assessments/domain/bricks/`) |
