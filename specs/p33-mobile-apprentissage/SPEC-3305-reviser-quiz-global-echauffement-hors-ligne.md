---
id: SPEC-3305
title: Réviser — quiz global, échauffement et jeu hors ligne
phase: P33
priority: mobile
depends_on: [SPEC-3301, SPEC-3201]
business_rules: [BR-MEM-02, BR-MEM-03, BR-MEM-05, BR-MEM-08, BR-MEM-10, BR-AUT-03, BR-AUT-07, BR-GAM-02, BR-PLA-01]
screens: [SCR-10]
adrs: [ADR-0037, ADR-3002, ADR-3003, ADR-3005, ADR-3009]
visual: mockup
---

# SPEC-3305 — Réviser : quiz global, échauffement et jeu hors ligne

## 1. Objectif

Livrer l'onglet Réviser : la session de quiz global du jour (tous les jeux, rail, raison du
tuteur, auto-évaluation des cartes, écran de fin), l'échauffement (« À revoir » / « Je savais »)
et le jeu hors ligne avec correction locale, file des réponses et synchronisation, équivalents au
web (SPEC-701, SPEC-702, SPEC-714, SPEC-801).

## 2. Contexte

Maquette : écran 07 « Quiz global » (`view.html#screen=session`, fonction `session` de
`design/app-mobile/assets/screens.js`, exports `{ios,android}-06-session.png`), **lue avec
ADR-3003 §2 « Réviser »** : la carte de rappel s'auto-évalue « Raté / Difficile / Bon / Facile »
avec échéances ; « À revoir » / « Je savais » sont les boutons de l'échauffement. Équivalents
web : SCR-10 (`QuizGlobal.dc.html`), SPEC-701 (session, carte de rappel, EF-4 à EF-12),
SPEC-702 (jeux), SPEC-714 (échauffement), SPEC-718 (plafond et report), SPEC-801 (hors ligne,
EF-4 à EF-8, ET-6 à ET-8). Contrats : `review.ts` (`GET /formations/:fid/global-quiz/today`,
`POST /review-sessions/:sid/answers`, `POST /review-sessions/:sid/complete`), `warmup.ts`
(`GET /warmups/today`, `POST /warmups/:activityId/answers`), `offline.ts` (`GET /offline/pack`,
`POST /sync/offline-answers`). Code pur : `@learny/bricks` `gradeBrick`, `@learny/domain`
`review/game-response.ts` (ADR-3005).

## 3. Dépendances

- **SPEC-3301** (rendus des jeux et de la carte), **SPEC-3201** (carte Échauffement d'Aujourd'hui).
- SPEC-3003 (file hors ligne, réseau, purge).
- Données SPEC-115 : quiz global de 14 notions, 10 min, série de 12 jours, 4 notions reportées à
  jeudi par le tuteur.

## 4. Règles métier couvertes

- BR-MEM-02 — Carte de rappel : auto-évaluation à quatre niveaux ; autres jeux : note déduite par
  le serveur ; hors ligne, aucune note FSRS côté client (« Échéance calculée au retour du
  réseau »).
- BR-MEM-03 — Une session par formation et par jour, fournie par le serveur ; sélecteur de
  formation si plusieurs formations ont une session.
- BR-MEM-05 — Jeux : carte de rappel, texte à trous, association, remise en ordre, classement
  (SPEC-3301).
- BR-MEM-08 — Rail des jeux (fait / en cours / à venir), progression, raison du tuteur, « Passer »,
  écran de fin (notions revues, réussies espacées davantage, à revoir plus tôt, série).
- BR-MEM-10 — Correction et explication immédiates après chaque réponse (serveur en ligne,
  `gradeBrick` hors ligne).
- BR-AUT-03 — Échauffement : N questions de rappel, « Voir la réponse », « Je savais » /
  « À revoir », score ; une notion « À revoir » rejoint le quiz global du soir (serveur).
- BR-AUT-07 — Encadré « Le tuteur a reporté N notions à jeudi pour garder la session sous
  10 minutes. Annuler » (texte et action renvoyés par l'API).
- BR-GAM-02 — Carte « Série de 12 jours » avec les 14 derniers jours.
- BR-PLA-01 — Hors ligne : la session du jour et les cartes de rappel préchargées sont jouables,
  réponses en file, synchronisées au retour du réseau, serveur faisant foi.

## 5. Exigences fonctionnelles

- **EF-1** — Racine de l'onglet `(app)/reviser` : en-tête « Session du mercredi 11 novembre » /
  « Quiz global », progression « Notion 4 sur 14 » et durée, zone de jeu (carte ou jeu), boutons
  de réponse propres au jeu, carte « Série », encadré du tuteur ; s'il existe un échauffement non
  fait, une carte « Échauffement · N questions » le propose avant la session.
- **EF-2** — Rail des jeux horizontal au-dessus de la zone de jeu (statuts) ; « Passer » discret
  et bouton citron « Suivant » / « Terminer la session » (règles SPEC-701 EF-10).
- **EF-3** — Carte de rappel : recto « Touchez pour révéler », verso, « Aviez-vous trouvé ? » et
  quatre boutons « Raté », « Difficile », « Bon », « Facile » avec échéances ; un appui enregistre
  et verrouille.
- **EF-4** — Écran de fin : notions revues, réussies espacées davantage, à revoir plus tôt, série
  mise à jour, bouton « Retour à Aujourd'hui ».
- **EF-5** — Échauffement (route `reviser/echauffement/[activityId]`) : question, « Voir la
  réponse », « À revoir » / « Je savais » (boutons de la maquette), score final.
- **EF-6** — États : vide « Rien à revoir aujourd'hui » (texte SPEC-701 EF-12), formation en
  pause, erreur, erreur d'envoi d'une réponse.
- **EF-7** — Préchargement : au premier plan et une fois par jour, `GET /offline/pack` est stocké
  (MMKV chiffrée) pour chaque formation active.
- **EF-8** — Mode hors ligne : bandeau « Mode hors ligne · vos réponses seront envoyées au retour
  du réseau. » ; correction locale par `gradeBrick` ; chaque réponse et chaque clôture
  enregistrées dans la file avec un `clientAnswerId` UUID **avant** l'affichage de la correction ;
  synchronisation par lots de 50 (`POST /sync/offline-answers`) au retour du réseau et au premier
  plan ; résultats `rejected` signalés par un toast « N réponses n'ont pas pu être prises en
  compte » sans bloquer.
- **EF-9** — Bascule transparente : une coupure réseau pendant une session en ligne met la réponse
  en file, affiche la correction locale et passe en mode hors ligne sans perdre la position.

## 6. Exigences techniques

- **ET-1** — `src/offline/queue.ts` : file persistante ordonnée par `answeredAt`, statuts
  `pending`, `syncing`, `rejected` (schémas de `offline.ts`) ; synchronisation exclusive (un seul
  envoi à la fois) ; purge à la déconnexion.
- **ET-2** — `answeredAt` lu sur `clock.now()` ; aucune note FSRS calculée côté client.
- **ET-3** — En ligne, chaque réponse est envoyée à `POST /review-sessions/:sid/answers` avec
  `clientAnswerId` ; 409 (déjà répondue) traité comme succès idempotent.
- **ET-4** — Le pack et la file sont chiffrés au repos (instance MMKV de SPEC-3003).

## 7. Comportements attendus et cas limites

- **CL-1** — Synchronisation interrompue : les entrées `syncing` repassent `pending` et sont
  renvoyées ; l'idempotence serveur empêche les doublons.
- **CL-2** — Pack de la veille : non jouable (« Session expirée, reconnectez-vous pour la session
  du jour ») ; entrées plus vieilles que 7 jours rejetées par le serveur (`EXPIRED`).
- **CL-3** — Session complétée sur le web pendant le jeu hors ligne : à la synchronisation, le
  serveur fait foi ; l'écran se recharge depuis le serveur.
- **CL-4** — « Annuler » le report du tuteur hors ligne : désactivé.
- **CL-5** — Deux formations : sélecteur de formation en tête ; chaque session est indépendante.

## 8. Instructions d'implémentation

1. Hooks `useGlobalQuizToday(fid)`, `useWarmupsToday()`, mutations de réponse et de clôture.
2. Écran de session (rail, zone de jeu, pied, série, encadré), écran de fin, échauffement.
3. `offline/pack.ts`, `offline/queue.ts`, `offline/sync.ts` et branchement réseau.
4. Tests (dont scénarios hors ligne simulés), intégration (synchronisation contre l'API),
   Maestro (mode avion), visuel.

## 9. Fichiers et composants concernés

- **Créés** — `apps/mobile/app/(app)/reviser/index.tsx` (remplace l'écran provisoire),
  `apps/mobile/app/(app)/reviser/echauffement/[activityId].tsx`, `apps/mobile/src/features/reviser/**`,
  `apps/mobile/src/offline/{pack,queue,sync}.ts`, `apps/mobile/src/data/{review,warmup}.ts`,
  tests, `apps/mobile/e2e/flows/SPEC-3305-*.yaml`.
- **Modifiés** — `apps/mobile/src/offline/purge.ts`, `apps/mobile/src/features/aujourdhui/*`
  (ouverture de l'échauffement), `packages/i18n/src/fr/mobile.ts`.
- **Lus** — `packages/contracts/src/{review,warmup,offline}.ts`, `packages/bricks/src/grade.ts`,
  `packages/domain/src/review/game-response.ts`, `specs/p8-livraison-v1/SPEC-801-application-installable-et-revisions-hors-ligne.md`.

## 10. Interface et conformité visuelle

Mode `mockup` : `ios-06-session.png`, `android-06-session.png` (notion 4 sur 14, carte recto) avec
écarts d'ADR-3003 : zone des boutons « À revoir / Je savais » masquée pour la session (ces boutons
sont comparés dans le flux de l'échauffement), rail des jeux ajouté (ligne de base de zone).
Masques : barre d'état, barre d'onglets. `testID` : `review-progress`, `review-rail`,
`review-card`, `review-grade-<raté|difficile|bon|facile>`, `review-skip`, `review-next`,
`review-streak`, `review-tutor-note`, `review-offline-banner`, `warmup-knew`, `warmup-again`.

## 11. Critères d'acceptation

- **CA-1** — La session du jour se joue de bout en bout (carte de rappel et au moins un jeu
  d'association) et l'écran de fin affiche la série mise à jour.
- **CA-2** — La carte de rappel s'auto-évalue sur quatre niveaux avec échéances ; l'échauffement
  utilise « À revoir » / « Je savais » et une notion « À revoir » apparaît dans la session du soir.
- **CA-3** — En mode avion, la session préchargée se joue avec correction immédiate, les réponses
  sont en file, puis synchronisées au retour du réseau sans doublon ; le serveur fait foi.
- **CA-4** — L'encadré de report du tuteur s'affiche et « Annuler » rétablit les notions.
- **CA-5** — Session et échauffement conformes à la maquette corrigée (écart ≤ 12 %).

## 12. Plan de tests

- **Unitaires** — Vitest `[SPEC-3305]` `offline/queue.test.ts` (ordre, statuts, reprise,
  idempotence), `offline/sync.test.ts` (lots de 50, rejets), `features/reviser/session-state.test.ts`.
  Jest `[SPEC-3305]` : `review-screen.test.tsx`, `recall-grades.test.tsx`, `warmup.test.tsx`,
  `end-screen.test.tsx`, `offline-mode.test.tsx`. Couvre CA-1, CA-2, CA-3.
- **Intégration** — Vitest `[SPEC-3305]` `test/integration/review.int.test.ts` : session du
  jour, réponses, clôture, pack, synchronisation (doublons, `EXPIRED`, `SESSION_CLOSED`),
  échauffement. Couvre CA-1, CA-2, CA-3, CA-4.
- **End-to-end** — Maestro `@SPEC-3305` (vidéo) : `SPEC-3305-session.yaml`,
  `SPEC-3305-echauffement.yaml`, `SPEC-3305-hors-ligne.yaml` (mode avion, jeu, retour du réseau,
  vérification serveur), `SPEC-3305-report.yaml`. Couvre CA-1, CA-2, CA-3, CA-4.
- **Visuel** — `@SPEC-3305 @visual` : session iOS/Android, échauffement iOS. Couvre CA-5.
- **Non-régression** — `[SPEC-3301]`, `[SPEC-3201]`, `[SPEC-3003]` ; e2e web `@SPEC-701`,
  `@SPEC-801` (aucun changement serveur).

| Critère | Tests |
|---|---|
| CA-1 | session-state.test, review-screen.test, review.int, SPEC-3305-session.yaml |
| CA-2 | recall-grades.test, warmup.test, review.int, SPEC-3305-echauffement.yaml |
| CA-3 | queue.test, sync.test, offline-mode.test, review.int, SPEC-3305-hors-ligne.yaml |
| CA-4 | review.int, SPEC-3305-report.yaml |
| CA-5 | flux visuel |

## 13. Preuves attendues

`evidence/SPEC-3305/` : `acceptance.md`, rapports, vidéos (dont le mode avion), captures et
comparaisons, état des réponses en base après synchronisation (aucun doublon).

## 14. Définition de terminé

Définition commune adaptée par ADR-3004 ; `validate.mjs SPEC-3305` vert.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0037 (hors ligne), ADR-3002, ADR-3003, ADR-3005, ADR-3009.
- La micro-séance (SPEC-703) est jouée comme une session de durée réduite si l'API la renvoie ;
  aucun sélecteur de durée n'est ajouté en V1 mobile.
