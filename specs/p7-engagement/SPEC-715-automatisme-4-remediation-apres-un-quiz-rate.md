---
id: SPEC-715
title: "Automatisme 4 : remédiation après un quiz raté"
phase: P7
priority: V1
depends_on: [SPEC-711, SPEC-612]
business_rules: [BR-AUT-04]
screens: [SCR-09]
adrs: [ADR-0190]
visual: tokens
---

# SPEC-715 — Automatisme 4 : remédiation après un quiz raté

## 1. Objectif

Livrer l'automatisme `remediation` : après un quiz de validation sous le seuil, préparer la remédiation ciblée, la placer dans l'agenda, imposer un délai avant la tentative suivante (`RETRY_NOT_YET_ALLOWED`), rendre la remédiation conseillée ou obligatoire, afficher la date de disponibilité sur l'écran de résultat, et journaliser l'action (annulable jusqu'à la tentative suivante).

## 2. Contexte

Le résultat, les lacunes et l'activité de remédiation sont livrés par SPEC-612 (écran SCR-09, `design/maquettes/Quiz.dc.html`, état « échec » : « Relire le cours », « Nouvelle tentative », « Remédiation ciblée · 15 min »). BR-QUI-06 renvoie au délai de l'automatisme 4. Cette spécification ajoute la décision automatique, le délai, le mode, la planification et l'explication.

À lire : BR-AUT-04, BR-AUT-11, BR-QUI-02, BR-QUI-06, BR-QUI-08, BR-AGE-03 ; `docs/architecture/data-model.md` §5 (`attempts`, `activities`) et §7 ; `docs/architecture/api.md` (quiz, remédiation, code `RETRY_NOT_YET_ALLOWED`) ; `design/maquettes/Main.dc.html` (entrée « Remédiation prête » : « Tentative 1 à 58 % : 15 min de remédiation sur la clé de comptabilisation et les ledgers parallèles, à faire avant 14:00. », bouton « Ouvrir la remédiation ») ; `design/maquettes/Parametres.dc.html` (automatisme `remediation`, journal « Mar. 17:05 Quiz à 58 % : remédiation de 15 min préparée, tentative 2 placée mercredi 14:00. ») ; ADR-0014, ADR-0029, ADR-0190.

## 3. Dépendances

- **SPEC-711** : moteur, contrat ADR-0190 (déclencheur événementiel, `apply`, `undo`, `markConsumed`).
- **SPEC-612** : `prepareRemediation(ctx, attemptId)` (idempotent ; crée ou renvoie l'activité `remediation` ciblée sur les lacunes de la tentative, ≈ 15 min), `GET /modules/:mid/remediation`, `POST /modules/:mid/remediation/complete`, écran de résultat.
- Utilisés : SPEC-611 (`POST /modules/:mid/quiz/attempts`), SPEC-407 (`findCompatibleSlots`), SPEC-209 (notifications), SPEC-404 (lacunes).
- L'IA n'est appelée que par `prepareRemediation` (tâche `gaps`/`tutor` de SPEC-612) ; IA indisponible : voir CL-9.

## 4. Règles métier couvertes

- **BR-AUT-04** : définition `remediation` déclenchée par `quiz/graded` (`passed = false`) ; remédiation préparée ; tentative suivante disponible après `delayHours` (défaut 24 ; 0/12/24/48 h) ; mode `advised` (défaut, « Conseillée ») ou `mandatory` (« Obligatoire » : remédiation terminée exigée avant la tentative suivante).

## 5. Exigences fonctionnelles

- **EF-1 Paramètres** (`RemediationParams`) : `delayHours ∈ {0,12,24,48}` défaut 24 ; `mode ∈ {'advised','mandatory'}` défaut `'advised'`. Libellés (SPEC-710) : « Délai avant la tentative suivante » (« Aucun », « 12 h », « 24 h », « 48 h ») ; « Remédiation » (« Conseillée », « Obligatoire »).
- **EF-2 Déclenchement** : événement `quiz/graded` d'une tentative de quiz de validation (`activities.kind = 'validation_quiz'`) avec `passed = false`. Les examens blancs et exercices ne déclenchent pas cet automatisme.
- **EF-3 Action** : `kind = 'remediation_ready'`, `requiresConsent = false`, `formationId`, `payload = { dedupeKey: 'remediation:<attemptId>', attemptId, attemptNo, moduleId, moduleTitle, score, threshold, gapNotionIds, gapLabels, remediationActivityId, durationMin: 15, retryAvailableAt, mode, remediationSlotId, retrySlotId, retrySlotPrevious|null }`.
- **EF-4 Application** (`apply`) :
  1. `prepareRemediation(attemptId)` → `remediationActivityId` ;
  2. `retryAvailableAt = submitted_at + delayHours` ;
  3. créneau de remédiation : `schedule_slots.kind = 'revision'`, titre « Remédiation · {module} », `meta` « Lacunes du quiz · 15 min · ajoutée par le tuteur », durée 15 min, `activity_id = remediationActivityId`, au premier créneau compatible qui commence après `submitted_at + 15 min` et finit avant `retryAvailableAt` si `delayHours > 0` (sinon le premier créneau compatible) ;
  4. créneau de tentative : si un créneau `validation_quiz` planifié du module existe et commence avant `retryAvailableAt`, il est déplacé au premier créneau compatible ≥ `retryAvailableAt` (marge du module en priorité, comme ADR-0192 §4) et son ancienne position est gardée dans `retrySlotPrevious` ; s'il n'en existe aucun, un créneau de 1 h est créé de la même façon ; titre « Quiz · tentative {n+1} ».
  5. notification `new_gap` n'est pas émise ici (déjà émise par SPEC-404) ; la notification de l'action est `planning_adjusted` (préférence `type_planning`), titre « Remédiation prête », texte = `summary`, lien `/formations/<fid>/modules/<mid>/remediation`.
- **EF-5 Délai** : `POST /api/v1/modules/:mid/quiz/attempts` renvoie `422` `RETRY_NOT_YET_ALLOWED` tant que `now < retryAvailableAt` de la dernière action `remediation_ready` `applied` du module ; en mode `mandatory`, aussi tant que la remédiation n'est pas terminée. Corps `problem+json` avec extensions `{ retryAvailableAt, remediationRequired: boolean }` ; `detail` : « Nouvelle tentative possible {jour} {d} {mois} à {HH:mm}. » ou « Terminez d'abord la remédiation ciblée. ».
- **EF-6 Écran de résultat** (échec) : le bouton « Nouvelle tentative » (`data-testid="quiz-retry"`) est `aria-disabled="true"` tant que la tentative n'est pas permise ; sous la rangée d'actions, un texte `data-testid="quiz-retry-available-at"` : « Nouvelle tentative possible mercredi 11 nov. à 14:00. » ; en mode obligatoire non satisfait : « Nouvelle tentative possible après la remédiation, au plus tôt mercredi 11 nov. à 14:00. » ; délai écoulé et condition remplie : texte absent et bouton actif. « Remédiation ciblée · 15 min » ouvre `/formations/<fid>/modules/<mid>/remediation`. Le lien « Régler » vers `/parametres#automatismes` suit le texte.
- **EF-7 Consommation** : la création de la tentative suivante appelle `markConsumed` ; la complétion de la remédiation passe son créneau `done` sans consommer l'action.
- **EF-8 Explications** :
  - `applied` : « Quiz à {score} % : remédiation de 15 min préparée, tentative {n+1} placée {jour} {HH:mm}. » ; carte d'accueil : « Tentative {n} à {score} % : 15 min de remédiation sur {lacune1} et {lacune2}, à faire avant {HH:mm}. » (tu : identique, aucun pronom) ; dernière action (SPEC-710) : « {jour}, tentative {n} à {score} % : remédiation de 15 min prête, tentative {n+1} {jour2} {HH:mm}. » ;
  - mode obligatoire : ajout « Remédiation obligatoire avant la tentative. » ;
  - `undone` : « Annulé : délai et remédiation planifiée du quiz du module {k}. » ; `consumed` : texte `applied` inchangé.
- **EF-9 Annulation** (`undo`, avant la tentative suivante) : supprime le délai et l'obligation (la tentative devient possible immédiatement), passe le créneau de remédiation `cancelled`, remet le créneau de tentative à `retrySlotPrevious` (ou le supprime s'il a été créé) ; l'activité de remédiation reste accessible depuis le résultat.

## 6. Exigences techniques

- **ET-1 Schéma** : `RemediationParams = z.object({ delayHours: z.union([z.literal(0), z.literal(12), z.literal(24), z.literal(48)]).default(24), mode: z.enum(['advised', 'mandatory']).default('advised') })` ; kind `remediation_ready`.
- **ET-2 Définition** `packages/automations/src/definitions/remediation.ts` : `triggers: [{ type: 'event', name: 'quiz/graded' }]`.
- **ET-3 Garde de tentative** : fonction `checkRetryAllowed(ctx, moduleId) → Result<void, AppError>` dans `packages/services/src/quiz/retry-guard.ts`, appelée en tête du service de création de tentative (SPEC-611) ; lecture de l'action par `(user_id, automation = 'remediation', status = 'applied', payload->>'moduleId')` la plus récente.
- **ET-4 DTO de résultat** : `GET /api/v1/attempts/:aid/result` ajoute `retry: { allowed: boolean, availableAt: string|null, remediationRequired: boolean, remediationDone: boolean }` (champ ajouté au contrat de SPEC-612, rétrocompatible).
- **ET-5 Aucune route nouvelle** ; pas de nouveau code d'erreur (extensions du problème).
- **ET-6 Automatisme désactivé** : `delayHours` effectif = 0, mode = conseillé ; la remédiation reste disponible à la demande (SPEC-612).

## 7. Comportements attendus et cas limites

- **CL-1 Automatisme désactivé** : aucune action, aucun délai, aucun créneau ; « Nouvelle tentative » immédiatement actif.
- **CL-2 Heures calmes** : notification hors application reportée ; l'action et les créneaux sont créés immédiatement.
- **CL-3 Plafond de notifications** : envoi hors application `capped` ; in-app conservée.
- **CL-4 Pause globale active** : l'action est créée (le quiz a été passé, ce n'est pas un déclenchement différé) mais aucun créneau n'est placé pendant la pause ; ils le sont à la replanification du retour (SPEC-721).
- **CL-5 Double émission de `quiz/graded`** : `dedupeKey` par tentative → une seule action.
- **CL-6 Annulation après consommation** : tentative suivante déjà créée → 422 `AUTOMATION_ACTION_CONSUMED`.
- **CL-7 Délai 0** : aucun créneau de remédiation imposé avant la tentative ; il est placé au premier créneau libre ; la tentative est possible tout de suite (sauf mode obligatoire).
- **CL-8 Fuseau** : `retryAvailableAt` est un instant UTC ; l'affichage et le placement se font dans le fuseau de l'utilisateur ; le passage à l'heure d'hiver ne modifie pas la durée de 24 h.
- **CL-9 IA indisponible** (`AI_UNAVAILABLE` ou `AI_CAP_REACHED` reporté) : `prepareRemediation` échoue ; l'action est quand même appliquée (délai, créneau de tentative) sans créneau de remédiation, `payload.remediationActivityId = null`, explication « Quiz à {score} % : tentative {n+1} placée {jour} {HH:mm}. La remédiation sera prête dès que l'IA sera disponible. » ; en mode obligatoire, l'obligation est levée tant qu'aucune remédiation n'existe.
- **CL-10 Aucun créneau compatible avant le délai** : remédiation placée au premier créneau compatible après `submitted_at` ; aucun conflit avec le créneau de tentative (placement séquentiel).
- **CL-11 Réglage modifié après l'échec** : la valeur figée dans `payload` fait foi pour cette tentative.

## 8. Instructions d'implémentation

1. Schéma et kind. Commit `feat(SPEC-715): paramètres de la remédiation automatique`.
2. `definitions/remediation.ts` : `run` (filtre EF-2), `apply` (EF-4), `explain` (EF-8), `undo` (EF-9) ; enregistrement.
3. `retry-guard.ts` et branchement dans le service de création de tentative ; `markConsumed` à la création de la tentative suivante. Commit `feat(SPEC-715): délai et mode avant nouvelle tentative`.
4. Contrat de résultat (ET-4) et écran : bouton désactivé, texte de disponibilité, lien « Régler ». Textes dans `apps/web/messages/fr.ts`. Commit `feat(SPEC-715): disponibilité de la tentative sur le résultat`.
5. Tests (section 12). Commit `test(SPEC-715): …`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/automations/src/definitions/remediation.ts` (+ test), `packages/services/src/quiz/retry-guard.ts` (+ test), `packages/automations/test/integration/remediation.test.ts`, `apps/web/e2e/specs/automations/remediation.spec.ts`.
- **Modifiés** : `packages/contracts/src/automations.ts`, `packages/contracts/src/quiz.ts` (champ `retry`), `packages/automations/src/registry.ts`, service de création de tentative (SPEC-611), composant de résultat du quiz (SPEC-612), `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `prepareRemediation` (SPEC-612), `findCompatibleSlots` (SPEC-407), `@learny/ui` Button (état désactivé accessible).

## 10. Interface et conformité visuelle

- Mode `tokens` : écran de résultat existant (SCR-09, `design/maquettes/Quiz.dc.html`, état échec).
- Structure vérifiée : rangée d'actions « Relire le cours », « Nouvelle tentative » (`quiz-retry`, `aria-disabled="true"`, opacité 0,55, bordure `#DAD9D3`), « Remédiation ciblée · 15 min » (`quiz-remediation`, fond `#111113`) ; texte `quiz-retry-available-at` 13 px `#62626B`, aligné à droite sous les actions, suivi du lien « Régler » (`quiz-retry-settings`, couleur `#3A3AA8`).
- Jetons vérifiés par `expectTokens` ; ligne de base `toHaveScreenshot('quiz-resultat-delai.png', { maxDiffPixelRatio: 0.01 })` avec horloge figée 2026-11-11T12:20:00Z, prise sur l'état « délai en cours » produit par la fabrique décrite ci-dessous.
- Seed : l'action de démonstration (journal « Mar. 17:05 ») porte la valeur littérale `retryAvailableAt` = mercredi 11 nov. 14:00 Paris, cohérente avec le créneau « Quiz de validation · Tentative 2 » de 14:00 de la maquette Agenda ; à 13:20, l'écran de résultat de la tentative 1 affiche donc « Nouvelle tentative possible mercredi 11 nov. à 14:00. ». Les tests qui calculent le délai (24 h) utilisent une fabrique dédiée (échec à 12:00 le jour même).

## 11. Critères d'acceptation

- **CA-1** Un quiz de validation échoué crée une action `remediation_ready` avec activité de remédiation, créneau de 15 min et créneau de tentative suivante ≥ `retryAvailableAt` ; un quiz réussi n'en crée pas.
- **CA-2** Pendant le délai, `POST /modules/:mid/quiz/attempts` renvoie 422 `RETRY_NOT_YET_ALLOWED` avec `retryAvailableAt` ; après le délai, 201.
- **CA-3** En mode obligatoire, la tentative reste refusée (`remediationRequired: true`) jusqu'à `POST /modules/:mid/remediation/complete`.
- **CA-4** L'écran de résultat affiche le bouton désactivé et « Nouvelle tentative possible {jour} … à {HH:mm}. » pendant le délai.
- **CA-5** `undo` avant la tentative suivante lève le délai, retire le créneau de remédiation et restaure le créneau de tentative ; après la tentative suivante, 422 `AUTOMATION_ACTION_CONSUMED`.
- **CA-6** Désactivé : aucun délai ; double émission : une seule action ; IA indisponible : délai et créneau de tentative appliqués, explication adaptée.
- **CA-7** Les explications respectent EF-8 dans les deux tons ; contrôles de jetons et axe réussis.

## 12. Plan de tests

- **Unitaires** (`describe('[SPEC-715] remédiation …')`) : calcul de `retryAvailableAt` (y compris changement d'heure) ; `checkRetryAllowed` (délai, obligation, désactivé) ; `explain` × statuts × tons ; composant de résultat (bouton désactivé, textes).
- **Intégration** (`[SPEC-715]`, base réelle, événement `quiz/graded` exécuté directement, horloge avancée de +1 h, +23 h, +25 h) : création et placements (CA-1) ; 422 puis 201 (CA-2) ; mode obligatoire (CA-3) ; undo et consommation (CA-5) ; désactivé, double émission, IA indisponible simulée par fixture `AI_UNAVAILABLE`, pause globale (CA-6) ; heures calmes et plafond sur la notification.
- **End-to-end** (`apps/web/e2e/specs/automations/remediation.spec.ts`, vidéo) : `test('quiz raté : remédiation prête et tentative différée @SPEC-715', …)` : fabrique d'un échec à 12:00, ouvrir le résultat, vérifier le bouton désactivé et le texte (CA-4), ouvrir la remédiation, revenir, ouvrir `/parametres#automatismes` et trouver la ligne du journal, cliquer « Annuler », revenir au résultat : bouton actif. Axe.
- **Visuel** (`test('résultat avec délai, jetons @SPEC-715 @visual', …)`) : `expectTokens`, structure, ligne de base (CA-7).
- **Non-régression** : `@SPEC-611`, `@SPEC-612`, `@SPEC-711`.

| Critère | Tests |
|---|---|
| CA-1 | intégration « création » |
| CA-2 | intégration « délai » ; unitaire `checkRetryAllowed` |
| CA-3 | intégration « obligatoire » |
| CA-4 | e2e ; unitaire composant |
| CA-5 | intégration « undo » ; e2e |
| CA-6 | intégration « cas limites » |
| CA-7 | unitaire `explain` ; visuel `@visual` ; axe |

## 13. Preuves attendues

`evidence/SPEC-715/` : vidéo `video/remediation.webm`, captures `screenshots/resultat-delai.png`, `screenshots/journal-remediation.png`, `screenshots/resultat-apres-annulation.png`, réponse 422 consignée (`screenshots/` ou `summary.md`), rapports, `acceptance.md`.

## 14. Définition de terminé

Définition commune (`docs/engineering/testing.md` §7) ; de plus : la garde de tentative est couverte par un test d'intégration au niveau API ; aucune route ni code d'erreur nouveau.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0014, ADR-0029, ADR-0047, ADR-0190.
- Décisions : la remédiation est placée comme créneau `revision` de 15 min ; la tentative suivante est placée (ou déplacée) au premier créneau compatible après le délai, marge du module en priorité ; l'obligation est exprimée par l'extension `remediationRequired` de `RETRY_NOT_YET_ALLOWED` (pas de nouveau code) ; l'action est consommée par la tentative suivante ; valeurs figées au moment de l'échec.
- Hypothèse : `prepareRemediation` de SPEC-612 est idempotent ; sinon SPEC-715 l'enveloppe d'un verrou par tentative. Champ de contrat ajouté : `retry` dans le résultat de tentative (signalé).
