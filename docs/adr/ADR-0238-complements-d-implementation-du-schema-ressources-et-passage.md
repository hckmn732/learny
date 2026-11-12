# ADR-0238 — Compléments d'implémentation du schéma ressources et passages vectoriels

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-104, ADR-0056, ADR-0039, ADR-0112, ADR-0113

## Contexte

SPEC-104 fixe les tables resources/resource_chunks, l'index HNSW et les limites codées. Quatre points restaient ouverts : la section 9 cite une page dédiée alors que le dépôt route les démonstrations par le registre de SPEC-006 ; drizzle-kit génère vector(1024) non qualifié alors que l'extension vit dans le schéma extensions ; le planificateur peut servir une recherche filtrée par btree et tri plutôt que par HNSW ; les contraintes CHECK ne portent pas le code d'erreur exigé par EF-3 et la preuve CL-4 exige deux transactions réelles.

## Décision

1. La page est livrée par le registre apps/web/app/%5Fdev/sdd/registry.ts, le composant components/sdd-demos/spec-104.tsx et la source spec-104-data.ts, servis par la route dynamique gardée ; URL identique /_dev/sdd/SPEC-104. 2. La migration générée est qualifiée extensions.vector(1024), la dimension venant de EMBEDDING_DIM de @learny/config ; l'index HNSW utilise extensions.vector_cosine_ops avec m=16 et ef_construction=64. 3. Le déclencheur resources_enforce_limits lève les codes resource_pdf_limit, resource_image_limit, chapter_resource_limit et storage_quota_exceeded avant les CHECK, conservés en défense en profondeur ; le verrou consultatif porte sur le propriétaire (hashtextextended(owner_id::text, 104)). 4. La preuve HNSW exécute une recherche filtrée par owner_id avec hnsw.ef_search=40, enable_seqscan/enable_sort/enable_bitmapscan désactivés localement, et mesure EXPLAIN ANALYZE sous 50 ms ; CL-4 utilise deux transactions réelles hors withRollback puis supprime l'utilisateur. 5. fakeEmbedding dérive 1024 composantes de blocs SHA-256, les ramène dans [-1,1] et les normalise en norme L2 ; SPEC-509 réutilise la même règle en mode mock.

## Conséquences

La démonstration reste centralisée et n'ajoute aucune route ; la qualification `extensions.vector` rend la migration indépendante du `search_path` ; les refus portent un code stable pour l'interface et les services ; la preuve HNSW démontre l'index réellement utilisé sur le filtre propriétaire. `fakeEmbedding` devient la règle partagée de l'ingestion et de la recherche en mode `mock`.
