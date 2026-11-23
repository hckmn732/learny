# SPEC-3304 — Quiz de validation et résultat : preuves d'acceptation

Branche `spec/SPEC-3304-quiz-de-validation-et-resultat`, worktree `/root/wt/SPEC-3304`, pile locale
(`LLM_MODE=mock`, `CLOCK_FIXED_AT=2026-11-11T12:20:00Z`, `RATE_LIMIT_MODE=off`), émulateur local
(ADR-3018). Maquette de référence : `design/app-mobile/exports/screens/{ios,android}-05-quiz.png`
et l'état `exports/states/ios-resultat.png`, lus avec les corrections d'ADR-3003 § 2 et la décision
ADR-3023.

`SPEC-3302` (écran Cours) est fusionnée sur `mobile` après la création de ce worktree : le quiz est
donc ouvert depuis **Programme** et depuis la **fiche du module** ; la route `quiz/[attemptId]` est
indépendante de son point d'entrée, et l'entrée « depuis le cours » réutilisera la même route à la
fusion (ADR-3023 § 4).

## Livré

- `apps/mobile/src/features/quiz/question-machine.ts` — machine à états de la question
  (choisir → vérifier → corrigée, verrouillage), reprise à la première question sans réponse.
- `apps/mobile/src/features/quiz/progress-segments.ts` — barre segmentée (juste, faux, en attente,
  courante, à venir) et compteurs de correction.
- `apps/mobile/src/features/quiz/correction-view.ts` — adaptation de `QuizFeedback` au rendu des
  briques (`CorrectionView` de `@learny/bricks`), sans recalcul de verdict.
- `apps/mobile/src/features/quiz/start-attempt.ts` — boucle de création qui attend la banque de
  questions (202 `preparing`) ; `use-start-quiz.ts` la relie à l'API, à la clé d'idempotence par
  intention et à la date de nouvelle tentative (`RETRY_NOT_YET_ALLOWED`).
- `apps/mobile/src/data/attempts.ts` — `useAttempt`, `useAttemptResult` (rafraîchissement de 5 s
  tant que des ouvertes attendent le tuteur), mutations `saveAnswer`, `checkAnswer`,
  `submitAttempt`, clés `['attempt', aid]` et `['attempt', aid, 'result']`.
- `apps/mobile/src/features/quiz/{QuizScreen,QuizHeader,ProgressSegments,QuitConfirmSheet,ResultScreen}.tsx`
  — écran plein écran (en-tête « Question n sur N », « Tentative 2 · seuil 80 % », mention
  BR-QUI-07, aucun chronomètre), pied « Vérifier » puis « Question suivante »/« Terminer la
  tentative », confirmation de sortie, résultat (score, seuil, verdict, score par notion, lacunes
  avec nature, notions acquises, historique en barres, actions BR-QUI-05/BR-QUI-06).
- `apps/mobile/app/quiz/[attemptId].tsx`, `apps/mobile/app/quiz/[attemptId]/resultat.tsx` — routes
  hors des onglets ; une tentative déjà soumise ouvre directement le résultat (CL-3), une ouverture
  hors ligne affiche « Le quiz de validation nécessite une connexion » (CL-6).
- `apps/mobile/app/(app)/programme/module/[moduleId].tsx`, `src/features/programme/ProgrammeScreen.tsx`
  — points d'entrée natifs (« Quiz de validation ») : création ou reprise de la tentative puis
  ouverture de l'écran ; message de préparation et message de refus (date de nouvelle tentative).
- `packages/i18n/src/fr/mobile.ts` — espace `mobile.quiz` (français, vouvoiement).
- `apps/mobile/src/lib/haptics.ts` — `successFeedback` / `warningFeedback` (EF-8, réglage système).
- Tests : Vitest `question-machine.test.ts` (6), `progress-segments.test.ts` (6),
  `start-attempt.test.ts` (5), intégration `test/integration/attempts.int.test.ts` (3) ; Jest
  `test/quiz/quiz-screen.test.tsx` (4), `quit-confirm.test.tsx` (3), `result-screen.test.tsx` (5).
- `apps/mobile/e2e/flows/SPEC-3304-quiz.yaml` (`@SPEC-3304 @visual`),
  `apps/mobile/e2e/sql/SPEC-3304-seed-quiz.sql` et `SPEC-3304-cleanup-quiz.sql`.
- `docs/adr/ADR-3023-quiz-de-validation-mobile-conformite-et-tentative-preparee.md`.

## Critères d'acceptation

- ✅ CA-1 — Une tentative se joue de bout en bout : chaque « Vérifier » affiche la correction et
  verrouille la réponse ; la soumission ouvre le résultat. Preuves : Vitest
  `question-machine.test.ts` (« choisit, vérifie et verrouille la réponse », « garde la sélection
  quand la vérification échoue »), Jest `quiz-screen.test.tsx` (correction affichée, `brick-option`
  inerte après vérification, `quiz-next`/`quiz-finish`), e2e `SPEC-3304-quiz.yaml` (deux questions
  vérifiées, `brick-feedback` visible, reprise à la question 3), intégration
  `attempts.int.test.ts` (refus de vérifier une tentative corrigée).
- ✅ CA-2 — L'en-tête affiche « Question n sur N », « Tentative 2 · seuil 80 % » et la mention
  BR-QUI-07 ; aucun chronomètre. Preuves : Jest `quiz-screen.test.tsx` (« affiche Question 1 sur 2,
  Tentative 2 · seuil 80 % et la mention », absence de `quiz-timer`), e2e (assertions sur
  `quiz-count`, `quiz-attempt-meta`, `quiz-mention`, `assertNotVisible: quiz-timer`), capture
  `@visual`.
- ✅ CA-3 — Une tentative réussie valide le module et le module suivant apparaît débloqué ; une
  tentative échouée affiche lacunes, remédiation (web) et date de nouvelle tentative. Preuves
  serveur : intégration `attempts.int.test.ts` (résultat complet du jeu de démonstration : score 58,
  seuil 80, lacunes par notion, historique, décision de nouvelle tentative) ; écran : Jest
  `result-screen.test.tsx` (« ouvre le module suivant après une réussite », « propose la remédiation
  sur le web et la date de nouvelle tentative »). La validation du module et le déblocage du suivant
  sont calculés par le serveur (SPEC-611/612, suites web) : le compte de démonstration ne permet pas
  de rejouer une tentative réussie sans muter la progression (ADR-3023 § 5).
- ✅ CA-4 — Quitter puis rouvrir reprend à la première question sans réponse. Preuves : Vitest
  `question-machine.test.ts` (« reprend à la première question sans réponse »), Jest
  `quit-confirm.test.tsx` (confirmation, « Continuer », « Quitter »), e2e (croix → feuille de
  confirmation → « Quitter » → réouverture depuis Programme → « Question 3 sur 10 »).
- ✅ CA-5 — Quiz et résultat conformes à la maquette corrigée (écart ≤ 12 % hors zones masquées).
  Preuve : flux `@SPEC-3304 @visual` (capture `SPEC-3304-quiz`), comparaison pixel à la ligne de
  base versionnée `apps/mobile/e2e/visual/baselines/SPEC-3304-quiz.png` (ADR-3003 § 4) ; contrôles
  structurels et de jetons décrits dans ADR-3023 § 1 et § 2.

## Validations

_(à compléter par la sortie de `validate.mjs`)_

## Écarts et décisions

1. **Chronomètre de la maquette supprimé** — ADR-3003 § 2, BR-QUI-07 : aucun chronomètre n'est
   affiché ; la zone n'est donc pas comparée ni masquée (ADR-3023 § 1).
2. **État `ios-resultat.png` non comparé** — état de démonstration simulé, contenu serveur
   (score par notion, lacunes, historique) absent de la maquette ; conformité prouvée par les jetons,
   la structure et les tests d'écran (ADR-3023 § 2).
3. **iOS** — aucune campagne iOS (pas de macOS, ADR-3018) ; aucun fichier spécifique de plateforme.
4. **Tentative préparée pour la campagne** — la pile locale ne régénère pas la banque de questions
   (jobs Inngest retirés) : le flux joue une tentative en cours préparée par
   `e2e/sql/SPEC-3304-seed-quiz.sql` et supprimée par `…-cleanup-quiz.sql` ; aucune soumission, donc
   aucune mutation du jeu de démonstration (ADR-3023 § 4).
5. **Délai de nouvelle tentative (CL-5)** — décision serveur (SPEC-612/715) ; le compte de
   démonstration autorise la reprise, le test d'intégration vérifie donc la forme de la décision
   (`allowed`, `reason`, `remediationRequired`) et `useStartQuiz` le formatage de la date
   (ADR-3023 § 5).
6. **Entrées Aujourd'hui et Agenda** — elles conservent leur renvoi au web (ADR-3002) : le quiz
   mobile est ouvert depuis Programme et la fiche du module ; l'entrée depuis le cours suivra la
   fusion de SPEC-3302.

## Tests préexistants hors périmètre

Échecs connus de la branche `mobile`, non réparés (décision du porteur, `evidence/SPEC-3001/acceptance.md`) :
`packages/config/src/commit-rules.test.ts`, `apps/web/test/unit/bundle-split.test.ts`,
`tools/migration/test/unit/report.test.ts`.
