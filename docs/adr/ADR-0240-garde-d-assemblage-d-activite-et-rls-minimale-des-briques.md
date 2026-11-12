# ADR-0240 — Garde d'assemblage d'activité et RLS minimale des briques

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-106, SPEC-113, ADR-0021, ADR-0112

## Contexte

SPEC-106 ET-5 demande une fonction transactionnelle assertActivityItemsOwned qui vérifie version, propriétaire, formation et statut avant qu'une activité devienne ready ; ET-6 demande RLS active sans fenêtre de lecture publique ; EF-2 et data-model §5 exigent le statut de signalement open/corrected/dismissed alors que ET-2 n'énumère pas report_status. Le dépôt n'avait encore aucune politique RLS nommée (SPEC-113 les livrera).

## Décision

La fonction SQL assert_activity_items_owned(uuid, uuid, jsonb) est security definer, refuse un appelant authentifié dont p_owner_id diffère de auth.uid() et lève 23514 avec un message distinct (activity_item_version_missing, activity_item_version_mismatch, activity_item_owner_mismatch, activity_item_formation_mismatch, activity_item_status). Un déclencheur before insert or update of status, items, owner_id, formation_id la rejoue pour l'activité ready et refuse une liste vide (activity_items_empty) ; le repository l'appelle avant l'écriture pour qu'aucune ligne partielle ne soit créée. La migration ajoute l'énumération report_status de data-model §5 et six politiques propriétaire for all to authenticated (bricks.owner_id, brick_reports.user_id, activities.owner_id, attempts.user_id, brick_versions et answers par EXISTS sur leur parent), sans lecture publique. La clé étrangère composite (brick_version_id, brick_id) garantit qu'un signalement porte sur la version de sa brique.

## Conséquences

SPEC-113 peut remplacer ces politiques minimales sans changer les noms de tables ; les services appellent le garde dans leur transaction. Une activité draft peut rester vide, une activité ready ne le peut pas. Un signalement d'une version étrangère est refusé par la base et pas seulement par Zod.
