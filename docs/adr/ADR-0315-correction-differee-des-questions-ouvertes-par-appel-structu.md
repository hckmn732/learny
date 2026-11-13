# ADR-0315 — Correction différée des questions ouvertes par appel structuré

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-13
- **Liens** : SPEC-611,SPEC-508,ADR-0017,ADR-0170

## Contexte

SPEC-611 ET-8 décrit un appel tutor.run puis l'action grade_answer. La fixture simulée d'un appel d'outil porte une entrée statique, alors que la note dépend de chaque réponse et doit être bornée par le barème de la question.

## Décision

La correction d'une ouverte est un appel structuré llm.session de tâche tutor avec la consigne versionnée tutor.grade-open et un schéma OpenGrade borné [0,1]. Le service multiplie la réussite par max_score, borne la note, marque graded_by=tutor et conserve criteria/missing/offTopic. Trois reprises couvrent AI_UNAVAILABLE et INVALID_OUTPUT ; au-delà la tentative reste submitted et une notification ai_task_failed est créée.

## Conséquences

Les fixtures grade-open-good/partial/offtopic restent déterministes et ne dépendent pas d'un identifiant d'outil. Les écritures restent dans le service quiz et l'événement quiz/graded n'est émis qu'après application du résultat d'apprentissage.
