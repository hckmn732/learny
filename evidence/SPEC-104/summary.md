# Preuves — SPEC-104 : Schéma ressources et passages vectoriels

- Date : 2026-11-12T02:00:17.186Z
- Commit : 7832ab6
- Spécification : `specs/p1-donnees/SPEC-104-schema-ressources-et-passages-vectoriels.md`

## Rapports

- `unit.json`
- `integration.json`
- `e2e.json`
- `e2e.xml`
- `checks.json` (résultat des validations), `acceptance.md` (critères d'acceptation)

## Vidéos

- `video/04-apports-passages-et-recherche-vectorielle-desktop.webm` — SHA-256 41e3e352af908b932761777f472ef54f77cf0a6c1aaa9cb1e51db47a47805155 (hors Git : Git LFS indisponible, ADR-0050)
- `video/05-apports-passages-et-recherche-vectorielle-desktop.webm` — SHA-256 2698b35ff9432528303667ef4281150e7d59b22a88f61df13fd5537d6d5f90f4 (hors Git : Git LFS indisponible, ADR-0050)
- `video/09-page-ressources-conforme-desktop.webm` — SHA-256 a74440c4f8704c99680b902dcf48253a6e6f7540df0dbc8024a1f5dd336f9130 (hors Git : Git LFS indisponible, ADR-0050)
- `video/10-page-ressources-conforme-desktop.webm` — SHA-256 574ada821e0c2411e1cf82ef166efdc5d0b798c9179a6b6f29dd685b8c130251 (hors Git : Git LFS indisponible, ADR-0050)

## Captures

- `screenshots/` : 3 capture(s) finale(s) des tests
- `visual/` : 0 comparaison(s) maquette ↔ application et diff


## Performance vectorielle (ET-5, CA-5)

Mesure réelle sur la base locale après `pnpm db:reset` : 5 000 passages déterministes d'un même
utilisateur, `hnsw.ef_search = 40`, `enable_seqscan`, `enable_sort` et `enable_bitmapscan`
désactivés localement pour démontrer l'index, 50 exécutions de
`select … where owner_id = $1 order by embedding <=> $2 limit 8` sous `EXPLAIN (ANALYZE, FORMAT JSON)`.
Les 8 voisins sont renvoyés à chaque exécution.

Latence serveur mesurée (50 exécutions) : p50 0.100 ms, p95 0.141 ms,
maximum 0.168 ms — sous la limite de 50 ms.

Plan `EXPLAIN (ANALYZE, FORMAT TEXT)` (vecteur de requête remplacé par `$1` pour la lisibilité) :

```
Limit  (cost=452.64..1894.47 rows=8 width=48) (actual time=0.073..0.126 rows=8 loops=1)
  ->  Index Scan using resource_chunks_embedding_hnsw_idx on resource_chunks  (cost=452.64..9283.85 rows=49 width=48) (actual time=0.072..0.125 rows=8 loops=1)
        Order By: (embedding <=> $1::vector)
        Filter: (owner_id = $2::uuid)
Planning Time: 0.085 ms
Execution Time: 0.170 ms
```
