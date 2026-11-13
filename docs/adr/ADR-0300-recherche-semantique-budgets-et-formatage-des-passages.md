# ADR-0300 — Recherche sémantique : budgets, déduplication et formatage des passages

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-13
- **Liens** : SPEC-511, ADR-0056, ADR-0023, ADR-0048, ADR-0238

## Contexte

SPEC-511 demande une recherche cosinus filtrée par propriétaire, formation et chapitre, une
sélection sous budget de jetons par tâche, une déduplication de passages qui se chevauchent et un
formatage en balises de données. Le référentiel fixe les budgets (programme 6 000, cours 24 000,
lacunes 8 000, tuteur 4 000) et la balise `<document source="…" chunk="…">`, mais laisse ouvertes
plusieurs décisions d'implémentation : où vivent les contrats et les budgets, quelle unité de coût
réserver, à partir de quel chevauchement deux passages sont identiques, et comment expliquer une
liste vide.

## Décision

1. Les contrats et les constantes de la recherche vivent dans `packages/contracts/src/retrieval.ts`
   et les fonctions dans `packages/ingestion/src/retrieval/`. `@learny/ingestion` ne dépend ni de
   `@learny/services` ni de `@learny/jobs` ; l'accès aux données lui est injecté sous la forme d'un
   client utilisateur (`UserDatabase`) et d'un `userId`, sans importer le contexte de service.
2. La requête est paramétrée, filtre explicitement par `owner_id`, `formation_id` et, si fourni,
   `chapter_id`, et s'exécute sous RLS avec le client utilisateur. `hnsw.ef_search = 40` est réglé
   dans la transaction (ADR-0238). Un identifiant étranger ne produit aucune ligne.
3. Les budgets de `docs/architecture/ai.md` §3 sont centralisés dans `RETRIEVAL_TOKEN_BUDGETS`. Le
   coût d'un passage est estimé sur la **balise complète** (attributs, identifiant et séparateur),
   avec `estimateTokens` de `@learny/llm` ; un passage est ajouté entièrement ou omis, jamais
   tronqué. `estimatedTokens` est la somme des coûts réservés et ne dépasse jamais le budget.
4. Deux passages sont dédupliqués quand leur chevauchement normalisé (NFKC, minuscules, espaces
   réduits, 5-grammes de caractères, ratio sur le plus petit passage) atteint `0.8`. Le tri est
   total : score décroissant, source, position puis `chunkId`. Le résultat est donc identique à
   entrées permutées.
5. Le texte et les attributs sont échappés (`&`, `<`, `>`, guillemets, apostrophes) avant de
   construire la balise. La balise n'est produite que par `formatDocumentChunk`, qui valide
   l'identifiant UUID du passage. Une fermeture `</document>` présente dans un apport devient
   `&lt;/document&gt;` et reste une donnée (ADR-0023, BR-IA-10).
6. Une recherche vide rend `{ reason: 'no_matches', chunks: [] }`. Une sélection dont aucun
   passage ne tient dans le budget rend `reason: 'budget_exhausted'` avec une liste vide. Les
   appelants décident s'ils poursuivent sans source. La recherche est une lecture idempotente :
   aucune écriture, aucun appel fournisseur, aucune bascule payante automatique.
7. Les erreurs de base deviennent `SERVICE_UNAVAILABLE` avec un message sûr ; ni le texte de
   requête, ni le contenu des passages, ni un secret ne sont journalisés. Les tests et la
   démonstration utilisent `fakeEmbedding` en `LLM_MODE=mock` (ADR-0048, ADR-0056).

## Conséquences

SPEC-513, SPEC-608, SPEC-610 et SPEC-903 peuvent réutiliser `searchRelevantChunks`,
`selectContext`, `formatDocumentChunk` et `RETRIEVAL_TOKEN_BUDGETS` sans dupliquer les budgets ni
le formatage. Les embeddings de requête restent fournis par l'appelant : SPEC-511 ne crée aucun
client d'embeddings supplémentaire. La valeur `0.8` de déduplication et le mode de comptage sont
désormais normatifs pour les spécifications suivantes.
