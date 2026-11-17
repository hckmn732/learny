# ADR-0334 — Report de quatre tests SPEC-803 vers SPEC-807

- **Statut** : Acceptée
- **Origine** : Décision du porteur (17/11/2026)
- **Date** : 2026-11-17
- **Liens** : SPEC-803, SPEC-807

## Contexte

Trois parcours clavier de SPEC-803 (quiz de validation, examen blanc, quiz global) et le test de mouvement réduit dépendent de données que le jeu de démonstration ne fournit pas de façon stable : pas de banque de questions de module, tentative d examen semée dont le résultat renvoie 500, séance du quiz global consommée par les autres fichiers de la campagne. Leurs défauts relèvent de la mise en place des tests, pas d une non-conformité constatée de l interface.

## Décision

Décision du porteur : ces quatre tests sont marqués test.fixme avec leur raison et repris par SPEC-807, dont les parcours EF-2, EF-3 et EF-5 rejouent quiz de validation, révisions et examen blanc de bout en bout avec des données préparées par le flux réel. SPEC-803 est terminée avec les autres contrôles verts ; CA-2 et CA-5 sont acceptés avec cette réserve explicite.

## Conséquences

SPEC-807 doit réactiver ces quatre tests (retirer test.fixme) et les faire passer ; tant que ce n est pas fait, la conformité clavier de ces trois parcours et le mouvement réduit de la carte de rappel restent non vérifiés par un test automatisé.
