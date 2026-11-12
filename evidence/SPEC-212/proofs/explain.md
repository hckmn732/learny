# Plans de la recherche globale (SPEC-212, ET-6)

Jeu de données : 10 formations, 2000 notions, 500 sections, après ANALYZE.
Aucun temps absolu n’est enregistré ici : seuls les arbres de plan le sont.

## Rôle `authenticated` (RLS appliquée), plan naturel du planificateur

Sous le rôle de l’apprenant, la RLS borne les lignes avant le prédicat de recherche (`owner_id`
pour les sections, `is_formation_owner` / `is_formation_member`, non « leakproof », pour les
notions) : le prédicat reste un filtre et n’est pas poussé dans l’index GIN. Le p95 mesuré à
cette taille est dans `performance.json`.

### Notions, FTS

```text
Seq Scan on notions n
  Filter: ((is_formation_owner(formation_id) OR is_formation_member(formation_id)) AND (to_tsvector('simple'::regconfig, immutable_unaccent(((label || ' '::text) || COALESCE(short_definition, ''::text)))) @@ '''reseau'''::tsquery))
```

### Sections, FTS

```text
Index Scan using course_sections_owner_id_idx on course_sections s
  Index Cond: (owner_id = (InitPlan 1).col1)
  Filter: (to_tsvector('simple'::regconfig, immutable_unaccent(((COALESCE(title, ''::text) || ' '::text) || COALESCE(content_md, ''::text)))) @@ '''reseau'''::tsquery)
  InitPlan 1
    ->  Result
```

### Formations, FTS

```text
Bitmap Heap Scan on formations f
  Recheck Cond: ((owner_id = (InitPlan 1).col1) OR (group_id IS NOT NULL))
  Filter: (((owner_id = (InitPlan 1).col1) OR ((group_id IS NOT NULL) AND is_group_member(group_id))) AND (to_tsvector('simple'::regconfig, immutable_unaccent(((title || ' '::text) || COALESCE(description, ''::text)))) @@ '''reseau'''::tsquery))
  InitPlan 1
    ->  Result
  ->  BitmapOr
        ->  Bitmap Index Scan on formations_owner_status_idx
              Index Cond: (owner_id = (InitPlan 1).col1)
        ->  Bitmap Index Scan on formations_group_id_idx
              Index Cond: (group_id IS NOT NULL)
```

## Index disponibles (rôle propriétaire, `set local enable_seqscan = off`, comme SPEC-112)


### Notions, FTS

```text
Bitmap Heap Scan on notions n
  Recheck Cond: (to_tsvector('simple'::regconfig, immutable_unaccent(((label || ' '::text) || COALESCE(short_definition, ''::text)))) @@ '''reseau'''::tsquery)
  ->  Bitmap Index Scan on notions_fts_idx
        Index Cond: (to_tsvector('simple'::regconfig, immutable_unaccent(((label || ' '::text) || COALESCE(short_definition, ''::text)))) @@ '''reseau'''::tsquery)
```

### Sections, FTS

```text
Bitmap Heap Scan on course_sections s
  Recheck Cond: (to_tsvector('simple'::regconfig, immutable_unaccent(((COALESCE(title, ''::text) || ' '::text) || COALESCE(content_md, ''::text)))) @@ '''reseau'''::tsquery)
  ->  Bitmap Index Scan on course_sections_search_fts_idx
        Index Cond: (to_tsvector('simple'::regconfig, immutable_unaccent(((COALESCE(title, ''::text) || ' '::text) || COALESCE(content_md, ''::text)))) @@ '''reseau'''::tsquery)
```

### Formations, FTS

```text
Bitmap Heap Scan on formations f
  Recheck Cond: (to_tsvector('simple'::regconfig, immutable_unaccent(((title || ' '::text) || COALESCE(description, ''::text)))) @@ '''reseau'''::tsquery)
  ->  Bitmap Index Scan on formations_search_fts_idx
        Index Cond: (to_tsvector('simple'::regconfig, immutable_unaccent(((title || ' '::text) || COALESCE(description, ''::text)))) @@ '''reseau'''::tsquery)
```

### Notions, trigramme (faute « reseua »)

```text
Bitmap Heap Scan on notions n
  Recheck Cond: (immutable_unaccent(label) % 'reseua'::text)
  ->  Bitmap Index Scan on notions_search_label_trgm_idx
        Index Cond: (immutable_unaccent(label) % 'reseua'::text)
```

### Sections, trigramme

```text
Bitmap Heap Scan on course_sections s
  Recheck Cond: (immutable_unaccent(COALESCE(title, ''::text)) % 'reseua'::text)
  ->  Bitmap Index Scan on course_sections_search_title_trgm_idx
        Index Cond: (immutable_unaccent(COALESCE(title, ''::text)) % 'reseua'::text)
```

### Formations, trigramme

```text
Bitmap Heap Scan on formations f
  Recheck Cond: (immutable_unaccent(title) % 'reseua'::text)
  ->  Bitmap Index Scan on formations_search_title_trgm_idx
        Index Cond: (immutable_unaccent(title) % 'reseua'::text)
```
