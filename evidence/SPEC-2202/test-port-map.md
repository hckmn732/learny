# Portage des tests — SPEC-2202

Référence : `evidence/SPEC-2001/test-port-map.md` et `api/oracles/vectors/learning-engine.json`.
Ce document consigne, pour chaque module du domaine déjà porté, le test TypeScript d'origine, le
fichier pytest qui le porte, le nombre de cas et la fixture d'oracle. Les cas sont conservés ; les
assertions portent sur les mêmes valeurs.

## Méthode de vérification du domaine

Le domaine Python est comparé au moteur TypeScript **avant** l'écriture des tests : un script `tsx`
rejoue les mêmes entrées avec `@learny/learning-engine` ou `@learny/bricks`, un script Python rejoue
les mêmes entrées avec `learny`, et une comparaison récursive exige l'égalité stricte (aucune
tolérance sur les flottants, les entiers, les chaînes et **l'ordre des clés**). Les sorties
enregistrées depuis TypeScript sont ensuite committées comme fixtures et rejouées par pytest, donc
la preuve est reproductible sans TypeScript.

| Fixture | Producteur | Contenu |
|---|---|---|
| `packages-py/learny/tests/fixtures/learning_engine_fsrs.json` | `ts-fsrs` 5.4.2 via `applyReview` | 4 séquences de notes × 10 instants + le preview des quatre notes |
| `packages-py/learny/tests/fixtures/learning_engine_grade.json` | `gradeReview` | 12 décisions (auto-évaluation, erreur, trop lent, trop rapide, incomplet, bornes strictes) |
| `packages-py/learny/tests/fixtures/learning_engine_domain.json` | `calculateMastery`, `calculateRetention`, `calculateProgress`, `calculateStreak`, `detectMilestones` | 2 + 3 + 3 + 2 + 2 cas |
| `packages-py/learny/tests/fixtures/learning_engine_gaps.json` | `detectGap`, `clearGap` | 10 détections + 5 levées, preuves françaises comprises |
| `packages-py/learny/tests/fixtures/learning_engine_global_quiz.json` | `buildDailySession`, `drawSmoothQuizSession`, `interleaveByModule`, `weightedFormatPick`, `chooseGapFormat` | 8 variantes de session + lissage + entrelacement + 6 tirages + 8 choix de format |
| `packages-py/learny/tests/fixtures/learning_engine_warmup.json` | `selectWarmup`, `warmupCandidates` | 6 variantes (portée, taille, sans lien, autre graine) |
| `packages-py/learny/tests/fixtures/learning_engine_draw.json` | `drawAttempt` | 8 variantes (dont l'entrée inversée, la banque épuisée et les empreintes vues) |
| `packages-py/learny/tests/fixtures/learning_engine_planner.json` | `planSchedule`, `replanSchedule`, `findCompatibleSlots`, `assertPlannerParams`, `assertPreferences`, `maxChunkMinutes` | 22 plans (dont pause, séance manquée, déplacement manuel, chevauchement, capacité dépassée, changement d'heure, module validé, échéance bloquée), 5 recherches de créneaux, 22 erreurs codées et 4 valeurs d'aide |
| `packages-py/learny/tests/fixtures/bricks_contract.json` | `normalizeText`, `sha256Hex`, `shuffleSeeded`, `brickFingerprint`, `toPublicBrick`, `gradeBrick`, `clampTutorScore` | 13 exemples normalisés (valid + invalid), 22 normalisations, 5 empreintes SHA-256, 5 mélanges, 8 empreintes de question, 13 payloads publics, 20 corrections, 14 refus, 5 notes de tuteur |
| `packages-py/learny/tests/fixtures/bricks_validation.json` | `parseBrickPayload`, `validateBrick` | 65 charges utiles (13 types × valid/invalid/vide/clé inconnue/défauts) et 61 brouillons validés par un résolveur en mémoire |

## Écart de message documenté

Les messages des règles internes, des règles communes, des références et des corrections sont
**repris mot pour mot** du TypeScript et comparés à l'identique. Les messages des erreurs
`SCHEMA_INVALID` (schémas de charge utile et schémas de réponse) sont, eux, écrits en anglais par le
validateur Python au lieu d'être copiés des messages internes de Zod : le contrat stable consommé par
la boucle de tutorat (SPEC-508) est le triplet `code` + `path` + ordre, et ADR-2011 impose des
messages internes anglais. La comparaison d'oracle porte donc, pour ce seul code, sur `code`,
`path`, l'ordre et le nombre d'issues — jamais sur le texte.

## Modules portés — moteur d'apprentissage (`learny/learning/domain/`)

| Test TypeScript | Cas | Équivalent pytest | Cas portés | Vérification |
|---|---|---|---|---|
| `packages/learning-engine/src/fsrs/review.test.ts` | 25 | `tests/unit/learning-engine/test_review.py` | 12 décisions de note, 4 séquences de cartes, preview, médiane personnelle, refus de rétention et de note | égalité stricte avec `ts-fsrs` 5.4.2 (aucune dépendance au paquet `fsrs`) |
| `packages/learning-engine/src/mastery/calculate.test.ts` | 14 | `.../test_calculate.py` | 2 cas enregistrés + les 2 vecteurs de `api/oracles/vectors/learning-engine.json` + réponse postérieure + historique vide | vecteurs d'oracle rejoués à l'identique |
| `packages/learning-engine/src/streak/calculate.test.ts` | 31 | `.../test_calculate.py` | 2 cas enregistrés + jour hors rythme + jalons | égalité stricte |
| `packages/learning-engine/src/metrics/retention.test.ts` | 30 | `.../test_retention.py` | 3 cas enregistrés + horizon sans revue + première revue de la fenêtre | égalité stricte |
| `packages/learning-engine/test/integration/metrics.test.ts` | 3 | `.../test_metrics.py` | 3 cas enregistrés + état `no_modules` | égalité stricte |
| `packages/learning-engine/src/gaps/detect.test.ts` | 39 | `.../test_detect.py` | 10 détections + 5 levées enregistrées, normalisation, dualité échec/réussite, clé d'erreur, refus d'incohérence | égalité stricte, textes de preuve compris |
| `packages/learning-engine/src/global-quiz/build-daily-session.test.ts` | 20 | `.../test_build_daily_session.py` | 8 variantes enregistrées, lissage, entrelacement, réintroduction, 6 tirages pondérés, 8 choix de format, banque invalide | égalité stricte, PRNG ensemencé identique |
| `packages/learning-engine/src/session/format-choice.test.ts` | 9 | `.../test_build_daily_session.py` | 8 choix de format + 6 tirages | égalité stricte |
| `packages/learning-engine/src/warmup/select.test.ts` | 16 | `.../test_select.py` | 6 variantes enregistrées (choix et candidats), chapitre inaccessible, taille refusée, notion en double | égalité stricte |
| `packages/learning-engine/src/draw/draw-attempt.test.ts` | 23 | `.../test_draw_attempt.py` | 8 variantes enregistrées, indépendance à l'ordre d'entrée, cible hors bornes, brique sans empreinte | égalité stricte, PRNG ensemencé identique |
| `packages/learning-engine/src/random.test.ts` | 5 | `.../test_random.py` | 5 cas (valeurs FNV-1a, reproductibilité, graines distinctes, non-mutation, départage par clé) | égalité stricte |
| `packages/learning-engine/src/params.test.ts` | 5 | `.../test_params.py` | 5 cas (défauts, fusion profonde, tableaux remplacés, liste autorisée, paramètre inconnu et protection d'`ENGINE`) | égalité stricte |
| `packages/learning-engine/src/time.test.ts` | 9 | `.../test_time.py` | instants impossibles, jour civil, heure locale, fuseau, lecture décalée par le saut DST | cas équivalents (les cas de `@learny/core` restent couverts par `packages/core`) |
| `packages/learning-engine/src/types.test.ts` | 9 | `.../test_types.py` | 24 cas : disponibilité valide et ses 8 refus `INVALID_AVAILABILITY` (CL-6), carte FSRS valide et 8 refus de champ, `-0`/NaN/Infini/champ manquant/champ inconnu (CL-9), `DateRange`, `NotionRef`, `AnswerRecord`, `GapState`, heure locale, fuseau | égalité stricte ; les propriétés *fast-check* deviennent des cas explicites |
| `packages/learning-engine/src/planner/plan.test.ts` | 20 | `.../test_plan.py` | 49 cas : 22 plans enregistrés, replanification, 5 recherches de créneaux, capacité quotidienne, marges de 60 min, quiz global quotidien, jours d'étude et fériés, indépendance à l'ordre, examens blancs et sprints, changement d'heure | égalité stricte, PRNG et arrondis identiques |
| `packages/learning-engine/src/planner/plan-validation.test.ts` | 10 | `.../test_plan_validation.py` | 37 cas : 22 erreurs d'entrée enregistrées, 4 valeurs de `maxChunkMinutes`, créneaux annulés/déplacés, formation en pause, déplacement manuel hors jour d'étude et en chevauchement, quiz global existant, dépassement de capacité, créneau à cheval sur minuit | égalité stricte (code, chemin et message des erreurs) |
| `packages/learning-engine/test/integration/planner.test.ts` | 6 | `tests/integration/learning-engine/test_learning_planner_composition.py` | 6 | égalité stricte : capacité cumulée, rejeu d'une séance manquée, changements d'heure |

## Modules portés — briques (`learny/assessments/domain/bricks/`)

| Test TypeScript | Cas | Équivalent pytest | Cas portés | Vérification |
|---|---|---|---|---|
| `packages/bricks/src/normalize.test.ts` | 1 | `tests/unit/assessments/test_normalize.py` | 28 cas : 8 entrées enregistrées × 3 propriétés (forme, clé, idempotence), repli typographique, diacritiques, ponctuation finale | égalité stricte |
| `packages/bricks/src/fingerprint.test.ts` | 5 | `.../test_fingerprint.py` | 27 cas : 8 empreintes enregistrées (7 questions + un type de contenu), absence d'empreinte sur six types, insensibilité à la casse et aux accents, ordre des trous, libellés de catégorie | égalité stricte (SHA-256 compris) |
| `packages/bricks/src/public.test.ts` | 6 | `.../test_public.py` | 45 cas : 13 projections enregistrées, champs de correction toujours absents (CA-4), stabilité par version, ordre différent par version, rotation de l'ordre correct, droits opaques | égalité stricte, mélange ensemencé identique |
| `packages/bricks/src/grade.test.ts` + `types/*/grade.test.ts` | 48 | `.../test_grade.py` | 94 cas : 20 corrections enregistrées, 14 refus (code + chemins), 5 bornes de note de tuteur, refus des trois types du tuteur et des quatre types sans correction, formule du choix multiple, distracteur, déduplication des confusions | égalité stricte sur la correction entière |
| `packages/bricks/src/types/*/schema.test.ts` + `validate.test.ts` | 35 | `.../test_schema.py` | 82 cas : 65 charges utiles enregistrées, valeurs par défaut, chemins d'erreur, valeurs par défaut du minuteur, refus de type inconnu, `trimDeep`, caractères de contrôle (CL-11), UUID, raffinements d'emplacement et de production | `code` + `path` (message anglais, cf. écart documenté) |
| `packages/bricks/src/validate.test.ts` + `validate-locations.test.ts` | 40 | `.../test_bricks_validation.py` | 93 cas : 61 brouillons enregistrés avec un résolveur en mémoire, empreinte, type de contenu sans empreinte, chemin exact d'une clé inconnue, aucun appel au résolveur sur schéma invalide, toutes les issues d'une étape ensemble, injection traitée comme donnée (CL-10), règles d'origine et de notion, références inconnues, ressource supprimée, emplacements | égalité stricte ; messages comparés sauf `SCHEMA_INVALID` |
| `packages/bricks/src/registry.test.ts` + `architecture.test.ts` | 7 | `.../test_registry.py` | 10 cas : treize types enregistrés, contrat de chaque définition, mode de correction de BR-BRI-08, exigence de notion, empreinte des sept questions, projection ensemblée, absence d'import interdit et d'horloge (CA-7) | contrôle d'architecture par AST |

Total : **1313 tests pytest**, dont **71 ajoutés par cette tranche** (49 tests d'intégration du
moteur et 22 helpers de lecture), tous marqués `pytestmark = pytest.mark.spec("SPEC-2202")`.

| `packages/bricks/src/types/instruction/response.ts` | 7 | `.../test_helpers.py` | 8 cas : tableau dans les bornes, tableau trop court, clé inconnue, texte dans les bornes, texte trop court, fichier, lien HTTPS accepté puis refusé | égalité stricte (valeur ou `path` des issues) |
| `packages/bricks/src/types/instruction/table-checks.ts` | 7 | `.../test_helpers.py` | 20 nombres français analysés, 10 formats `Intl`, 4 contrôles de somme (vide, déséquilibré, groupe inconnu), côté de chaque ligne | égalité stricte, séparateur de milliers U+202F compris |
| `packages/bricks/src/types/timer/state.ts` | 8 | `.../test_helpers.py` | 10 affichages `mm:ss`/`h:mm:ss`, 7 états (démarrage, en cours, alerte, seuil exact, expiré, horloge reculée, longue durée) | égalité stricte, horloge passée en millisecondes |
| `packages/bricks/src/types/scoring/compute.ts` | 11 | `.../test_helpers.py` | 5 barèmes d'activité (égal, pondéré, ratios hors bornes, sans item, total nul), erreur `SCORING_ITEM_UNKNOWN`, 8 verdicts d'exercice (indices, indices négatifs ou fractionnaires, critère inconnu) | égalité stricte |

## Modules du domaine restant à porter

| Test TypeScript | Module pytest | Cas | État |
|---|---|---|---|
| `packages/learning-engine/test/integration/planner.test.ts` | `tests/integration/learning-engine/test_learning_planner_composition.py` | 6 | porté |
| `.../integration/gaps.test.ts` | `.../test_learning_gaps_composition.py` | 7 | porté |
| `.../integration/fsrs.test.ts` | `.../test_learning_fsrs_composition.py` | 5 | porté |
| `.../integration/mastery.test.ts` | `.../test_learning_mastery_composition.py` | 4 | porté |
| `.../integration/streak.test.ts` | `.../test_learning_streak_composition.py` | 4 | porté |
| `.../integration/draw-attempt.test.ts` | `.../test_learning_draw_composition.py` | 4 | porté |
| `.../integration/engine-boundaries.test.ts` | `.../test_learning_engine_boundaries.py` | 3 | porté (analyse par AST des sources Python) |
| `.../integration/metrics.test.ts` | `tests/unit/learning-engine/test_metrics.py` | 4 | déjà porté (tranche précédente) |
| `packages/learning-engine/src/fixtures/builders.test.ts` | `.../test_learning_engine_factories.py` | 9 | porté (les propriétés *fast-check* deviennent des cas explicites) |
| `packages/learning-engine/src/fixtures/sap-reference.test.ts` | `.../test_learning_sap_reference.py` | 7 | porté |
| `packages/bricks/src/types/*/response.ts` (6 types) | couvert | — | porté avec la correction |
| `packages/bricks/src/registry-answers.test.ts` | `tests/unit/assessments/test_registry.py`, `test_normalize.py` | 2 | déjà porté |
| `packages/bricks/src/correction-view.ts` | aucun module | 0 | **union de types seulement** : aucun code exécutable côté TypeScript, donc rien à porter en Python (les formes sont décrites par les modèles du contrat) |
| `packages/bricks/src/examples.ts` et `types/*/examples.ts` | `bricks_contract.json` | 13 | déjà enregistrés dans la fixture des briques (exemples `valid`/`invalid`) |
| `packages/bricks/src/view/*` et `types/*/view.tsx` (≈ 20 cas) | — | — | hors périmètre (vues React, SPEC-503) |
| `packages/bricks/src/view/{labels,markdown}.test.ts` | — | — | hors périmètre (rendu, SPEC-503) |

Les fixtures `learning_engine_reference.json` (instantané de référence, jeu SAP de 7 modules,
24 chapitres et 48 notions, liens, maîtrise, lacunes, fabriques) et le helper
`tests/factories/learning_support.py` sont **enregistrés depuis le moteur TypeScript** le 2026-11-21 :
les tests rejouent ces sorties au lieu de les transcrire.

## Étape 3 — services et handlers `learning` (11 opérations basculées)

Les cas ci-dessous ne rejouent pas de fixtures TypeScript : ils exercent les cas d'usage Python
contre la pile Postgres locale, sous la transaction RLS de l'apprenant, et vérifient les mêmes
règles métier que les tests de service équivalents (`packages/services/test/integration/*.test.ts`
et les cas de route de `packages/services/src/**/*.test.ts`).

| Test TypeScript source | Cas source | Module pytest | Cas portés | Écart |
|---|---|---|---|---|
| `agenda/get-agenda.test.ts`, `spec-705.spec.ts` | 7 + agenda | `tests/integration/learning-engine/test_learning_agenda_gaps.py` | cibles de créneaux, libellés, totaux, raffinements de période | lecture pure ; la parité HTTP couvre le 400 |
| `gaps/links.test.ts`, `gaps/list-gaps.test.ts` | 4 + 6 | idem | liens d'entraînement et de cours | idem |
| `serie-regularite-et-jalons-interface.test.ts`, `streak-milestones-route.test.ts` | 5 | `tests/integration/learning/test_learning_series.py` | série, régularité, jalons idempotents, 404, prochain jalon | notification de jalon non portée (dette SPEC-209) |
| `final-review.test.ts` | 6 | `tests/integration/learning/test_learning_final_review.py` | agrégats, incomplet 409, 404/400, modes, version périmée | le cas `unlockModule` (SPEC-612) n'est pas rejoué ici |
| `agenda-deplacer-et-reajuster-le-planning.test.ts` | 2 | `tests/integration/learning/test_learning_slots_replan.py` | alternatives, déplacement, chevauchement, options, allègement, version de plan | couverture élargie aux refus |
| `warmup/warmup.test.ts`, `derive.test.ts` (partie lecture) | 5 + 9 | `tests/integration/learning/test_learning_warmups.py` | carte du jour, statut, RLS, item illisible, dérivées pures | l'écriture d'une réponse (EF-8/9) reste `ts` |

Reste non porté dans ce contexte : `warmups.answers.create`, `review.globalQuizToday`,
`review.answer`, `review.complete`. Ils dépendent de `packages/services/src/learning/apply-result.ts`
(FSRS, maîtrise, lacunes, `review_logs`) et du service `review` (session du jour, correction,
complétion), dont le portage est la tranche suivante. Leurs entrées restent `ts` et leurs
handlers ne sont pas enregistrés, ce que vérifie `apps/api-py/tests/unit/test_handlers.py`.
