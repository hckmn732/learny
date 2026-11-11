# ADR-0180 — Cycle de vie de la session de quiz global

- **Statut** : Acceptée
- **Origine** : Déduite (préparation du référentiel, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-701, SPEC-702, SPEC-703

## Contexte

BR-MEM-03 et BR-MEM-08 décrivent la session quotidienne sans préciser quand elle est créée, comment elle est reprise, ce que fait « Passer », ni d'où viennent les justifications affichées (« Réglé par le tuteur ») alors qu'aucun appel IA n'est permis pendant la session (BR-IA-09).

## Décision

1. Une session = une activité `global_quiz_session` par (utilisateur, formation, jour local, mode `full|micro`), créée paresseusement au premier `GET /formations/:fid/global-quiz/today` du jour, sous verrou consultatif ; une tentative unique (`attempt_no = 1`).
2. Les textes de justification (puces « Lacune en priorité », « Charge lissée », « Modules mêlés », note du sélecteur) sont produits par des gabarits du code au moment de la création et figés dans `activities.config` ; le jeu de démonstration peut y écrire les textes exacts des maquettes.
3. FSRS est mis à jour à chaque réponse (événement `review/answered`), pas à la clôture.
4. « Passer » enregistre une réponse `{ skipped: true }` sans note FSRS : la notion reste due et est comptée « reviendra plus tôt ». Les items non traités à la clôture sont passés.
5. Une tentative `in_progress` d'un jour antérieur est close (`abandoned`) à l'ouverture suivante ; la série n'est attribuée qu'à la clôture d'une session comportant au moins une réponse non passée.
6. Idempotence des réponses par `clientAnswerId` (stocké dans `answers.feedback.clientAnswerId`), compatible avec la file hors ligne de SPEC-801.

## Conséquences

Aucune colonne nouvelle ; nouveau code d'erreur `SESSION_CLOSED` (422). Les micro-séances (SPEC-703) suivent le même cycle avec `mode = 'micro'`.
