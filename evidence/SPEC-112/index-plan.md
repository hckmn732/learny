# Plan d’index de la recherche privée (SPEC-112, ET-3)

- Date de capture : 2026-11-11T12:20:00Z (horloge figée, ADR-0047)
- Jeu de données : 1 formation, 1 module, 1 chapitre, 300 notions, dans une transaction annulée
- Réglage : `set local enable_seqscan = off` pour rendre le choix d’index visible sur un petit volume
- Aucun temps absolu n’est enregistré : seul l’arbre de plan est capturé.

## Correspondance FTS `simple` + `unaccent`

```text
Bitmap Heap Scan on notions n
  Recheck Cond: (to_tsvector('simple'::regconfig, immutable_unaccent(((label || ' '::text) || COALESCE(short_definition, ''::text)))) @@ '''tresorerie'''::tsquery)
  ->  Bitmap Index Scan on notions_fts_idx
        Index Cond: (to_tsvector('simple'::regconfig, immutable_unaccent(((label || ' '::text) || COALESCE(short_definition, ''::text)))) @@ '''tresorerie'''::tsquery)
```

## Correspondance trigramme (faute `tresoriere`)

```text
Bitmap Heap Scan on notions n
  Recheck Cond: (immutable_unaccent(label) % 'tresoriere'::text)
  ->  Bitmap Index Scan on notions_search_label_trgm_idx
        Index Cond: (immutable_unaccent(label) % 'tresoriere'::text)
```

