# ADR-0327 — Décisions d'implémentation de l'automatisme échauffement

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-14
- **Liens** : SPEC-714, SPEC-711, SPEC-410, SPEC-411, ADR-0190, ADR-0193

## Contexte

SPEC-714 s'appuie sur le moteur de SPEC-711, la sélection de SPEC-410 et l'application FSRS de SPEC-411. Les réglages déjà stockés par le déclencheur d'identité utilisent questionCount et yesterday_and_prerequisites, le suivi du créneau doit déplacer un effet depuis run comme ADR-0322 l'a fait pour reprise, et le quiz global du soir peut ne pas encore exister au moment de la réponse À revoir.

## Décision

1) EchauffementParams accepte les alias questionCount et yesterday_and_prerequisites et n'émet que count et scope. 2) run déplace ou expire le créneau d'échauffement aux ticks 7-22, sans appliquer d'effet au-delà de cette règle d'agenda. 3) Une notion À revoir est insérée en tête de la session du jour non commencée ; sans session elle est due aujourd'hui pour entrer dans la session à sa création ; session commencée, elle est due au lendemain local. 4) L'explication consommée et le texte de suite utilisent le payload (knewCount, reviewNotionLabels, reviewRemaining). 5) Le jeu de démonstration reçoit les trois questions et la ligne 13:50 de la maquette.

## Conséquences

Les tests d'intégration exécutent runAutomation et answerWarmup directement ; aucune colonne nouvelle ; le contrat DTO expose reviewRemaining en champ optionnel pour le texte de suite.
