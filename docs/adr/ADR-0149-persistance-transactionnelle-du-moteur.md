# ADR-0149 — Persistance transactionnelle du moteur

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-411

## Contexte

Les résultats du moteur touchent plusieurs tables ; des réponses peuvent arriver simultanément (deux onglets, file hors ligne) et les jobs Inngest peuvent être rejoués.

## Décision

1. Une application de résultats = une transaction : verrou consultatif transactionnel par utilisateur (`pg_advisory_xact_lock(hashtextextended('learning:' || user_id, 0))`) puis `select … for update` des lignes `notion_states` concernées.
2. Idempotence : index unique partiel `review_logs(answer_id, notion_id) where answer_id is not null` ; une réponse déjà journalisée n'est jamais réappliquée.
3. Planification : verrou consultatif `planner:<user_id>` ; rapprochement par la colonne ajoutée `schedule_slots.planner_key` (index unique partiel `(user_id, planner_key) where status = 'planned'`) : créneaux absents du nouveau plan → `cancelled` ; nouveaux → insérés ; modifiés → mis à jour. Les créneaux `done`, `missed`, `moved` et ceux créés par l'apprenant ne sont jamais modifiés par le planificateur.
4. Les événements `gap/detected` et `gap/cleared` sont émis après validation de la transaction (helper de SPEC-203).

## Conséquences

Deux migrations additionnelles (index de `review_logs`, colonne `planner_key`) sont livrées par SPEC-411.
