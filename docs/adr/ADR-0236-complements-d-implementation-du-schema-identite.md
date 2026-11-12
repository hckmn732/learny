# ADR-0236 — Compléments d'implémentation du schéma identité

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-102

## Contexte

SPEC-102 crée des tables dont une clé étrangère pointe vers auth.users, schéma possédé par Supabase Auth et absent du snapshot Drizzle ; d'autre part la RLS est activée sans politique avant SPEC-113, si bien qu'aucune ligne de profil n'est accessible au rôle authenticated pour vérifier le refus de modification de l'e-mail (CL-9).

## Décision

1) La clé étrangère profiles.id → auth.users(id) on delete cascade, non exprimable dans le snapshot Drizzle, est déclarée dans la migration personnalisée identity_triggers ; elle garantit la suppression en cascade de EF-4. 2) Le test de CL-9 crée, dans la transaction toujours annulée de withRollback, des politiques SELECT et UPDATE limitées à auth.uid(), exécute la modification sous le rôle authenticated pour atteindre le déclencheur validate_profile, puis supprime ces politiques ; aucune politique ne subsiste après le test et CA-7 continue de vérifier qu'il n'en existe aucune. 3) Le rejeu du déclencheur (CL-7) est vérifié en attachant handle_new_user à une table temporaire portant l'identifiant d'un utilisateur existant : les insertions on conflict do nothing ne créent aucun doublon.

## Conséquences

Le schéma reste conforme à ET-2 ; les preuves RLS ne sont pas simulées et l'ajout des politiques définitives reste entièrement dévolu à SPEC-113.
