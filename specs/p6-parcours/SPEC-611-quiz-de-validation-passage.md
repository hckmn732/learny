---
id: SPEC-611
title: Quiz de validation : passage
phase: P6
priority: V1
depends_on: [SPEC-609, SPEC-405, SPEC-502, SPEC-503]
business_rules: [BR-QUI-01, BR-QUI-02, BR-QUI-03, BR-QUI-04, BR-QUI-07, BR-FOR-06]
screens: [SCR-09]
adrs: [ADR-0014, ADR-0170]
visual: mockup
---

# SPEC-611 — Quiz de validation : passage

## 1. Objectif

Permettre à l'apprenant de passer le quiz de validation d'un module : création d'une tentative à partir de la banque (nouvelles questions à chaque fois), écran de passage conforme à `Quiz.dc.html` (en-tête, progression, question typée, « Vérifier » avec correction immédiate, « Question suivante »), soumission, correction différée des questions ouvertes par le tuteur et calcul du score sur 100. Le résultat détaillé, le déblocage et la remédiation sont livrés par SPEC-612.

## 2. Contexte

Écran SCR-09, route `/formations/[fid]/modules/[mid]/quiz` (docs/product/screens.md). Le quiz est l'évaluation qui conditionne le déblocage du module suivant (BR-FOR-07, SPEC-612). Il s'appuie sur le tirage déterministe (SPEC-405), la correction par le code (SPEC-502) et le rendu des briques (SPEC-503).

À lire : `docs/product/business-rules.md` §QUI, §BRI, §LAC ; `docs/architecture/data-model.md` §5 (`activities`, `attempts`, `answers`), §6 (`notion_states`, `review_logs`) ; `docs/architecture/api.md` (routes « Quiz, examen, exercice ») ; `docs/architecture/overview.md` §5 (`quiz/submitted`, `quiz/graded`) ; ADR-0014, ADR-0170, ADR-0024, ADR-0025, ADR-0026 ; `design/maquettes/Quiz.dc.html` (partie `inQuestions` et script : `Q`, `segs`, `options`, `assoc`, `fbText`, `advanceLabel`).

## 3. Dépendances

- **SPEC-609** : page Cours et carte « Prêt pour le quiz de validation ? » dont le lien « Passer au quiz » mène ici ; fil d'Ariane (`Breadcrumb`).
- **SPEC-405** : `drawAttempt({ moduleNotions, gaps, seenFingerprints, bank, size, formatMix, seed })` → `{ items: [{ brickId, brickVersionId, notionId, format }], exhaustedNotionIds }`.
- **SPEC-502** : `grade(type, payload, response)` pour `choice_question`, `cloze`, `matching` → `{ isCorrect, score (0..1), chosenDistractorNotionId? }`.
- **SPEC-503** : vues `ChoiceQuestionView`, `ClozeView`, `MatchingView`, `OpenQuestionView` avec états `answering | checked` et prop `feedback`.
- Transitivement : SPEC-513 (`banks.requestRegeneration(userId, notionIds)`), SPEC-411 (`services.learning.applyResults`), SPEC-508 (action `grade_answer`, `tutor.run`), SPEC-203 (événements, fonctions Inngest), SPEC-201 (`handler`), SPEC-303 (Badge, Button, ProgressBar), SPEC-106 (tables).
- IA : seule la correction des ouvertes en a besoin (tâche `tutor`). Sans IA, le passage fonctionne ; la correction des ouvertes reste en attente (CL-6).

## 4. Règles métier couvertes

- **BR-QUI-01** — quiz de 12 questions par défaut, N = min(20, max(12, nombre de notions du module)) ≥ 10, mélange de formats (ADR-0170), barème sur 100, seuil du module (`modules.threshold`, ou `module_progress` pour le membre).
- **BR-QUI-02** — tentatives illimitées ; chaque tentative conserve réponses (`answers.response`), justesse, temps par question (`answers.time_ms`), score global et `per_notion`.
- **BR-QUI-03** — chaque tentative appelle `drawAttempt` avec toutes les empreintes déjà vues par l'apprenant (toutes activités confondues), couvre chaque notion, surpondère les lacunes ; si une notion est épuisée, régénération de la banque avant la création (202 « préparation »).
- **BR-QUI-04** — « Vérifier » corrige immédiatement les questions corrigées par le code et affiche l'explication ; la réponse est verrouillée ; les ouvertes sont enregistrées et corrigées par le tuteur à la soumission.
- **BR-QUI-07** — l'écran affiche « Tentative n », « Seuil x % », la progression « Question n sur N » et ses segments, le type de question, « Notion : … », et « Correction immédiate · nouvelles questions à chaque tentative ».
- **BR-FOR-06** — le seuil affiché et appliqué est celui du module (60 à 95 %, défaut 80 %), jamais une constante.

## 5. Exigences fonctionnelles

- **EF-1 — Entrée** : `/formations/[fid]/modules/[mid]/quiz`. Le Server Component : vérifie que le module est `open` ou `validated` pour l'apprenant (sinon redirection vers le module avec message « Ce module est verrouillé. ») ; s'il existe une tentative `in_progress` de quiz de validation du module, il la reprend à la première question non vérifiée ; sinon le client crée une tentative (`POST`) au montage avec un état de chargement « Préparation de votre quiz… ».
- **EF-2 — En-tête** : fil d'Ariane « Programme / Module n · <titre> / Quiz de validation », titre h1 « Quiz de validation », pastille noire « Tentative n », pastille blanche « Seuil 80 % », bouton carré « × » `aria-label="Quitter le quiz"` (lien vers le module ; la tentative reste en cours et sera reprise).
- **EF-3 — Progression** : N segments (8 px de haut) : questions passées noires `#111113`, courante citron `#C6F432`, à venir `#E7E6E1` ; libellé « Question n sur N » (chiffres tabulaires).
- **EF-4 — Carte question** : pastille du type (« Choix unique », « Choix multiple », « Texte à trous », « Association », « Question ouverte »), pastille « Notion : <libellé> », énoncé h2 (Space Grotesk 26 px), zone de réponse selon le type (vues SPEC-503) : choix en grille 2 colonnes avec lettres A-D (`role="radiogroup"`/`role="radio"` pour choix unique, `role="checkbox"` pour multiple), texte à trous en champs inline (`aria-label` « Premier mot manquant », « Second mot manquant », …), association avec une liste déroulante « Choisir… » par élément, ouverte en zone de texte (2 000 caractères max, compteur).
- **EF-5 — Vérifier** : bouton noir « Vérifier », désactivé tant qu'aucune réponse n'est donnée (choix non sélectionné, trou vide, association incomplète, texte < 1 caractère). Après correction : encadré vert `#E1F4EF`/`#0B5C4D` « Exact. » ou orange `#FFEDE0`/`#8F3305` « Pas tout à fait. » suivi de l'explication de la brique ; la bonne option entourée `#14A38B`, l'option choisie fausse entourée `#F97316` ; trous et associations colorés un par un. Pour une ouverte : encadré neutre « Réponse enregistrée. Le tuteur la corrigera à la fin de la tentative. ». La réponse n'est plus modifiable (champs désactivés).
- **EF-6 — Suivant** : le bouton devient citron « Question suivante » ; à la dernière question « Terminer la tentative ». La note « Correction immédiate · nouvelles questions à chaque tentative » reste à gauche.
- **EF-7 — Terminer** : « Terminer la tentative » soumet ; l'apprenant est redirigé vers `/formations/[fid]/modules/[mid]/quiz/[attemptId]/resultat` ; si des ouvertes existent, la page affiche « Le tuteur corrige vos réponses ouvertes… » (squelette) et interroge l'API toutes les 3 s (ADR-0065) jusqu'à `graded` ; l'écran de résultat complet est livré par SPEC-612.
- **EF-8 — Préparation** : si la banque d'une notion est épuisée, l'API renvoie 202 ; l'écran affiche « Le tuteur prépare de nouvelles questions… » et relance la création toutes les 3 s pendant 2 min au plus, puis « La préparation des questions prend plus de temps que prévu. Réessayez dans quelques minutes. » + « Réessayer ».
- **EF-9 — Score** (calculé par le code, ADR-0170) : 100/N points par question ; score global arrondi à l'entier à l'affichage ; `per_notion[notionId] = { correct, total, score }` (score = moyenne des réussites des questions de la notion × 100).
- **EF-10 — Clavier** : Tab entre options ; flèches dans le groupe radio ; Entrée sur « Vérifier » ; après correction, le focus passe sur l'encadré de retour (`role="status"`) puis Tab atteint « Question suivante ».

## 6. Exigences techniques

- **ET-1 — Contrats** (`packages/contracts/src/attempts.ts`) :
  - `QuizQuestionDto = { position, brickVersionId, type: 'choice_question'|'cloze'|'matching'|'open_question', typeLabel, notionId, notionLabel, payload (vue sans les bonnes réponses), state: 'unanswered'|'draft'|'checked', response?, feedback?: { isCorrect: boolean|null, score: number|null, explanation: string|null, expected?: unknown } }`.
  - `AttemptDto = { id, kind: 'validation_quiz', attemptNo, status: 'in_progress'|'submitted'|'graded'|'timed_out'|'abandoned', moduleId, formationId, threshold, total, questions: QuizQuestionDto[], startedAt, submittedAt?, score?, passed?, serverTime }`.
  - `SaveAnswerInput = z.object({ response: z.unknown(), timeMs: z.number().int().min(0).max(1_800_000) })` (validée ensuite par le schéma de réponse du type de brique).
  - `CheckAnswerOutput = { position, feedback, locked: true }`.
  - `CreateQuizAttemptOutput` : 201 `{ attemptId }` | 200 `{ attemptId, resumed: true }` | 202 `{ preparing: true, retryAfterSec: 3 }`.
- **ET-2 — API** :
  - `POST /api/v1/modules/:mid/quiz/attempts` (Idempotency-Key) : 201/200/202 ci-dessus ; 404 module inconnu ; 422 `MODULE_LOCKED` ; 422 et code issus des gardes enregistrées (`quizAttemptGuards`, voir ET-6).
  - `GET /api/v1/attempts/:aid` → `AttemptDto` (bonnes réponses jamais renvoyées pour une question non vérifiée).
  - `PUT /api/v1/attempts/:aid/answers/:pos` → 200 (brouillon ; refus 409 `CONFLICT` si la question est vérifiée ou la tentative non `in_progress`).
  - `POST /api/v1/attempts/:aid/answers/:pos/check` (corps `SaveAnswerInput`) → 200 `CheckAnswerOutput` ; idempotent (une seconde vérification renvoie le même retour).
  - `POST /api/v1/attempts/:aid/submit` → 202 `{ status }` ; 409 si des questions ne sont pas vérifiées (`errors.unchecked: number[]`) ; idempotent : sur une tentative `submitted` non corrigée, réémet `quiz/submitted` (relance de correction).
  - `GET /api/v1/attempts/:aid/result` → `{ status, score?, passed?, perNotion?, pendingOpenCount }` (complété par SPEC-612).
- **ET-3 — Service** `packages/services/src/quiz/` : `startValidationAttempt(ctx, moduleId)`, `getAttempt(ctx, attemptId)`, `saveDraft`, `checkAnswer`, `submitAttempt`, `gradeOpenAnswers(serviceCtx, attemptId)` (job), `computeScore(answers, total): { score, perNotion }` (pur).
- **ET-4 — Création** (transaction) : (1) lire notions du module, lacunes ouvertes, empreintes vues (`brick_versions.fingerprint` de toutes les `answers` de l'apprenant), banque `bricks.purpose='bank'` `status='active'` des notions ; (2) `drawAttempt` avec `size = min(20, max(12, notions))`, `formatMix` d'ADR-0170, `seed = hash(userId, moduleId, attemptNo)` ; (3) si `exhaustedNotionIds` non vide : `banks.requestRegeneration` puis 202 sans rien créer ; (4) créer `activities` (`kind='validation_quiz'`, `module_id`, `config = { threshold, questionCount: N, scoring: 'equal' }`, `items = [{ brickId, brickVersionId, points: 100/N }]`, `status='ready'`) ; (5) créer `attempts` (`attempt_no` = nombre de tentatives de quiz de validation du module + 1, `status='in_progress'`, `started_at = clock.now()`) et les `answers` vides par position. Briques signalées (`status='reported'`) exclues (BR-MEM-09 par analogie, BR-COU-09).
- **ET-5 — Vérification** : questions corrigées par le code → `grade()` ; écriture `answers.is_correct`, `score` (points), `max_score`, `graded_by='code'`, `chosen_distractor_notion_id`, `time_ms`, `answered_at`, `feedback = { explanation }`. Ouverte → `response` et `time_ms` enregistrés, `is_correct = null`.
- **ET-6 — Gardes** : `quizAttemptGuards: Array<(ctx, moduleId) => Promise<Result<void, AppError>>>` exporté par le service ; SPEC-611 enregistre seulement la garde « module ouvert » ; SPEC-612 ajoute la garde de délai (`RETRY_NOT_YET_ALLOWED`).
- **ET-7 — Soumission** : toutes les questions doivent être vérifiées ; `status='submitted'`, `submitted_at`, `duration_ms` ; émission `quiz/submitted { userId, formationId, moduleId, attemptId, openCount }` après commit.
- **ET-8 — Fonction Inngest** `quiz-grade` (`packages/jobs/src/functions/quiz-grade.ts`) sur `quiz/submitted` : étape 1 `grade-open` : pour chaque ouverte non notée, `tutor.run('tutor', { scenario: 'grade-open', brickVersionId, response })` → action `grade_answer` (note bornée à `max_score`, `feedback.criteria`, `feedback.missing`, `graded_by='tutor'`, `is_correct = score/max ≥ 0,6`, `feedback.offTopic` booléen pour BR-LAC-03) ; étape 2 `score` : `computeScore`, `attempts.score`, `per_notion`, `passed = score ≥ threshold` ; étape 3 `learning` : `services.learning.applyResults({ userId, source: 'validation', attemptId })` (review_logs, FSRS, maîtrise, lacunes, `gap/detected`) ; étape 4 : `status='graded'`, émission `quiz/graded { userId, formationId, moduleId, attemptId, score, passed, threshold, attemptNo }`. Reprises : 3 (ADR-0017). Si `AI_UNAVAILABLE` ou `INVALID_OUTPUT` après reprises : la tentative reste `submitted`, notification `ai_task_failed` (« La correction de votre quiz est en attente ») vers la page de résultat.
- **ET-9 — Sécurité** : RLS propriétaire sur `activities`, `attempts`, `answers` ; les bonnes réponses et explications ne quittent le serveur qu'après vérification ; le client ne calcule jamais le score.
- **ET-10 — Performances** : `POST check` p95 < 150 ms ; création de tentative p95 < 400 ms (hors 202).
- **ET-11 — Accessibilité** : radiogroup ARIA, `aria-checked`, libellés des champs de trous et des listes, encadré de retour `role="status"`, couleurs jamais seules porteuses d'information (« Exact. » / « Pas tout à fait. » + icône).

## 7. Comportements attendus et cas limites

- **CL-1 — Rechargement en pleine tentative** : reprise à la première question non vérifiée, questions déjà vérifiées affichées corrigées si l'apprenant revient (pas de navigation arrière dans l'interface V1 ; la reprise suffit), brouillon d'ouverte restauré.
- **CL-2 — Double clic sur « Vérifier »** : idempotent, un seul enregistrement ; bouton désactivé pendant la requête.
- **CL-3 — Double soumission** : la seconde renvoie 202 avec le statut courant, aucun second événement si la tentative est déjà `graded`.
- **CL-4 — Réponse ouverte vide** : « Vérifier » désactivé ; une réponse composée d'espaces est refusée (400).
- **CL-5 — Banque épuisée** : 202 et EF-8 ; aucune question déjà vue n'est jamais reposée.
- **CL-6 — Tuteur indisponible pendant la correction** : la tentative reste `submitted`, le résultat affiche le score provisoire des questions corrigées par le code (« Score provisoire ») et « Correction des questions ouvertes en attente » ; aucune décision de validation tant que la correction n'est pas faite ; relance par `POST submit`.
- **CL-7 — Module verrouillé** (URL saisie à la main) : 422 `MODULE_LOCKED`, redirection et message.
- **CL-8 — Tentative en cours dans un autre onglet** : le second onglet reprend la même tentative ; une vérification déjà faite dans l'autre onglet renvoie le retour enregistré.
- **CL-9 — Brique signalée pendant la tentative** : la question reste dans la tentative en cours (version figée) ; elle sera exclue des tirages suivants.
- **CL-10 — Seuil modifié par le tuteur après la création** : la tentative garde le seuil de `activities.config.threshold`.
- **CL-11 — Module de 25 notions** : N = 20 ; SPEC-405 garantit la couverture maximale et signale les notions non couvertes, qui seront prioritaires à la tentative suivante.
- **CL-12 — Temps de réponse aberrant** (onglet laissé ouvert 2 h) : `time_ms` borné à 30 min.

## 8. Instructions d'implémentation

1. Contrats ET-1 et schémas de réponse par type (réutiliser ceux de SPEC-501/502). Commit `feat(SPEC-611): contrats des tentatives de quiz`.
2. `computeScore` pur + tests (ADR-0170). 
3. Service `quiz` (ET-3 à ET-7), garde « module ouvert », registre `quizAttemptGuards`. Commit `feat(SPEC-611): service de passage du quiz`.
4. Routes API ET-2 dans `apps/web/app/api/v1/modules/[mid]/quiz/attempts/route.ts`, `attempts/[aid]/route.ts`, `attempts/[aid]/answers/[pos]/route.ts`, `.../check/route.ts`, `attempts/[aid]/submit/route.ts`, `attempts/[aid]/result/route.ts`.
5. Événements `quiz/submitted`, `quiz/graded` (schémas) et fonction `quiz-grade` ; consigne `packages/tutor/prompts/grade-open.md` ; fixtures `packages/llm/fixtures/tutor/grade-open-good.json`, `grade-open-partial.json`, `grade-open-offtopic.json`. Commit `feat(SPEC-611): correction des questions ouvertes et score`.
6. Écran `apps/web/app/(app)/formations/[fid]/modules/[mid]/quiz/page.tsx` + composants `apps/web/components/quiz/{QuizHeader,QuizProgress,QuestionCard,CheckFeedback,QuizPreparing}.tsx`, hook `use-quiz-attempt.ts` (TanStack Query, clés `['attempt', id]`) ; page d'attente `quiz/[attemptId]/resultat/page.tsx` (état « Le tuteur corrige vos réponses ouvertes… », à compléter par SPEC-612) ; textes `apps/web/messages/fr.ts` (`quiz`). Commit `feat(SPEC-611): écran du quiz de validation`.
7. Seed de test : fabrique `makeModuleWithBank({ notions: 11, variantsPerFormat: 4 })` dans `packages/testing`. Tests section 12. Commit `test(SPEC-611): tests du passage du quiz`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/attempts.ts` ; `packages/services/src/quiz/{index,start,check,submit,score,guards}.ts` (+ tests) ; `packages/services/test/integration/quiz-attempt.test.ts` ; `packages/jobs/src/functions/quiz-grade.ts` ; `packages/tutor/prompts/grade-open.md` ; fixtures `grade-open-*.json` ; routes listées en étape 4 ; `apps/web/components/quiz/*` ; pages `quiz/page.tsx`, `quiz/[attemptId]/resultat/page.tsx` ; `apps/web/e2e/specs/p6/quiz-attempt.spec.ts`.
- **Modifiés** : `packages/jobs/src/events.ts` ; `packages/jobs/src/index.ts` (enregistrement) ; `apps/web/messages/fr.ts` ; `packages/testing/src/factories/` (fabrique de banque).
- **Lus / réutilisés** : `drawAttempt` (SPEC-405), `grade` (SPEC-502), vues de briques (SPEC-503), `applyResults` (SPEC-411), `banks.requestRegeneration` (SPEC-513), `tutor.run` (SPEC-508), `Breadcrumb`, `Badge`, `Button` (SPEC-303).

## 10. Interface et conformité visuelle

- Maquette `design/maquettes/Quiz.dc.html`, état « questions » (défaut, question 4 sur 12, tentative 2) ; référence `design/references/SCR-09-desktop.png` et `SCR-09-mobile.png`.
- Structure (ordre) : conteneur `max-width` 920 px (jeton) ; ligne d'en-tête : `nav[aria-label="Fil d'Ariane"]`, h1 « Quiz de validation », pastilles `data-testid="quiz-attempt-badge"` (« Tentative 2 ») et `data-testid="quiz-threshold-badge"` (« Seuil 80 % »), lien `data-testid="quiz-quit"` ; progression `data-testid="quiz-progress"` (N segments `data-testid="quiz-progress-seg"`, libellé « Question 4 sur 12 ») ; `section[aria-labelledby="t-question"]` `data-testid="quiz-question"` : pastilles type et notion (`data-testid="quiz-question-type"`, `quiz-question-notion`), h2, réponses, retour `data-testid="quiz-feedback"`, pied avec note et bouton `data-testid="quiz-check"` / `quiz-next`.
- Données du seed pour la capture : tentative 2 du module 3, question 4 « Quel élément classe l'ensemble d'une pièce comptable ? », type « Choix unique », « Notion : Type de pièce », options « La clé de comptabilisation », « Le type de pièce », « Le ledger », « Le plan comptable » ; questions 5 (« Complétez de tête, sans liste de choix. », réponses « universel », « ACDOCA ») et 6 (association « Clé 40 », « Clé 50 », « Type SA ») disponibles dans le jeu de test e2e.
- Jetons : carte question fond `#FFFFFF`, bordure `#E7E6E1`, rayon 28 px, padding 32 px ; pastille tentative `#111113`/`#FFFFFF` ; pastille notion `#ECECFC`/`#2E2E8F` ; tuile option rayon 18 px, sélection bordure 2 px `#111113` fond `#F4F4F1` ; juste `#14A38B`/`#E1F4EF` ; faux `#F97316`/`#FFEDE0` ; bouton « Vérifier » `#111113`, « Question suivante » `#C6F432` ; h1 Space Grotesk 30 px ; énoncé Space Grotesk 26 px.
- États : chargement (squelette de carte), préparation (EF-8), erreur (`ErrorState` + « Réessayer »), correction en attente (page résultat).
- Responsive : grille d'options sur 1 colonne sous 600 px ; association en pile.
- Contrôles : jetons, structure, comparaison ≤ 12 % avec `SCR-09-desktop.png` (horloge 2026-11-11T12:20:00Z, seed SPEC-115), ligne de base `toHaveScreenshot('quiz-question.png')`.

## 11. Critères d'acceptation

- **CA-1** — Une tentative créée pour le module 3 (11 notions) contient 12 questions couvrant les 11 notions, dont au moins 3 ouvertes, au moins 5 `choice_question`, aucune empreinte déjà vue par l'apprenant.
- **CA-2** — Deux tentatives successives n'ont aucune empreinte commune ; si la banque d'une notion est épuisée, l'API renvoie 202 et `banks.requestRegeneration` est appelée avec cette notion.
- **CA-3** — « Vérifier » sur l'option « La clé de comptabilisation » affiche « Pas tout à fait. » et l'explication « Le type de pièce, par exemple SA, classe toute la pièce… » ; la réponse est ensuite non modifiable ; `answers.chosen_distractor_notion_id` = notion « Clé de comptabilisation ».
- **CA-4** — L'écran affiche « Tentative 2 », « Seuil 80 % », « Question 4 sur 12 », la pastille de type et « Notion : Type de pièce », et « Correction immédiate · nouvelles questions à chaque tentative ».
- **CA-5** — Après soumission, la fonction `quiz-grade` note les ouvertes avec les fixtures, calcule `score` selon ADR-0170 (test chiffré : 8 justes sur 9 auto + 2 ouvertes à 1 et 0,5 + 1 à 0 → 79,17), `per_notion`, `passed` selon le seuil du module, applique `review_logs` (`source='validation'`) et émet `quiz/graded`.
- **CA-6** — Un module au seuil 85 % affiche « Seuil 85 % » et `passed=false` pour un score de 84.
- **CA-7** — Rechargement à la question 7 : reprise à la question 7 avec le brouillon d'ouverte restauré ; double clic sur « Vérifier » ne crée qu'une écriture.
- **CA-8** — Tuteur indisponible à la correction : statut `submitted`, notification `ai_task_failed`, page « Correction des questions ouvertes en attente » ; `POST submit` relance la correction.
- **CA-9** — Conformité visuelle : jetons et structure vérifiés, écart ≤ 12 % avec la référence, aucune violation axe serious/critical.

## 12. Plan de tests

- **Unitaires** (`describe('[SPEC-611] …')`) : `score.test.ts` (ADR-0170, cas chiffrés, arrondis, partiels cloze/matching, CA-5, CA-6) ; `start.test.ts` (taille N, mélange de formats, seed déterministe, CA-1) ; `QuestionCard.test.tsx` (états answering/checked, désactivation, libellés de type, CA-3, CA-4) ; `use-quiz-attempt.test.ts` (relance 3 s sur 202, arrêt à 2 min).
- **Intégration** (`[SPEC-611]`, base réelle, IA simulée) : création (201, 200 reprise, 202 épuisement, CA-1, CA-2) ; check idempotent et verrou (CA-3, CA-7) ; submit 409 si non vérifié ; exécution directe de `quiz-grade` : notes, score, `review_logs`, lacunes, événement `quiz/graded` (CA-5) ; échec IA → `submitted` + notification, relance (CA-8) ; RLS : un autre utilisateur reçoit 404 sur `GET /attempts/:aid`.
- **End-to-end** (`apps/web/e2e/specs/p6/quiz-attempt.spec.ts`, vidéo) :
  1. `passe une tentative complète @SPEC-611` : depuis le cours, « Passer au quiz » ; répondre aux 12 questions (choix faux puis juste, texte à trous « universel »/« ACDOCA », association, ouverte) en vérifiant chaque retour ; « Terminer la tentative » ; page « Le tuteur corrige vos réponses ouvertes… » puis statut corrigé (CA-3, CA-4, CA-5).
  2. `reprise après rechargement @SPEC-611` (CA-7).
  3. `banque épuisée puis préparée @SPEC-611` (CA-2).
  4. `correction en attente si le tuteur est indisponible @SPEC-611` (CA-8).
- **Visuel** : `écran de question conforme @SPEC-611 @visual` (CA-9, seuil personnalisé 85 % pour CA-6 dans un test séparé non visuel).
- **Non-régression** : `@SPEC-405`, `@SPEC-502`, `@SPEC-503`, `@SPEC-609`.
- **Traçabilité** :

| Critère | Tests |
|---|---|
| CA-1 | `start.test.ts`, intégration création |
| CA-2 | intégration création, e2e 3 |
| CA-3 | `QuestionCard.test.tsx`, intégration check, e2e 1 |
| CA-4 | `QuestionCard.test.tsx`, e2e 1 |
| CA-5 | `score.test.ts`, intégration `quiz-grade`, e2e 1 |
| CA-6 | `score.test.ts` |
| CA-7 | intégration check, e2e 2 |
| CA-8 | intégration échec IA, e2e 4 |
| CA-9 | test `@visual` |

## 13. Preuves attendues

`evidence/SPEC-611/` : vidéos des 4 parcours ; captures `quiz-question-4.png`, `quiz-feedback-wrong.png`, `quiz-cloze.png`, `quiz-matching.png`, `quiz-open.png`, `quiz-grading.png` ; comparaison `visual/SCR-09-side-by-side.png` + diff et taux ; rapports ; `acceptance.md`.

## 14. Définition de terminé

Définition commune (`docs/engineering/testing.md` §7), plus : le score n'est jamais calculé côté client (test qui modifie la réponse de `check` côté client sans effet sur le score) ; fixtures de correction présentes ; événements `quiz/submitted` et `quiz/graded` typés dans le catalogue.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0014 (taille, seuil, répartition), ADR-0024 (maîtrise, réussite partielle), ADR-0025 (note FSRS par la justesse et le temps), ADR-0026 (banques personnelles), ADR-0017 (reprises), ADR-0065 (interrogation périodique), ADR-0013 (échec du modèle personnel).
- Décision créée : **ADR-0170** (formats corrigés par le code inclus dans la part « à choix », barème égal, retour des ouvertes, réussite partielle) ; **ADR-0316** (correction différée par appel structuré `tutor.grade-open`, bornage et reprises).
- Décisions locales : une activité `validation_quiz` par tentative (items figés) ; garde extensible `quizAttemptGuards` (le délai est ajouté par SPEC-612) ; 202 de préparation avec relance client ; relance de correction par `POST submit` (aucune route nouvelle).
- Hypothèses : SPEC-405 accepte `formatMix` et `seed` ; SPEC-513 expose `banks.requestRegeneration` ; le seed SPEC-115 contient pour Alex une tentative 1 (58 %) et une banque suffisante pour le module 3.
