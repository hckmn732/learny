# ADR-0288 — Contrats d'implémentation des services de persistance du moteur

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-411, ADR-0112, ADR-0149, ADR-0242, SPEC-203

## Contexte

SPEC-411 doit écrire review_logs et gap_events dans une transaction userDb (ET-1, ET-4) alors qu'ADR-0112 §4 et ADR-0242 réservent ces journaux aux écritures du rôle service. ADR-0149 impose l'index unique partiel review_logs(answer_id, notion_id) et la colonne schedule_slots.planner_key, sans préciser comment les écritures authentifiées atteignent les journaux. Le catalogue d'événements de SPEC-203 ne contient pas gap/nature-changed alors que EF-2 l'exige. Le mode démonstration doit exécuter le service réel sur des données isolées.

## Décision

Les journaux review_logs et gap_events sont écrits par deux fonctions security definer append_review_log et append_gap_event, exécutables par authenticated : elles vérifient auth.uid() = user_id et l'existence de l'état de notion du même propriétaire, puis insèrent dans la transaction userDb ; aucune politique d'écriture directe n'est ajoutée (ADR-0112 §4 préservé). L'idempotence d'une tentative s'appuie sur l'index unique partiel (answer_id, notion_id) et sur un verrou consultatif learning:<user_id> puis select ... for update de la tentative et des états. persistPlan verrouille planner:<user_id>, rapproche les créneaux par planner_key et annule seulement les créneaux futurs planned du planificateur absents du nouveau plan ; done, missed, moved, cancelled et les créneaux learner/automation sont conservés. La clé de plan stable est le slotId du moteur, revisionKey est validée et journalisée dans le résumé. Le catalogue gagne gap/nature-changed (userId, formationId, notionId, nature, previousNature) car EF-2 le nomme ; il est émis par l'outbox après commit comme gap/detected et gap/cleared. Les DTO sont validés par packages/contracts et la démonstration crée des données avec serviceDb, exécute le service réel via createServiceContext puis supprime le compte.

## Conséquences

Deux migrations : schedule_slots.planner_key (colonne et index unique partiel) puis learning_persistence (index unique partiel de review_logs et fonctions d'ajout). Les tests d'intégration prouvent rollback, concurrence, RLS et conservation des créneaux manuels ou terminés ; la page SDD montre le résumé transactionnel réel et un second appel idempotent.
