# ADR-0192 — Détection du décrochage et replacement des séances manquées

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-712, SPEC-713, SPEC-721

## Contexte

BR-AUT-01 parle de « séance manquée », de « N jours sans activité » et de « prochaine marge disponible » sans fixer l'heure de détection, la façon de compter les jours ni l'emplacement du replacement.

## Décision

1. **Séance manquée** : créneau `planned` d'une formation active, de type `contributions|course|exercise|validation_quiz|revision|sprint|mock_exam`, dont `ends_at` est passé et qui n'est pas `done` au tick horaire de 22 h locale (fin du moment « soir », BR-ACC-08) ; il passe `missed` à ce moment (le cron nocturne reste le filet de sécurité). Les créneaux `global_quiz`, `warmup`, `micro_session`, `weekly_review` et `buffer` ne sont jamais replacés.
2. **Jours sans activité** : nombre de jours d'étude prévus (rythme du profil), consécutifs, antérieurs à aujourd'hui (fuseau de l'utilisateur), sans ligne `daily_activity.qualifying = true` ; les jours non prévus et les jours de pause sont neutres (comme ADR-0033) ; le décompte s'arrête au jour de création du compte. Il est évalué au tick horaire de 08 h locale.
3. **Épisode de décrochage** : identifié par la date de la dernière activité qualifiante ; une seule proposition « reprise de 5 min » et une seule proposition « alléger / décaler » par formation et par épisode.
4. **Emplacement du replacement** : premier créneau `buffer` planifié de la même formation, commençant au moins 1 h après l'instant de détection et dans les 7 jours ; la séance y est placée à son début avec la durée `min(durée manquée, durée de la marge)`, la marge étant raccourcie d'autant (ou annulée si entièrement utilisée). À défaut de marge : premier créneau libre compatible renvoyé par le planificateur (SPEC-407, jours et moments d'étude, capacité quotidienne). Les trois créneaux de rechange sont les trois emplacements compatibles suivants, distincts du premier et sur au moins deux jours différents si possible.

## Conséquences

Les textes distinguent « dans une marge de votre agenda » et « dans un créneau libre de votre agenda ».
