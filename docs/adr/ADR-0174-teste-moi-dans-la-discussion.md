# ADR-0174 — « Teste-moi » dans la discussion avec le tuteur

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-610

## Contexte

BR-TUT-04 : la réponse au « Teste-moi » est corrigée, met à jour la maîtrise, et une erreur place la notion dans le prochain quiz global. Il faut fixer la forme de la question, le correcteur et les écritures.

## Décision

1. La question est une `open_question` courte générée par la tâche `tutor` (action `create_or_update`, `purpose='review'`) sur la notion cible : lacune suivie si l'élément « Lacune suivie » est inclus, sinon notion du passage, sinon première notion du chapitre. Elle est enveloppée dans une activité `self_test` d'une brique ; `tutor_messages.self_test = { activityId, brickVersionId, notionId, status: 'pending' | 'answered' }`.
2. La réponse (`POST /conversations/:id/self-test/answer`) est notée par l'action `grade_answer` (score 0..1, juste si ≥ 0,6) puis appliquée par `services.learning.applyResults` avec `review_source='self_test'`.
3. Juste : réponse du tuteur avec la maîtrise avant/après (« … passe de 35 % à 48 % de maîtrise. »). Faux : `notion_states.in_review = true` et `due_at = min(due_at, fin du jour local)`, ce qui place la notion dans le quiz global du jour (ou du lendemain si celui du jour est terminé).
4. Une seule question « Teste-moi » en attente par discussion ; un message libre envoyé pendant l'attente est traité comme la réponse.

## Conséquences

Aucun nouveau type de brique ; fixtures `tutor/self-test-*`.
