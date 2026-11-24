---
id: SPEC-3304
title: Quiz de validation et résultat
phase: P33
priority: mobile
depends_on: [SPEC-3301, SPEC-3202]
business_rules: [BR-QUI-01, BR-QUI-02, BR-QUI-04, BR-QUI-05, BR-QUI-06, BR-QUI-07, BR-QUI-08, BR-AUT-04]
screens: [SCR-09]
adrs: [ADR-0014, ADR-3002, ADR-3003, ADR-3009]
visual: mockup
---

# SPEC-3304 — Quiz de validation et résultat

## 1. Objectif

Livrer le quiz de validation d'un module sur mobile : démarrage ou reprise d'une tentative,
réponse question par question avec « Vérifier » et correction immédiate, soumission, écran de
résultat et suites (module suivant, remédiation, nouvelle tentative).

## 2. Contexte

Maquette : écran 06 « Quiz de validation » (`view.html#screen=quiz`, fonctions `quiz` et
`result` de `design/app-mobile/assets/screens.js`, exports `{ios,android}-05-quiz.png`, état
`design/app-mobile/exports/states/ios-resultat.png`), **lue avec les corrections d'ADR-3003 §2** :
bouton « Vérifier », correction immédiate, réponse verrouillée ensuite, pas de chronomètre,
mention « Correction immédiate · nouvelles questions à chaque tentative ». Équivalent web : SCR-09
(`Quiz.dc.html`, SPEC-611, SPEC-612). Contrats : `packages/contracts/src/attempts.ts`,
`questions.ts`, `quiz-result.ts` (`POST /modules/:mid/quiz/attempts`, `GET /attempts/:aid`,
`PUT /attempts/:aid/answers/:pos`, `POST /attempts/:aid/answers/:pos/check`,
`POST /attempts/:aid/submit`, `GET /attempts/:aid/result`). Rendus de questions : SPEC-3301.

## 3. Dépendances

- **SPEC-3301** (questions à choix, questions ouvertes), **SPEC-3202** (accès depuis le module).
- Données SPEC-115 : module 3, tentative 2, seuil 80 %.

## 4. Règles métier couvertes

- BR-QUI-01 — Le nombre de questions (10 à 20) et le barème viennent de la tentative ; questions à
  choix et ouvertes.
- BR-QUI-02 — Chaque réponse est enregistrée à la question (`PUT …/answers/:pos`) avec le temps
  passé ; une tentative interrompue est reprise à la première question sans réponse.
- BR-QUI-04 — « Vérifier » (`POST …/check`) affiche justesse et explication ; la réponse n'est
  plus modifiable ; les questions ouvertes affichent « Corrigée par le tuteur à la fin de la
  tentative ».
- BR-QUI-05 — Score ≥ seuil : résultat « Module validé », module suivant débloqué, bouton
  « Ouvrir le module suivant ».
- BR-QUI-06 — Score < seuil : lacunes listées, « Commencer la remédiation » et date de la
  prochaine tentative (`RETRY_NOT_YET_ALLOWED` → date affichée, bouton inactif).
- BR-QUI-07 — En-tête : « Question n sur N », numéro de tentative, seuil, type de question,
  notion, mention « Correction immédiate · nouvelles questions à chaque tentative ».
- BR-QUI-08 — Résultat : score, seuil, réussite/échec, score par notion, lacunes détectées avec
  nature, historique des tentatives (graphique en barres), actions.
- BR-AUT-04 — La remédiation proposée après échec s'ouvre sur le web (ADR-3002) avec
  « Continuer sur le web ».

## 5. Exigences fonctionnelles

- **EF-1** — Route `quiz/[attemptId]` (création par `POST /modules/:mid/quiz/attempts` depuis le
  module, le cours, Aujourd'hui ou l'agenda, avec `Idempotency-Key`) en plein écran sans onglets.
- **EF-2** — En-tête : croix « Quitter », « Question 3 sur 10 », sous l'en-tête la ligne
  « Tentative 2 · seuil 80 % » ; barre segmentée (fait-juste citron, fait-faux orange, courante
  encre, à venir gris).
- **EF-3** — Corps : étiquette indigo « APPLICATION · CHAPITRE 2 » (type et notion), énoncé
  Space Grotesk, consigne, options (SPEC-3301), mention BR-QUI-07 en pied de corps.
- **EF-4** — Pied : bouton citron « Vérifier » (désactivé tant qu'aucune option n'est choisie),
  puis après correction « Question suivante » ou « Terminer la tentative » à la dernière.
- **EF-5** — « Quitter » : confirmation « Quitter le quiz ? Vos réponses sont enregistrées, vous
  pourrez reprendre. » (« Quitter » / « Continuer »).
- **EF-6** — « Terminer la tentative » : `POST …/submit` puis route `quiz/[attemptId]/resultat`.
- **EF-7** — Résultat : score en grand, « Seuil 80 % », bandeau Réussi / Pas encore, score par
  notion (barres), lacunes avec nature (oubli, confusion…), historique des tentatives, actions
  de la section 4 (BR-QUI-05, BR-QUI-06) ; questions ouvertes en attente de correction : mention « Correction du
  tuteur en cours » et rafraîchissement.
- **EF-8** — Haptique : succès léger à une bonne réponse, avertissement à une mauvaise (réglage
  système).

## 6. Exigences techniques

- **ET-1** — `useAttempt(aid)`, mutations `saveAnswer`, `checkAnswer`, `submitAttempt` ;
  `useAttemptResult(aid)` avec rafraîchissement toutes les 5 s tant que des corrections du tuteur
  sont en attente (arrêt à la sortie de l'écran).
- **ET-2** — Temps par question mesuré avec `clock.now()` (premier affichage → vérification),
  envoyé avec la réponse si le contrat le prévoit.
- **ET-3** — Aucune correction calculée localement : la justesse vient de `…/check` (le quiz de
  validation n'est pas jouable hors ligne).
- **ET-4** — Retour Android et geste de retour iOS déclenchent la confirmation d'EF-5.

## 7. Comportements attendus et cas limites

- **CL-1** — Réseau coupé avant « Vérifier » : message « Votre réponse n'a pas pu être
  enregistrée. Réessayez. » et bouton « Réessayer » ; la sélection est conservée.
- **CL-2** — Double appui sur « Vérifier » : une seule vérification.
- **CL-3** — Tentative déjà soumise sur le web : ouverture directe du résultat.
- **CL-4** — Application tuée en cours de quiz : reprise à la première question sans réponse.
- **CL-5** — Nouvelle tentative avant le délai : `RETRY_NOT_YET_ALLOWED` → date et heure de
  disponibilité dans le fuseau de l'utilisateur.
- **CL-6** — Hors ligne à l'ouverture : écran « Le quiz de validation nécessite une connexion ».

## 8. Instructions d'implémentation

1. Hooks et mutations ; machine d'état de la question (choisir → vérifier → corrigée).
2. Écran quiz, en-tête segmenté, pied, confirmation de sortie.
3. Écran résultat (barres par notion, historique, lacunes, actions).
4. Tests, intégration, Maestro, visuel.

## 9. Fichiers et composants concernés

- **Créés** — `apps/mobile/app/quiz/[attemptId].tsx`, `apps/mobile/app/quiz/[attemptId]/resultat.tsx`,
  `apps/mobile/src/features/quiz/**`, `apps/mobile/src/data/attempts.ts`, tests,
  `apps/mobile/e2e/flows/SPEC-3304-*.yaml`.
- **Modifiés** — points d'entrée (Programme, Cours, Aujourd'hui, Agenda), `packages/i18n/src/fr/mobile.ts`.
- **Lus** — `packages/contracts/src/{attempts,questions,quiz-result}.ts`, `packages/i18n/src/fr/*`.

## 10. Interface et conformité visuelle

Mode `mockup` : `ios-05-quiz.png`, `android-05-quiz.png` (question 3 sur 10, aucune option
choisie) avec écarts d'ADR-3003 : zone du chronomètre masquée, libellé « Vérifier » attendu à la
place de « Valider » (contrôle structurel), mention BR-QUI-07 ajoutée (zone comparée à la ligne
de base) ; `states/ios-resultat.png` pour le résultat. `testID` : `quiz-close`, `quiz-progress`,
`quiz-attempt-meta`, `quiz-question`, `quiz-check`, `quiz-next`, `quiz-finish`,
`result-score`, `result-notion-<id>`, `result-gap-<id>`, `result-next-module`,
`result-remediation`, `result-retry`.

## 11. Critères d'acceptation

- **CA-1** — Une tentative se joue de bout en bout : chaque « Vérifier » affiche la correction et
  verrouille la réponse ; la soumission ouvre le résultat.
- **CA-2** — L'en-tête affiche « Question n sur N », « Tentative 2 · seuil 80 % » et la mention
  BR-QUI-07 ; aucun chronomètre n'est affiché.
- **CA-3** — Une tentative réussie valide le module et le module suivant apparaît débloqué dans
  Programme ; une tentative échouée affiche lacunes, remédiation (web) et date de nouvelle
  tentative.
- **CA-4** — Quitter puis rouvrir reprend à la première question sans réponse.
- **CA-5** — Quiz et résultat conformes à la maquette corrigée (écart ≤ 12 % hors zones masquées).

## 12. Plan de tests

- **Unitaires** — Vitest `[SPEC-3304]` `features/quiz/question-machine.test.ts`,
  `features/quiz/progress-segments.test.ts`. Jest `[SPEC-3304]` : `quiz-screen.test.tsx`
  (Vérifier, verrouillage, absence de chronomètre, mention), `quit-confirm.test.tsx`,
  `result-screen.test.tsx`. Couvre CA-1, CA-2, CA-4.
- **Intégration** — Vitest `[SPEC-3304]` `test/integration/attempts.int.test.ts` : création,
  réponses, vérification, soumission, résultat, `RETRY_NOT_YET_ALLOWED`. Couvre CA-1, CA-3.
- **End-to-end** — Maestro `@SPEC-3304` (vidéo) : `SPEC-3304-reussite.yaml` (tentative réussie,
  module suivant débloqué), `SPEC-3304-echec.yaml` (lacunes, remédiation web, date),
  `SPEC-3304-reprise.yaml`. Couvre CA-1, CA-3, CA-4.
- **Visuel** — `@SPEC-3304 @visual` : question 3 iOS/Android, résultat iOS. Couvre CA-2, CA-5.
- **Non-régression** — `[SPEC-3301]`, `[SPEC-3202]`, e2e web `@SPEC-611` (aucun changement
  serveur attendu).

| Critère | Tests |
|---|---|
| CA-1 | question-machine.test, quiz-screen.test, attempts.int, SPEC-3304-reussite.yaml |
| CA-2 | quiz-screen.test, flux visuel |
| CA-3 | attempts.int, SPEC-3304-reussite.yaml, SPEC-3304-echec.yaml |
| CA-4 | quit-confirm.test, SPEC-3304-reprise.yaml |
| CA-5 | flux visuel |

## 13. Preuves attendues

`evidence/SPEC-3304/` : `acceptance.md`, rapports, vidéos (réussite, échec, reprise), captures et
comparaisons, état du module en base après réussite.

## 14. Définition de terminé

Définition commune adaptée par ADR-3004 ; `validate.mjs SPEC-3304` vert.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0014, ADR-3002, ADR-3003, ADR-3009.
- Remédiation, exercice et examen blanc restent sur le web (ADR-3002).
- Les données seedées permettent une tentative réussie et une échouée (comptes ou modules de
  démonstration distincts de SPEC-115) ; à défaut, la fabrique de tests de `packages/testing`
  prépare l'état avant le flux.
