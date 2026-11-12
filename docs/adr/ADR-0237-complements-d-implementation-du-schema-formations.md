# ADR-0237 — Compléments d'implémentation du schéma formations

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-103, SPEC-006, ADR-0049, ADR-0113

## Contexte

SPEC-103 fixe les tables, contraintes et preuves du programme. Trois points restaient ouverts à l'implémentation : (1) la section 9 cite apps/web/app/_dev/sdd/SPEC-103/page.tsx alors que le dépôt route déjà les démonstrations par le registre de SPEC-006 (dossier %5Fdev, route dynamique [specId]) ; (2) la section ET-5 borne les tableaux de studyOverrideSchema sans exiger l'unicité des jours et des créneaux ; (3) la preuve EXPLAIN de l'index FTS peut être détournée par un filtre formation_id, que le planificateur sert avec notions_formation_id_idx.

## Décision

1. La page est livrée comme les pages SPEC-101/SPEC-102 : entrée dans apps/web/app/%5Fdev/sdd/registry.ts, composant apps/web/components/sdd-demos/spec-103.tsx et source de données apps/web/app/%5Fdev/sdd/spec-103-data.ts, servis par la route dynamique gardée de SPEC-006. URL identique /_dev/sdd/SPEC-103 ; aucune route dédiée n'est dupliquée. 2. Les schémas Zod JSON sont stricts (clés inconnues refusées) et appliquent littéralement les bornes d'ET-5 ; l'unicité des jours d'étude et des créneaux reste garantie par les contraintes de study_preferences et par les services, pas par le schéma de study_override. 3. La preuve FTS exécute une recherche globale sans prédicat formation_id, avec set local enable_seqscan = off, pour démontrer l'usage de l'expression notions_fts_idx ; une recherche filtrée par formation peut légitimement choisir notions_formation_id_idx. La fabrique createTestProgramme reste uniforme ; le test de performance construit 7×4×2 puis retire quatre chapitres pour atteindre exactement 7 modules, 24 chapitres et 48 notions.

## Conséquences

Les pages de démonstration restent centralisées et la preuve d'index ne dépend pas du planificateur ; les schémas de contrat de SPEC-201 réutilisent les mêmes bornes. Les contrôles de cohérence métier (unicité des jours, ordre canonique, cycles) restent dans les contraintes et les services.
