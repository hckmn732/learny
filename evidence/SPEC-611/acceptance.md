# SPEC-611 — critères d'acceptation

- ✅ CA-1 — `start.test.ts` (N = 12 pour 11 notions, 20 au plafond) et test d'intégration « CA-1 » : 12 questions, 11 notions couvertes, ≥ 3 ouvertes, ≥ 5 `choice_question`. Preuve : `packages/services/test/integration/quiz-attempt.test.ts`.
- ✅ CA-2 — test d'intégration « CA-2 » : deux tentatives successives sans brique commune ; banque signalée → 202 `preparing` et lignes `question_bank_jobs` créées. Preuve : `packages/services/test/integration/quiz-attempt.test.ts`.
- ✅ CA-3 — test d'intégration « CA-3, CA-7 » (verrou, idempotence, brouillon refusé 409) et e2e « passe une tentative complète » : « Pas tout à fait. » + explication « Le type de pièce… », option verrouillée. Preuve : `apps/web/e2e/specs/p6/quiz-attempt.spec.ts`, vidéo associée.
- ✅ CA-4 — e2e « passe une tentative complète » et `QuestionCard.test.tsx` : « Tentative 2 », « Seuil 80 % », « Question 4 sur 12 », pastille « Choix unique », « Notion : Type de pièce », note « Correction immédiate · nouvelles questions à chaque tentative ».
- ✅ CA-5 — `score.test.ts` (8 justes / 9 auto + 1 + 0,5 + 0 = 79,17) et intégration « CA-5 » : `quiz-grade` note les ouvertes, calcule `score` et `per_notion`, écrit `review_logs` (`source='validation'`) et émet `quiz/graded`.
- ✅ CA-6 — `score.test.ts` : seuil 85 refuse 84 et accepte 85 (`isPassed`).
- ✅ CA-7 — intégration « CA-3, CA-7 » (double vérification → un seul enregistrement) et e2e « reprise après rechargement » : question 1 restaurée avec le brouillon, puis reprise à la question 2 après vérification.
- ✅ CA-8 — intégration « CA-8 » (sans abonnement : statut `submitted`, notification `ai_task_failed`, relance par `POST submit`) et e2e « correction en attente si le tuteur est indisponible ».
- ✅ CA-9 — e2e « écran de question conforme » : jetons `#F4F4F1` / `#FFFFFF`, police Inter, axe sans violation serious/critical, capture `quiz-question.png` et capture de preuve `feedback-faux`. Preuve : `evidence/SPEC-611/screenshots/`.
