# ADR-0113 — Compléments au modèle de données et contraintes

- **Statut** : Acceptée
- **Origine** : Déduite (décision déjà référencée par SPEC-101 à SPEC-105, consignée pour rendre le référentiel cohérent)
- **Date** : 2026-11-11
- **Liens** : SPEC-101, SPEC-102, SPEC-103, SPEC-104, SPEC-105

## Contexte

`docs/architecture/data-model.md` fixe les entités principales. Les spécifications P1 précisent les colonnes nécessaires à l'isolation RLS, à la recherche sans jointure excessive, à la version des cours et aux contraintes SQL. Ces précisions étaient déjà citées comme ADR-0113 dans les spécifications mais le fichier de décision manquait.

## Décision

1. Les tables de domaine peuvent ajouter des colonnes de propriétaire, formation et chapitre lorsque cela permet une politique RLS directe et un filtrage indexable ; les clés étrangères composites garantissent que ces identifiants désignent le même objet parent. Les ajouts précis sont ceux de SPEC-102 §6, SPEC-103 §6, SPEC-104 §6 et SPEC-105 §6 ; ils ne modifient pas l'appartenance personnelle des données.
2. `profiles` porte `streak_days` et `streak_computed_on` pour la vue de progression de groupe ; les tables modifiées portent `updated_at` quand une mise à jour est observable. Les colonnes d'abonnement push `p256dh` et `auth` sont obligatoires.
3. `chapters.formation_id`, `resource_chunks.formation_id`/`chapter_id`, `courses.formation_id`, `course_sections.owner_id`, `citations.owner_id`, `tutor_messages.user_id` et `chapter_summaries.course_id` rendent explicite le périmètre de lecture. `course_section_revisions` conserve les modifications sans écraser la version précédente. `citations.media_kind` est une énumération et `citations.label` est obligatoire.
4. Les contraintes de cohérence interdisent une pause sans intervalle valable, une suppression de compte contradictoire, les liens de prérequis cycliques et les positions dupliquées. Les liens de confusion utilisent un ordre canonique des identifiants. Les valeurs facultatives en unicité utilisent `NULLS NOT DISTINCT` quand deux absences auraient autrement contourné la contrainte.
5. Les valeurs métier par défaut suivent `business-rules.md` et `packages/config/src/product.ts`. `course_language` vaut `fr` si aucun profil ne fournit une langue ; le service de création copie ensuite la langue du profil.
6. Les passages vectoriels utilisent HNSW avec `m=16` et `ef_construction=64`. Une ressource supprimée logiquement conserve son identité pour les citations historiques, mais son contenu et ses passages sensibles sont effacés selon SPEC-104.

## Conséquences

Les migrations et le schéma Drizzle restent alignés ; chaque colonne de périmètre est vérifiée par une contrainte ou un test RLS. Les vues et index peuvent filtrer directement par utilisateur/formation. Les migrations déjà fusionnées ne sont jamais modifiées.
