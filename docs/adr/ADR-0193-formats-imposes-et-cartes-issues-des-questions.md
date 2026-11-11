# ADR-0193 — Formats imposés au quiz global et cartes issues des questions

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-714, SPEC-716, SPEC-717, SPEC-718, SPEC-406

## Contexte

Plusieurs automatismes influencent le format d'une notion dans la session de quiz global : le jeu choisi selon la lacune (automatisme 5), la carte créée à partir d'une question (automatisme 6), la variation des formats (BR-MEM-04). FSRS est tenu par notion (ADR-0025), pas par carte : il faut décider quand une carte issue d'une question est présentée et quel format l'emporte.

## Décision

1. Ordre de priorité du format d'une notion dans une session : (a) jeu imposé par l'automatisme 5 pour une lacune active (confusion → association ou classement opposant les deux notions ; oubli → carte de rappel) ; (b) carte créée par l'automatisme 6 et jamais encore jouée ; (c) variation par défaut de SPEC-406 (jamais deux fois de suite le même format, BR-MEM-04), pondérée par la préférence de l'automatisme 5. Une notion ajoutée par l'échauffement ou par l'annulation du lissage n'impose aucun format.
2. Une carte issue d'une question est une brique `recall_card` (`purpose = 'review'`) rattachée à une seule notion. Si la notion est déjà en révision (`notion_states.in_review = true`), la carte est jouée à la prochaine échéance FSRS de la notion (au plus tôt le lendemain si la session du jour est déjà générée). Sinon la notion entre en révision (`in_review = true`) avec une carte FSRS neuve dont `due_at` = début du jour local J+2.
3. Une carte jouée une fois rend l'action de création `consumed` (elle reste ensuite dans la banque de la notion comme format ordinaire).
4. Le tirage (SPEC-406) reçoit ces contraintes sous forme d'un paramètre `forcedFormats: Record<notionId, { brickId?, format, reason: 'gap_confusion'|'gap_forgetting'|'gap_application'|'question_card' }>` construit par `packages/services` à partir des actions d'automatismes `applied` non consommées.

## Conséquences

Le rail du quiz global affiche la raison du format imposé (« Choisi pour votre oubli », « Choisi pour votre confusion », « Votre question »).
