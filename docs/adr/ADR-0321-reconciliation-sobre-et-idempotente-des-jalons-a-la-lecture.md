# ADR-0321 — Réconciliation sobre et idempotente des jalons à la lecture

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-14
- **Liens** : SPEC-723, SPEC-409, SPEC-209, SPEC-304, ADR-0281, BR-GAM-02, BR-GAM-03

## Contexte

SPEC-409 détecte les jalons (`module_validated`, `notions_100`, `streak_30`) et SPEC-723 doit
afficher la série, les 14 cases de régularité et les jalons réellement acquis. La table
`milestones` est en lecture seule pour le rôle authentifié et le catalogue d'événements ne contient
pas encore de producteur dédié aux seuils « 100 notions » et « 30 jours ». Sans point d'entrée
explicite, ces deux jalons pourraient être calculés par l'interface ou ne jamais être enregistrés,
ce qui violerait BR-GAM-03 et le principe « aucune preuve inventée ».

## Décision

`GET /api/v1/milestones` réconcilie les jalons du seul apprenant connecté avant de rendre sa liste :
le service lit `daily_activity`, les modules validés, la maîtrise des notions et les clés déjà
présentes sous RLS, appelle le moteur pur `detectMilestones` de SPEC-409, puis insère les seules
lignes manquantes avec le client propriétaire dans une transaction. La contrainte unique
`(user_id, key, ref_id)` rend deux lectures concurrentes idempotentes et la notification SPEC-209
n'est émise qu'après le commit, avec la clé stable `milestone:<key>`. Les jalons de module restent
notifiés par le service de validation de module (SPEC-612) ; la réconciliation ne double jamais cet
envoi. `GET /api/v1/streak` reste une lecture pure.

La régularité réutilise le schéma `StreakDay` de SPEC-304 (`done`, `none`, `neutral`) plutôt que
d'inventer une seconde sémantique d'état : les deux blocs décrivent les mêmes 14 jours civils
locaux. Aucun champ, libellé ou ordre ne compare deux apprenants.

## Conséquences

Ouvrir la liste des jalons peut écrire des lignes de jalons et une notification, une seule fois par
seuil ; les tests d'intégration prouvent l'idempotence séquentielle et concurrente. Une future
spécification peut remplacer cette réconciliation par un consommateur d'événement sans changer les
contrats publics : le service expose `reconcileMilestones` et les DTO gardent la même forme.
