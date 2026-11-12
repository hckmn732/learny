-- Contraintes, RLS, déclencheurs et index de SPEC-104 (ET-3, ADR-0112, ADR-0113).
-- Migration personnalisée appliquée après la migration générée `resources_chunks` : RLS,
-- index HNSW cosinus, limites codées en base (EF-3), suppression logique (EF-4), cohérence des
-- passages (EF-5, CL-7) et clé étrangère `programme_imports.resource_id` (EF-6).
-- Ne jamais modifier après fusion : ajouter une migration.

-- RLS activée dès la création (ADR-0112) : sans politique, seul le propriétaire (serviceDb)
-- accède aux lignes ; SPEC-113 ajoutera les politiques nommées. `resource_chunks` reste en
-- écriture service.
alter table public.resources enable row level security;
alter table public.resource_chunks enable row level security;

-- updated_at maintenu par la fonction partagée (SPEC-101, EF-5).
create trigger set_updated_at before update on public.resources
  for each row execute function public.set_updated_at();

-- EF-5 / CA-5 : recherche des plus proches voisins par distance cosinus (ADR-0056, ADR-0113).
create index resource_chunks_embedding_hnsw_idx on public.resource_chunks
  using hnsw (embedding extensions.vector_cosine_ops) with (m = 16, ef_construction = 64);

-- EF-6 / CL-10 : l'import de programme garde sa ligne quand la ressource disparaît.
alter table public.programme_imports
  add constraint programme_imports_resource_fk
  foreign key (resource_id) references public.resources (id) on delete set null;

-- EF-3 / CL-1 à CL-4 : limites de BR-APP-02 en défense en profondeur. Le service (SPEC-206) les
-- vérifie d'abord avec un message explicite ; la base refuse avec un code stable. Le verrou
-- consultatif par propriétaire sérialise deux insertions qui franchiraient ensemble le quota
-- (CL-4) et le comptage du chapitre.
create or replace function public.enforce_resource_limits() returns trigger
  language plpgsql
  security definer
  set search_path = ''
  as $$
declare
  v_chapter_count integer;
  v_used_bytes bigint;
begin
  -- Une ressource supprimée logiquement ne consomme plus ni place ni quota (EF-4).
  if new.deleted_at is not null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 104));

  if new.kind = 'pdf'
     and (coalesce(new.size_bytes, 0) > 52428800
          or coalesce((new.metadata ->> 'pages')::int, 0) > 500) then
    raise exception using errcode = '23514', message = 'resource_pdf_limit';
  end if;

  if new.kind = 'image' and coalesce(new.size_bytes, 0) > 10485760 then
    raise exception using errcode = '23514', message = 'resource_image_limit';
  end if;

  if new.chapter_id is not null then
    select count(*) into v_chapter_count
    from public.resources r
    where r.owner_id = new.owner_id
      and r.chapter_id = new.chapter_id
      and r.deleted_at is null
      and r.id <> new.id;

    if v_chapter_count >= 100 then
      raise exception using errcode = '23514', message = 'chapter_resource_limit';
    end if;
  end if;

  if new.size_bytes is not null then
    select coalesce(sum(r.size_bytes), 0) into v_used_bytes
    from public.resources r
    where r.owner_id = new.owner_id
      and r.deleted_at is null
      and r.id <> new.id;

    if v_used_bytes + new.size_bytes > 2147483648 then
      raise exception using errcode = '23514', message = 'storage_quota_exceeded';
    end if;
  end if;

  return new;
end $$;

create trigger resources_enforce_limits
  before insert or update of chapter_id, size_bytes, deleted_at on public.resources
  for each row execute function public.enforce_resource_limits();

-- EF-4 / CL-6 : la suppression logique efface le contenu (avant) puis les passages (après).
-- La ligne est conservée (titre, type) pour afficher « source supprimée » dans les citations
-- (ADR-0039) ; le fichier est supprimé par le service (SPEC-206).
create or replace function public.clear_deleted_resource_content() returns trigger
  language plpgsql
  set search_path = ''
  as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    new.content_text := null;
  end if;
  return new;
end $$;

create trigger resources_clear_content before update on public.resources
  for each row execute function public.clear_deleted_resource_content();

create or replace function public.delete_resource_chunks() returns trigger
  language plpgsql
  set search_path = ''
  as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    delete from public.resource_chunks where resource_id = new.id;
  end if;
  return null;
end $$;

create trigger resources_soft_delete after update of deleted_at on public.resources
  for each row execute function public.delete_resource_chunks();

-- EF-4 : une ressource supprimée ne peut plus être modifiée hors du service propriétaire.
create or replace function public.freeze_deleted_resource() returns trigger
  language plpgsql
  set search_path = ''
  as $$
begin
  if old.deleted_at is not null and current_user <> 'postgres' then
    raise exception using errcode = '42501', message = 'resource_deleted';
  end if;
  return new;
end $$;

create trigger resources_deleted_frozen before update on public.resources
  for each row execute function public.freeze_deleted_resource();

-- EF-5 / CL-7 : un passage hérite du propriétaire, de la formation et du chapitre de sa ressource
-- (ADR-0113) ; il refuse un périmètre divergent ou une ressource supprimée. Security definer : le
-- déclencheur lit la ressource même quand SPEC-113 restreint la table au propriétaire.
create or replace function public.check_resource_chunk_consistency() returns trigger
  language plpgsql
  security definer
  set search_path = ''
  as $$
declare
  v_resource record;
begin
  select r.owner_id, r.formation_id, r.chapter_id, r.deleted_at
  into v_resource
  from public.resources r
  where r.id = new.resource_id;

  if not found then
    raise exception using errcode = '23503', message = 'resource_not_found';
  end if;

  if v_resource.deleted_at is not null then
    raise exception using errcode = '42501', message = 'resource_deleted';
  end if;

  if new.owner_id is null then
    new.owner_id := v_resource.owner_id;
  end if;
  if new.formation_id is null then
    new.formation_id := v_resource.formation_id;
  end if;
  if new.chapter_id is null then
    new.chapter_id := v_resource.chapter_id;
  end if;

  if new.owner_id <> v_resource.owner_id then
    raise exception using errcode = '23514', message = 'resource_chunk_owner_mismatch';
  end if;

  if new.formation_id <> v_resource.formation_id
     or new.chapter_id is distinct from v_resource.chapter_id then
    raise exception using errcode = '23514', message = 'resource_chunk_scope_mismatch';
  end if;

  return new;
end $$;

create trigger resource_chunks_consistency before insert on public.resource_chunks
  for each row execute function public.check_resource_chunk_consistency();

-- Les fonctions de déclencheur ne sont pas appelables directement.
revoke execute on function public.enforce_resource_limits() from public, anon, authenticated;
revoke execute on function public.clear_deleted_resource_content() from public, anon, authenticated;
revoke execute on function public.delete_resource_chunks() from public, anon, authenticated;
revoke execute on function public.freeze_deleted_resource() from public, anon, authenticated;
revoke execute on function public.check_resource_chunk_consistency() from public, anon, authenticated;
