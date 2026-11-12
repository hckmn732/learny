-- Contraintes, RLS, index de recherche et fonction privée de SPEC-112
-- (ET-2 à ET-6, EF-5 à EF-7 ; ADR-0062, ADR-0112, ADR-0120, ADR-0219, ADR-0247).
-- Migration personnalisée appliquée après la migration générée `privacy_search` :
--   * RLS sur les quatre tables ; exports et acceptations en lecture propriétaire, clés
--     d'idempotence et seaux de débit réservés au rôle service de l'API ;
--   * politiques de lecture minimales sur les tables sources de la recherche, indispensables pour
--     que `security invoker` fonctionne avant la matrice complète de SPEC-113 ;
--   * index GIN FTS (`simple` + `unaccent`) et trigrammes sur formations, notions et sections ;
--   * `search_snippet` (texte brut borné, sans balise) et `search_user_content` (security invoker).
-- Ne jamais modifier après fusion : ajouter une migration.

alter table public.data_exports enable row level security;
alter table public.legal_acceptances enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.rate_limits enable row level security;

-- EF-1, ET-5 — l'apprenant lit ses propres exports ; le job d'export (service) les crée et les met
-- à jour. Un export expiré reste visible pour l'audit (CL-2).
create policy data_exports_owner_select on public.data_exports
  for select to authenticated
  using (user_id = (select auth.uid()));

-- EF-2, ET-5 — l'historique est lisible par son propriétaire et une nouvelle acceptation est
-- insérée par lui ; aucune politique de mise à jour ni de suppression n'existe : l'historique ne se
-- réécrit pas (CL-1).
create policy legal_acceptances_owner_select on public.legal_acceptances
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy legal_acceptances_owner_insert on public.legal_acceptances
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- EF-3, ET-5 — les clés d'idempotence ne sont jamais exposées au client : le wrapper d'API les
-- manipule avec le rôle service, qui contourne la RLS. Sans politique `authenticated`, une lecture
-- ou une écriture directe renvoie zéro ligne ou échoue avec 42501.

-- EF-4, ET-5 — les seaux de débit sont réservés au service de limitation (SPEC-208). Aucune
-- politique n'est créée : un client ne peut ni les lire ni les modifier.

-- ET-2, ET-6 — `search_user_content` est `security invoker` : les branches de recherche sont
-- filtrées par `owner_id` et s'appuient sur les politiques de lecture des tables sources. Ces
-- politiques minimales sont nommées pour ne pas entrer en collision avec la matrice de SPEC-113 ;
-- celle-ci pourra les remplacer ou les compléter sans affaiblir l'isolation par propriétaire.
create policy formations_search_owner_select on public.formations
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy courses_search_owner_select on public.courses
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy course_sections_search_owner_select on public.course_sections
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy notions_search_owner_select on public.notions
  for select to authenticated
  using (
    exists (
      select 1
      from public.formations f
      where f.id = notions.formation_id
        and f.owner_id = (select auth.uid())
    )
  );

-- CL-1 — une acceptation est append-only : une mise à jour directe est refusée. La suppression en
-- cascade du compte reste possible (aucun déclencheur de suppression).
create or replace function public.reject_legal_acceptance_update() returns trigger
  language plpgsql
  set search_path = ''
  as $$
begin
  raise exception using
    errcode = '23514',
    message = 'legal_acceptance_immutable';
end $$;

create trigger legal_acceptances_immutable
  before update on public.legal_acceptances
  for each row execute function public.reject_legal_acceptance_update();

-- ADR-0022 — le seau de débit entretient updated_at par le déclencheur partagé.
create trigger set_updated_at
  before update on public.rate_limits
  for each row execute function public.set_updated_at();

-- ET-3, ADR-0062, ADR-0111 — index FTS et trigrammes des trois sources. L'index FTS des notions
-- existe déjà (`notions_fts_idx`, SPEC-103) et couvre exactement la même expression.
create index formations_search_fts_idx on public.formations
  using gin (
    to_tsvector(
      'simple',
      public.immutable_unaccent(title || ' ' || coalesce(description, ''))
    )
  );

create index formations_search_title_trgm_idx on public.formations
  using gin (public.immutable_unaccent(title) extensions.gin_trgm_ops);

create index notions_search_label_trgm_idx on public.notions
  using gin (public.immutable_unaccent(label) extensions.gin_trgm_ops);

create index notions_search_definition_trgm_idx on public.notions
  using gin (public.immutable_unaccent(coalesce(short_definition, '')) extensions.gin_trgm_ops);

create index course_sections_search_fts_idx on public.course_sections
  using gin (
    to_tsvector(
      'simple',
      public.immutable_unaccent(coalesce(title, '') || ' ' || coalesce(content_md, ''))
    )
  );

create index course_sections_search_title_trgm_idx on public.course_sections
  using gin (public.immutable_unaccent(coalesce(title, '')) extensions.gin_trgm_ops);

-- EF-6, ET-4 — extrait en texte brut : les balises et les caractères de markup sont remplacés par
-- une espace, les blancs sont réduits, le texte est trimé puis borné (160 caractères par défaut,
-- 400 au maximum). Aucun HTML de cours ne sort de la fonction.
create or replace function public.search_snippet(value text, max_length integer default 160)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select left(
    btrim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(coalesce(value, ''), '<[^>]*>', ' ', 'g'),
            '&(#[0-9]+|[a-zA-Z]+);', ' ', 'g'
          ),
          '[<>&]', ' ', 'g'
        ),
        '\s+', ' ', 'g'
      )
    ),
    greatest(0, least(coalesce(max_length, 160), 400))
  )
$$;

-- EF-5, EF-6, ET-2, ET-4 — recherche privée sur les formations, notions et sections du cours
-- courant. Le terme est un paramètre lié, normalisé, trimé et borné à 100 caractères ; `limit_count`
-- est borné entre 1 et 100. Une requête vide ne renvoie aucune ligne. Les cours non courants et les
-- sections signalées sont exclus (CL-7). Le classement combine `ts_rank` et la similarité trigramme,
-- puis l'identifiant assure un ordre stable.
create or replace function public.search_user_content(q text, limit_count integer default 20)
returns table (
  kind text,
  id uuid,
  title text,
  snippet text,
  href text,
  rank real
)
language sql
stable
security invoker
set search_path = ''
as $$
with params as (
  select
    left(
      btrim(regexp_replace(public.immutable_unaccent(coalesce(q, '')), '\s+', ' ', 'g')),
      100
    ) as term,
    greatest(1, least(coalesce(limit_count, 20), 100)) as lim
),
search as (
  select term, lim, plainto_tsquery('simple', term) as tsq
  from params
  where term <> ''
),
formations_hits as (
  select
    'formation'::text as kind,
    f.id,
    f.title,
    public.search_snippet(f.description, 160) as snippet,
    '/formations/' || f.id::text as href,
    (
      ts_rank(
        to_tsvector(
          'simple',
          public.immutable_unaccent(f.title || ' ' || coalesce(f.description, ''))
        ),
        search.tsq
      )
      + extensions.similarity(public.immutable_unaccent(f.title), search.term)
    )::real as rank
  from public.formations f
  cross join search
  where f.owner_id = (select auth.uid())
    and (
      to_tsvector(
        'simple',
        public.immutable_unaccent(f.title || ' ' || coalesce(f.description, ''))
      ) @@ search.tsq
      or extensions.word_similarity(
        search.term,
        public.immutable_unaccent(f.title || ' ' || coalesce(f.description, ''))
      ) >= 0.45
    )
),
notions_hits as (
  select
    'notion'::text as kind,
    n.id,
    n.label as title,
    public.search_snippet(n.short_definition, 160) as snippet,
    '/formations/' || n.formation_id::text || '/programme#notion-' || n.id::text as href,
    (
      ts_rank(
        to_tsvector(
          'simple',
          public.immutable_unaccent(n.label || ' ' || coalesce(n.short_definition, ''))
        ),
        search.tsq
      )
      + extensions.similarity(public.immutable_unaccent(n.label), search.term)
    )::real as rank
  from public.notions n
  join public.formations f on f.id = n.formation_id
  cross join search
  where f.owner_id = (select auth.uid())
    and (
      to_tsvector(
        'simple',
        public.immutable_unaccent(n.label || ' ' || coalesce(n.short_definition, ''))
      ) @@ search.tsq
      or extensions.word_similarity(
        search.term,
        public.immutable_unaccent(n.label || ' ' || coalesce(n.short_definition, ''))
      ) >= 0.45
    )
),
sections_hits as (
  select
    'section'::text as kind,
    s.id,
    coalesce(s.title, 'Section de cours') as title,
    public.search_snippet(s.content_md, 160) as snippet,
    '/formations/' || c.formation_id::text
      || '/modules/' || c.module_id::text
      || '/cours?chapitre=' || s.chapter_id::text as href,
    (
      ts_rank(
        to_tsvector(
          'simple',
          public.immutable_unaccent(coalesce(s.title, '') || ' ' || coalesce(s.content_md, ''))
        ),
        search.tsq
      )
      + extensions.similarity(
        public.immutable_unaccent(coalesce(s.title, '')),
        search.term
      )
    )::real as rank
  from public.course_sections s
  join public.courses c on c.id = s.course_id
  cross join search
  where c.owner_id = (select auth.uid())
    and c.is_current
    and not s.reported
    and (
      to_tsvector(
        'simple',
        public.immutable_unaccent(coalesce(s.title, '') || ' ' || coalesce(s.content_md, ''))
      ) @@ search.tsq
      or extensions.word_similarity(
        search.term,
        public.immutable_unaccent(coalesce(s.title, '') || ' ' || coalesce(s.content_md, ''))
      ) >= 0.45
    )
)
select hits.kind, hits.id, hits.title, hits.snippet, hits.href, hits.rank
from (
  select * from formations_hits
  union all
  select * from notions_hits
  union all
  select * from sections_hits
) hits
order by hits.rank desc, hits.kind asc, hits.id asc
limit coalesce((select lim from search), 0)
$$;

-- ET-2 — les fonctions ne sont exposées qu'aux utilisateurs authentifiés ; le schéma des extensions
-- doit être utilisable pour que `unaccent` et `pg_trgm` fonctionnent sous ce rôle.
grant usage on schema extensions to authenticated;

revoke all on function public.search_snippet(text, integer) from public, anon;
revoke all on function public.search_user_content(text, integer) from public, anon;
grant execute on function public.search_snippet(text, integer) to authenticated;
grant execute on function public.search_user_content(text, integer) to authenticated;
revoke execute on function public.reject_legal_acceptance_update() from public, anon, authenticated;
