# ADR-0248 — Politiques RLS de SPEC-113 et harnais d'isolation

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-113

## Contexte

Les migrations SPEC-102 à 112 activaient RLS sans politiques sur plusieurs tables personnelles, et les tables de programme n'avaient qu'une lecture propriétaire. SPEC-113 doit prouver l'isolation de chaque table pour A propriétaire, B membre et C non-membre.

## Décision

Compléter les politiques par une migration additive 0026_rls_policies.sql : politiques propriétaire avec WITH CHECK, lecture partagée du programme via is_formation_member, écriture réservée à is_formation_owner, liens personnels privés, FORCE RLS sur toutes les tables, helpers security definer au search_path fixé et EXECUTE limité. La matrice RLS de packages/db/src/rls/matrix.ts est l'inventaire unique confronté à pg_catalog par le test d'intégration ; les tests d'isolation utilisent uniquement des JWT utilisateur via asUser.

## Conséquences

Toute table publique future sans entrée de matrice fait échouer l'intégration ; les politiques permissives USING(true) sans justification font échouer le test unitaire.
