# ADR-0152 — Variantes de présentation des briques

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-503

## Contexte

Les maquettes présentent la même brique de deux façons selon l'écran : l'association est une liste de menus déroulants dans `Quiz.dc.html` et des tuiles à relier dans `QuizGlobal.dc.html` ; la question à choix est une grille de deux colonnes avec correction immédiate dans `Quiz.dc.html` et une colonne sans correction dans `ExamenBlanc.dc.html`.

## Décision

Chaque vue de brique (`view.tsx`) reçoit une prop `variant` : `quiz` (quiz de validation, remédiation, auto-test : correction immédiate, grille 2 colonnes pour le choix, menus déroulants pour l'association), `game` (quiz global, échauffement, micro-séance, sprint : tuiles, boutons « Vérifier »/« Recommencer » internes aux jeux), `exam` (examen blanc : une colonne, aucune correction avant la fin, marquage géré par l'écran), `review` (revue après correction : lecture seule avec correction), `course` (texte et extraits dans un cours), `exercise` (consigne). Les vues sont contrôlées : l'état de la réponse et la correction viennent de l'écran appelant ; la vue n'appelle jamais l'API. Couleurs d'états : sélection `#111113`/`#F4F4F1`, juste `#14A38B`/`#E1F4EF`/`#0B5C4D`, faux `#F97316`/`#FFEDE0`/`#8F3305` ; extraits colorés par type d'apport (PDF `#FFEDE0`/`#A13A06`, audio `#F0E9FE`/`#5B21B6`, vidéo et YouTube `#ECECFC`/`#2E2E8F`, web `#E1F4EF`/`#0B5C4D`, note `#F1FBD3`/`#3D5200`, image `#F4F4F1`/`#3F3F46`).

## Conséquences

Les écrans de P6/P7 composent les vues sans redéfinir de styles ; la galerie `/_dev/bricks` montre chaque type dans chaque variante pertinente et chaque état.
