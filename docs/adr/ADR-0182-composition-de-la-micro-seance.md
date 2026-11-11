# ADR-0182 — Composition de la micro-séance

- **Statut** : Acceptée
- **Origine** : Déduite (préparation du référentiel, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-703, SPEC-713

## Contexte

BR-AUT-02 parle de « cartes de rappel + une question » de D minutes (3, 5 ou 10), alors que la maquette montre deux jeux (une carte, un texte à trous) couvrant « 5 notions » en « ≈ 5 min ».

## Décision

1. Micro-séance = une carte de rappel sur la notion la plus prioritaire (lacune d'abord, puis retard FSRS), puis une question ; pour D = 10, deux cartes de rappel puis une question.
2. La question est de préférence un format multi-notions (texte à trous, association, classement, dans cet ordre) couvrant jusqu'à 4 autres notions prioritaires, sinon une question à choix ; sans variante disponible, la micro-séance se limite aux cartes.
3. La durée affichée est D (pas une estimation) ; la session est une activité `global_quiz_session` de `mode = 'micro'`, indépendante de la session complète du même jour.
4. La terminer avec au moins une réponse non passée rend la journée qualifiante (source `micro_session`) ; la série n'est comptée qu'une fois par jour.
5. La micro-séance est toujours accessible manuellement ; l'automatisme 2 ne gouverne que sa proposition à l'heure H (SPEC-713).

## Conséquences

Événement `review/session-completed` émis à la clôture de toute session pour que l'automatisme 2 marque sa proposition « consommée ».
