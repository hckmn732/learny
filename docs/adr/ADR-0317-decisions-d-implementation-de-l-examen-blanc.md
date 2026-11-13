# ADR-0317 — Décisions d'implémentation de l'examen blanc

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-13
- **Liens** : SPEC-614

## Contexte

SPEC-614 précise le format, le chronomètre et les scores mais laisse ouvertes la composition exacte des questions, le stockage des marqueurs et la réconciliation des créneaux.

## Décision

1) L'examen ne tire que des questions corrigées par le code (choix, texte à trous, association), préfère les briques purpose=exam puis la banque, et respecte le format officiel dans la limite de la banque disponible (jamais de question réutilisée pour compléter). 2) Les marqueurs sont persistés dans attempts.review_feedback.markedPositions, sans migration. 3) Les scores étudiés/diagnostic sont calculés par le code ; les positions diagnostiques sont stockées dans activities.config.diagnosticPositions et applyLearningResult n'alimente jamais gap_events pour elles. 4) Deux créneaux mock_exam sont réconciliés de façon idempotente (planner_key mock-exam:<formation>:1|2) à la fin de l'avant-dernier module et le dernier jour.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
