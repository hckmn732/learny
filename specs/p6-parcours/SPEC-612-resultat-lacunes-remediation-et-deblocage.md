---
id: SPEC-612
title: Résultat, lacunes, remédiation et déblocage
phase: P6
priority: V1
depends_on: [SPEC-611, SPEC-404]
business_rules: [BR-QUI-05, BR-QUI-06, BR-QUI-08, BR-FOR-07, BR-LAC-04]
screens: [SCR-09]
adrs: [ADR-0170, ADR-0173, ADR-0176, ADR-0179]
visual: mockup
---

# SPEC-612 — Résultat, lacunes, remédiation et déblocage

## 1. Objectif

Après la correction d'une tentative de quiz de validation (SPEC-611), afficher l'écran de résultat de `Quiz.dc.html` (score, seuil, réussite/échec, historique des tentatives, lacunes, acquis, actions), appliquer la conséquence métier (déblocage du module suivant ou remédiation ciblée et délai de nouvelle tentative), émettre `module/validated` et `formation/completed`, et livrer l'écran de remédiation.

## 2. Contexte

Écran SCR-09, routes `/formations/[fid]/modules/[mid]/quiz/[attemptId]/resultat` et `/formations/[fid]/modules/[mid]/remediation`. L'événement `quiz/graded` (SPEC-611) déclenche ici : déblocage, jalon, notification, planification, remédiation. La détection et la nature des lacunes sont déjà calculées par le moteur (SPEC-404) et persistées par SPEC-411 pendant la correction.

À lire : `docs/product/business-rules.md` §QUI, §LAC, §FOR, §AUT (BR-AUT-04) ; `docs/architecture/data-model.md` §2 (`modules`, `module_progress`), §5, §6, §7 (`milestones`, `schedule_slots`), §1 (`automation_settings`) ; `docs/architecture/overview.md` §5 ; ADR-0173, ADR-0176, ADR-0179, ADR-0170, ADR-0024 ; `design/maquettes/Quiz.dc.html` partie `inResult` et script (`scores`, `bars`, `allLacunes`, `headline`, `statusText`, `lacunesTitle`, `acquisTitle`).

## 3. Dépendances

- **SPEC-611** : tentatives, `GET /attempts/:aid/result`, `quiz/graded`, `quizAttemptGuards`, composants de question (réutilisés pour la remédiation), page d'attente de résultat.
- **SPEC-404** : `recommendedResponse(nature)` (réponse du tuteur par nature, BR-LAC-04), données d'évidence des lacunes.
- Transitivement : SPEC-411 (`notion_states`, `gap_events`, `services.learning.replanUser`), SPEC-405 (tirage des questions de remédiation dans la banque), SPEC-508 (tâche `gaps`), SPEC-209 (`notify`), SPEC-203 (événements), SPEC-102 (`automation_settings` clé `remediation`), SPEC-303 (ProgressRing, StatCard, Card, Button).
- IA : tâche `gaps` pour les textes de remédiation ; sans IA, la remédiation est composée des seuls extraits et questions de la banque, avec le texte de repli de la nature (CL-5).

## 4. Règles métier couvertes

- **BR-QUI-05** — score ≥ seuil : `module_progress.status='validated'` (et `modules.status` pour une formation individuelle), module suivant ouvert, `notion_states.in_review = true` pour les notions du module (ajout au quiz global), jalon `module_validated`, notification « Module n validé · s % », événement `module/validated`.
- **BR-QUI-06** — score < seuil : lacunes qualifiées (déjà persistées par la correction), remédiation préparée (ADR-0173), nouvelle tentative autorisée à `submitted_at + délai` (automatisme 4, défaut 24 h) via la garde `RETRY_NOT_YET_ALLOWED`.
- **BR-QUI-08** — écran de résultat : score, seuil, statut, détail par notion, lacunes avec nature, historique des tentatives (graphique), actions « Remédiation ciblée · 15 min », « Nouvelle tentative » avec date de disponibilité, « Ouvrir le module n+1 » si validé.
- **BR-FOR-07** — statuts verrouillé / ouvert / validé ; le module n+1 passe `open` (avec `opened_at`) uniquement à la réussite du quiz du module n ; aucun autre chemin ne l'ouvre.
- **BR-LAC-04** — la carte de lacune et la remédiation suivent la réponse par nature : confusion → question opposant les deux notions + comparaison ; incompréhension → nouvelle explication sous un autre angle ; difficulté d'application → exercice pratique (SPEC-613) ; oubli → révision dans le quiz global.

## 5. Exigences fonctionnelles

- **EF-1 — Carte score** (`section[aria-labelledby="t-score"]`) : anneau 160 px (piste `#F0EFEA`, arc `#5B5BD6` si réussi, `#F97316` sinon, trait noir du seuil positionné à l'angle `seuil × 360°`), valeur « 72 % » (Space Grotesk 40 px), légende « trait : seuil 80 % » ; titre masqué « Résultat de la tentative » ; pastille « Module validé » (citron) ou « Pas encore validé » (orange) ; titre « Le module 4 est débloqué. » / « Encore 8 points pour valider. » (points = `ceil(seuil − score)`, « Encore 1 point pour valider. » au singulier) ; dernier module réussi : « La formation est terminée. » ; texte : réussite « Bravo. Les notions du module rejoignent votre quiz global ; une seule reste fragile. » (« … ; aucune ne reste fragile. » si 0, « … ; n restent fragiles. » si n > 1), échec « Votre prochaine tentative portera surtout sur les n notions ci-dessous, avec de nouvelles questions. ».
- **EF-2 — Historique** « Vos tentatives » : une barre par tentative corrigée (largeur 44 px, hauteur `score × 1,2` px, bleue `#5B5BD6` si réussie, `#FFEDE0` cerclée `#F97316` sinon), ligne pointillée noire au seuil, libellés « 58 % » / « T1 » ; au-delà de 6 tentatives, les 6 dernières. Alternative textuelle : liste masquée « Tentative 1 : 58 %, non validée ; … ».
- **EF-3 — Lacunes** : titre « Lacunes détectées · n notions » (échec) ou « Encore fragile · n notion(s) » (réussite), sous-titre « Analysées sur toutes vos tentatives · prioritaires dans le quiz global » ; une carte par lacune ouverte du module (3 premières par maîtrise croissante en échec, toutes en réussite) : pastille de nature (« Confusion », « Incompréhension », « Difficulté d'application », « Oubli »), notion (h3), signe (évidence en une phrase, ex. « Confondue avec le type de pièce dans 2 réponses. »), « Le tuteur propose : <proposition> », bouton « S'entraîner » (lien ADR-0179). Section absente si aucune lacune.
- **EF-4 — Acquis** : titre « n notions maîtrisées » + pastilles bleues `#ECECFC`/`#2E2E8F` des notions du module de maîtrise ≥ 80 % sans lacune ; disclosure « Détail par notion » (fermé par défaut, `aria-expanded`) listant chaque notion de la tentative : « Type de pièce · 2/2 · 100 % ».
- **EF-5 — Actions** (alignées à droite) : échec → lien « Relire le cours » (cours du module), bouton « Nouvelle tentative » (contour ; désactivé avec sous-texte « Disponible jeu. 12 nov. à 14:32 » ou « Disponible après la remédiation » tant que la garde refuse), bouton noir « Remédiation ciblée · 15 min » (vers la page de remédiation ; « Reprendre la remédiation » si commencée ; « Remédiation terminée » désactivé si terminée) ; réussite → lien « Retour à l'accueil », bouton citron « Ouvrir le module 4 » (page du module n+1) ou « Voir le bilan final » si dernier module.
- **EF-6 — Remédiation** (`/formations/[fid]/modules/[mid]/remediation`) : fil d'Ariane « Programme / Module n · <titre> / Remédiation », h1 « Remédiation ciblée », pastilles « ≈ 15 min » et « n notions » ; pour chaque lacune une carte : pastille nature, notion (h2), texte du tuteur (Markdown sûr), extraits cliquables (étiquettes de citation comme dans le cours), deux questions rendues comme au quiz avec « Vérifier » et correction immédiate ; bouton noir « Terminer la remédiation » actif quand toutes les questions sont vérifiées ; ensuite encadré « Remédiation terminée. Votre nouvelle tentative est disponible <dès maintenant | le jeu. 12 nov. à 14:32>. » + boutons « Nouvelle tentative » et « Retour au module ». État de préparation : « Le tuteur prépare votre remédiation… » (interrogation 3 s). Aucune remédiation : « Aucune remédiation en cours. » + bouton « Préparer une remédiation » si une tentative échouée existe.
- **EF-7 — Déblocage** : à `quiz/graded` réussi : transaction unique (module validé, `best_score = max`, module suivant `open`, `in_review` des notions, jalon, `formation/completed` si dernier) ; notification `module_validated` : titre « Module n validé · s % », texte « Le module n+1 · <titre> est débloqué. » (ou « Votre formation est terminée : découvrez votre bilan final. »), lien vers le programme (ou le bilan) ; replanification de l'apprenant.
- **EF-8 — Nouvelle tentative** : la garde de délai s'ajoute à `quizAttemptGuards` ; une tentative refusée renvoie 422 `RETRY_NOT_YET_ALLOWED` avec `availableAt` et `reason`.

## 6. Exigences techniques

- **ET-1 — Contrats** (`packages/contracts/src/quiz-result.ts`) : `QuizResultDto = { attemptId, attemptNo, status, score: number|null, provisionalScore: number|null, threshold, passed: boolean|null, pointsMissing: number|null, isLastModule, nextModule: { id, position, title }|null, history: { attemptNo, score, passed }[], gaps: GapCardDto[], mastered: { notionId, label }[], perNotion: { notionId, label, correct, total, score }[], retry: { allowed: boolean, availableAt: string|null, reason: 'delay'|'remediation_required'|null }, remediation: { status: 'none'|'preparing'|'ready'|'in_progress'|'completed', href: string|null }, pendingOpenCount }` ; `GapCardDto = { notionId, label, nature, natureLabel, evidence, proposal, mastery, trainHref }`. `RemediationDto = { status, activityId, attemptId, gaps: { notionId, label, nature, natureLabel, textMd, excerpts: { label, href }[], questions: QuizQuestionDto[] }[], retryAvailableAt }`.
- **ET-2 — API** :
  - `GET /api/v1/attempts/:aid/result` complété → `QuizResultDto` (soumission paresseuse sans objet ici).
  - `GET /api/v1/modules/:mid/remediation` → `RemediationDto` (`status='none'` si aucune).
  - `POST /api/v1/modules/:mid/remediation` (Idempotency-Key) → 202 `{ status: 'preparing' }` ; 409 si une remédiation `ready`/`in_progress` existe ; 422 `NO_FAILED_ATTEMPT`. **Route nouvelle** (préparation à la demande, automatisme 4 désactivé ou remédiation archivée) ; ajoutée à `docs/architecture/api.md`.
  - `POST /api/v1/modules/:mid/remediation/complete` → 200 `{ retryAvailableAt }` ; 409 si des questions ne sont pas vérifiées.
  - Les questions de remédiation utilisent les routes de SPEC-611 (`PUT/POST /attempts/:aid/answers/:pos[/check]`).
- **ET-3 — Fonction** `module-unlock` (sur `quiz/graded` avec `passed=true`) : étapes idempotentes `validate` (si déjà `validated`, mettre seulement `best_score`), `open-next` (`module_progress` du membre ; miroir `modules.status` si `formations.group_id IS NULL`), `review-pool` (`in_review = true`, `first_seen_at` conservé), `milestone` (`milestones` insert `on conflict do nothing`), `notify`, `emit` (`module/validated { userId, formationId, moduleId, score, nextModuleId|null }` ; si dernier : `formation/completed { userId, formationId, completedAt }`), `replan` (`services.learning.replanUser(userId, { from: clock.now() })`). Une tentative réussie sur un module déjà validé (révision volontaire) n'émet ni jalon ni notification.
- **ET-4 — Fonction** `remediation-prepare` (sur `quiz/graded` avec `passed=false` et automatisme 4 activé ; sur demande POST) : ADR-0173 ; lacunes du module (3 max) ; questions via `drawAttempt` restreint aux notions en lacune, 2 par notion, formats opposants pour la confusion (`matching` ou `categorization` si disponibles, sinon `choice_question` dont un distracteur est la notion confondue) ; textes par `tutor.run('gaps', { scenario: 'remediation-plan', gaps })` → `{ notionId, textMd (≤ 1 200 caractères), proposal (≤ 120 caractères), excerptCitationIds[] }` validé Zod ; activité `remediation` (`config = { sourceAttemptId, plan, durationMin: 15 }`) + tentative `in_progress`. Action d'automatisme journalisée par SPEC-715 (événement `automation/action-applied` hors de cette spécification).
- **ET-5 — Garde de délai** : `retryGate(ctx, moduleId)` : dernière tentative corrigée non réussie → `availableAt = submitted_at + delayHours` (`automation_settings[remediation].params.delayHours` ∈ {0, 12, 24, 48}, défaut 24 ; 0 si l'automatisme est désactivé) ; mode `mandatory` → exige une remédiation `completed` liée à cette tentative. Heure affichée dans le fuseau de l'utilisateur : « jeu. 12 nov. à 14:32 ».
- **ET-6 — Textes par nature** (repli code, `packages/config/src/product.ts`) : confusion « une question qui oppose les deux notions. » ; misunderstanding « une nouvelle explication, sous un autre angle. » ; application « un exercice pratique. » ; forgetting « une révision dans le quiz global. ». Libellés : « Confusion », « Incompréhension », « Difficulté d'application », « Oubli ». Évidence : `notion_states.gap_evidence` (phrase produite par SPEC-404/411).
- **ET-7 — Sécurité** : RLS ; la page de résultat refuse (404) une tentative d'un autre utilisateur ; les modules suivants d'une formation à plusieurs ne sont ouverts que pour le membre concerné (`module_progress`).
- **ET-8 — Accessibilité** : graphique d'historique `aria-hidden` doublé d'une liste textuelle ; anneau avec texte ; boutons désactivés accompagnés de leur raison (`aria-describedby`).

## 7. Comportements attendus et cas limites

- **CL-1 — Correction pas encore terminée** : la page affiche l'attente (SPEC-611) ; aucun bouton d'action tant que `status ≠ graded`.
- **CL-2 — Double réception de `quiz/graded`** : étapes idempotentes, un seul jalon, une seule notification (`dedupe_key = module_validated:<moduleId>`).
- **CL-3 — Réussite au-dessus du seuil après un module déjà validé** : `best_score` mis à jour seulement.
- **CL-4 — Dernier module** : « Voir le bilan final », `formation/completed`, statut de formation traité par SPEC-617.
- **CL-5 — Tuteur indisponible pour la remédiation** : remédiation créée avec les textes de repli de la nature et les extraits seuls ; mention « Explication du tuteur indisponible : voici les passages de votre cours et des questions. ».
- **CL-6 — Banque insuffisante pour la remédiation** : 1 question par notion si une seule est disponible ; 0 → la notion n'a que le texte et les extraits.
- **CL-7 — Délai 0 h et mode conseillé** : « Nouvelle tentative » immédiatement active.
- **CL-8 — Mode obligatoire et remédiation non terminée** : bouton désactivé « Disponible après la remédiation » ; 422 avec `reason='remediation_required'` côté API.
- **CL-9 — Nouvel échec alors qu'une remédiation n'est pas terminée** : l'ancienne est archivée, une nouvelle est préparée.
- **CL-10 — Formation à plusieurs** : le déblocage ne concerne que le membre ; les autres membres ne sont pas notifiés.
- **CL-11 — Seuil franchi à 0,01 près** (79,99 vs 80) : non validé ; l'affichage montre « 80 % » arrondi mais le titre « Encore 1 point pour valider. ».
- **CL-12 — Rechargement de la remédiation** : reprise des questions déjà vérifiées.

## 8. Instructions d'implémentation

1. Contrats ET-1 ; ajout de `NO_FAILED_ATTEMPT` au catalogue d'erreurs. Commit `feat(SPEC-612): contrats du résultat et de la remédiation`.
2. Service `packages/services/src/quiz/result.ts` (`getResult`) et `retry-gate.ts` (ajout à `quizAttemptGuards`). 
3. Service `packages/services/src/remediation/` (`prepare`, `get`, `complete`) ; consigne `packages/tutor/prompts/remediation-plan.md` ; fixtures `packages/llm/fixtures/gaps/remediation-plan-sap-m3.json` (textes de la maquette : « une question qui oppose les deux notions. », « une nouvelle explication, sous un autre angle. », « un exercice pratique de saisie. »).
4. Fonctions Inngest `module-unlock`, `remediation-prepare` ; événements `module/validated`, `formation/completed` dans le catalogue. Commit `feat(SPEC-612): déblocage, jalon, remédiation`.
5. Routes API (ET-2) et mise à jour de `docs/architecture/api.md`.
6. Composants `apps/web/components/quiz-result/{ScoreCard,AttemptHistory,GapCards,MasteredNotions,ResultActions}.tsx` et `apps/web/components/remediation/*` ; pages `quiz/[attemptId]/resultat/page.tsx` (complétée) et `remediation/page.tsx` ; textes `fr.ts`. Commit `feat(SPEC-612): écrans de résultat et de remédiation`.
7. Tests (section 12). Commit `test(SPEC-612): …`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/quiz-result.ts` ; `packages/services/src/quiz/{result,retry-gate}.ts` ; `packages/services/src/remediation/*` ; `packages/jobs/src/functions/{module-unlock,remediation-prepare}.ts` ; `packages/tutor/prompts/remediation-plan.md` ; fixtures ; `apps/web/app/api/v1/modules/[mid]/remediation/route.ts`, `.../remediation/complete/route.ts` ; composants ; `apps/web/app/(app)/formations/[fid]/modules/[mid]/remediation/page.tsx` ; tests `packages/services/test/integration/quiz-result.test.ts`, `remediation.test.ts`, `apps/web/e2e/specs/p6/quiz-result.spec.ts`.
- **Modifiés** : `apps/web/app/(app)/formations/[fid]/modules/[mid]/quiz/[attemptId]/resultat/page.tsx`, `apps/web/app/api/v1/attempts/[aid]/result/route.ts`, `packages/jobs/src/events.ts`, `packages/core/src/errors.ts`, `packages/config/src/product.ts`, `docs/architecture/api.md`, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `QuestionCard`, `CheckFeedback` (SPEC-611) ; `recommendedResponse` (SPEC-404) ; `drawAttempt` (SPEC-405) ; `notify` (SPEC-209) ; `replanUser` (SPEC-411) ; `ProgressRing`, `Badge`, `Button`, `Card` (SPEC-303).

## 10. Interface et conformité visuelle

- Maquette `Quiz.dc.html` état résultat (tentative 2 : 72 %, échec, 3 lacunes, 9 notions maîtrisées ; et tentative 3 : 84 %, réussite, 1 lacune, 11 notions) ; références `design/references/SCR-09-resultat-echec-desktop.png` et `SCR-09-resultat-reussite-desktop.png`.
- Structure (ordre) : en-tête identique au quiz (fil d'Ariane « … / Quiz de validation », h1, « Tentative 2 », « Seuil 80 % », « × ») ; `section[aria-labelledby="t-score"]` `data-testid="result-score"` (anneau `data-testid="result-ring"`, statut `data-testid="result-status"`, titre `result-headline`, historique `data-testid="result-history"` avec barres `result-history-bar`) ; `section[aria-labelledby="t-lacunes"]` `data-testid="result-gaps"` (cartes `result-gap-card`, bouton `result-gap-train`) ; `section[aria-labelledby="t-acquis"]` `data-testid="result-mastered"` ; actions `data-testid="result-retry"`, `result-remediation`, `result-reread`, `result-next-module`, `result-home`.
- Textes du seed (échec) : « 72 % », « trait : seuil 80 % », « Pas encore validé », « Encore 8 points pour valider. », « Votre prochaine tentative portera surtout sur les 3 notions ci-dessous, avec de nouvelles questions. », barres « 58 % T1 », « 72 % T2 », « Lacunes détectées · 3 notions », cartes « Clé de comptabilisation » (Confusion, « Confondue avec le type de pièce dans 2 réponses. »), « Ledgers parallèles » (Incompréhension, « Erreurs aux tentatives 1 et 2, réponses ouvertes à côté du sujet. »), « Équilibre d'une pièce » (Difficulté d'application, « Définition juste, mais exercice de saisie échoué. »), « 9 notions maîtrisées » avec les pastilles « Pièce comptable », « En-tête de pièce », « Date comptable », « Type de pièce », « Compte général », « Plan comptable », « Journal universel », « Table ACDOCA », « Ledger principal ».
- Remédiation : écran sans maquette dédiée, composé avec les motifs de `Quiz.dc.html` (cartes blanches rayon 28 px, pastilles de nature de `Lacunes.dc.html`) et `docs/product/screens.md` §3.
- Jetons : anneau `#5B5BD6`/`#F97316`/`#F0EFEA` ; pastille réussite `#C6F432`, échec `#FFEDE0`/`#8F3305` ; carte lacune bordure `#E7E6E1` rayon 22 px ; bouton remédiation `#111113` ; bouton module suivant `#C6F432`.
- Contrôles : jetons, structure, comparaison ≤ 12 % avec les deux références (horloge figée, seed SPEC-115 : tentative 2 corrigée), ligne de base `quiz-result-fail.png`, `quiz-result-pass.png`, `remediation.png`.

## 11. Critères d'acceptation

- **CA-1** — Pour la tentative 2 du seed, l'écran affiche exactement les textes de la section 10 (échec), le bouton « Nouvelle tentative » désactivé avec « Disponible jeu. 12 nov. à … » (submitted_at + 24 h) et « Remédiation ciblée · 15 min ».
- **CA-2** — Une tentative réussie (84 %) valide le module 3, ouvre le module 4 (`module_progress.status='open'`, `opened_at` renseigné), met `in_review=true` sur les 11 notions du module, crée un jalon `module_validated`, une notification « Module 3 validé · 84 % » / « Le module 4 · Comptabilité fournisseurs est débloqué. » et émet `module/validated` une seule fois même si l'événement `quiz/graded` est rejoué.
- **CA-3** — La réussite du dernier module émet `formation/completed` et affiche « Voir le bilan final ».
- **CA-4** — Une tentative échouée prépare une remédiation de 3 notions au plus, avec 2 questions par notion tirées de la banque (aucune empreinte déjà vue), les textes de la fixture et, pour la confusion, une question dont un distracteur ou une paire représente la notion confondue.
- **CA-5** — `POST /modules/:mid/quiz/attempts` avant `availableAt` renvoie 422 `RETRY_NOT_YET_ALLOWED` avec `availableAt` ; à `availableAt` (horloge avancée), 201 ; en mode obligatoire sans remédiation terminée, 422 `reason='remediation_required'`.
- **CA-6** — La remédiation se termine après vérification de toutes les questions ; ses réponses créent des `review_logs` (`source='validation'`) et l'encadré « Remédiation terminée… » s'affiche.
- **CA-7** — Chaque carte de lacune affiche la proposition par nature (BR-LAC-04) et « S'entraîner » mène à l'exercice ciblé pour une difficulté d'application, au quiz global ciblé sinon.
- **CA-8** — Conformité : jetons, structure, écart ≤ 12 % avec les deux références, aucune violation axe serious/critical.

## 12. Plan de tests

- **Unitaires** (`describe('[SPEC-612] …')`) : `retry-gate.test.ts` (délais 0/12/24/48, désactivé, obligatoire, CA-5) ; `result.test.ts` (points manquants, singulier/pluriel, textes, CL-11, CA-1) ; `ScoreCard.test.tsx` (couleurs et textes réussite/échec) ; `AttemptHistory.test.tsx` (6 dernières, alternative textuelle) ; `gap-proposals.test.ts` (textes par nature et liens, CA-7).
- **Intégration** (`[SPEC-612]`) : `module-unlock` exécutée deux fois (idempotence, CA-2) ; dernier module → `formation/completed` (CA-3) ; `remediation-prepare` avec fixture et repli sans IA (CA-4, CL-5) ; garde de délai via l'API (CA-5) ; `remediation/complete` (CA-6) ; formation à plusieurs (CL-10) ; RLS.
- **End-to-end** (`apps/web/e2e/specs/p6/quiz-result.spec.ts`, vidéo) :
  1. `échec, lacunes puis remédiation @SPEC-612` : ouvrir le résultat de la tentative 2 ; vérifier les textes ; « Remédiation ciblée · 15 min » ; répondre aux questions ; « Terminer la remédiation » (CA-1, CA-4, CA-6).
  2. `nouvelle tentative après le délai puis réussite et module 4 ouvert @SPEC-612` : horloge avancée de 24 h ; passer la tentative 3 avec les bonnes réponses (fixtures) ; « Module validé », « Ouvrir le module 4 » mène au module 4 (CA-2, CA-5).
  3. `S'entraîner depuis une carte de lacune @SPEC-612` (CA-7).
- **Visuel** : `résultat échec et réussite conformes @SPEC-612 @visual` (CA-8).
- **Non-régression** : `@SPEC-611`, `@SPEC-404`, `@SPEC-411`, `@SPEC-606`.
- **Traçabilité** :

| Critère | Tests |
|---|---|
| CA-1 | `result.test.ts`, e2e 1 |
| CA-2 | intégration `module-unlock`, e2e 2 |
| CA-3 | intégration dernier module |
| CA-4 | intégration `remediation-prepare`, e2e 1 |
| CA-5 | `retry-gate.test.ts`, intégration garde, e2e 2 |
| CA-6 | intégration `complete`, e2e 1 |
| CA-7 | `gap-proposals.test.ts`, e2e 3 |
| CA-8 | test `@visual` |

## 13. Preuves attendues

`evidence/SPEC-612/` : vidéos des 3 parcours ; captures `result-fail.png`, `result-pass.png`, `remediation-ready.png`, `remediation-done.png`, `module-4-open.png` ; comparaisons `visual/SCR-09-resultat-*-side-by-side.png` et diff ; journal d'événements de l'intégration ; `acceptance.md`.

## 14. Définition de terminé

Définition commune (`docs/engineering/testing.md` §7), plus : les fonctions `module-unlock` et `remediation-prepare` sont idempotentes (testé) ; la route POST de remédiation est ajoutée à `docs/architecture/api.md` ; aucun chemin d'ouverture de module autre que `module-unlock` (recherche de code dans la revue de la spécification).

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0014, ADR-0024, ADR-0017, ADR-0065, ADR-0035 (déblocage par membre), ADR-0170 (score), ADR-0176 (déclenchement du bilan via `formation/completed`), ADR-0179 (liens « S'entraîner »).
- Décision créée : **ADR-0173** (structure, fin et délai de la remédiation).
- Décisions locales : route nouvelle `POST /modules/:mid/remediation` ; disclosure « Détail par notion » fermé par défaut pour respecter la maquette tout en couvrant le « score par notion » ; textes de repli par nature dans `product.ts`.
- Hypothèses : SPEC-404/411 renseignent `notion_states.gap_evidence` en une phrase française prête à afficher ; SPEC-411 expose `replanUser` ; SPEC-715 journalise l'action de remédiation et réutilise `retryGate`.
