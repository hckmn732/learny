-- Contraintes, RLS, déclencheurs et index de SPEC-103 (ET-2, ET-4, ADR-0112, ADR-0113).
-- Migration personnalisée appliquée après la migration générée : contraintes différées,
-- déclencheur de validation des liens, index plein texte, politiques RLS et clé étrangère
-- `profiles.current_formation_id`. Ne jamais modifier après fusion : ajouter une migration.

-- EF-3 : les positions peuvent être échangées dans une transaction (CL-3). Drizzle exprime
-- l'unicité mais pas le caractère différé : on remplace les contraintes générées.
alter table public.modules drop constraint modules_position_unique;
alter table public.modules
  add constraint modules_position_unique unique (formation_id, position)
  deferrable initially deferred;
alter table public.chapters drop constraint chapters_position_unique;
alter table public.chapters
  add constraint chapters_position_unique unique (module_id, position)
  deferrable initially deferred;
alter table public.notions drop constraint notions_position_unique;
alter table public.notions
  add constraint notions_position_unique unique (chapter_id, position)
  deferrable initially deferred;

-- EF-7 / CL-9 : supprimer une formation remet à nul la formation courante du profil.
alter table public.profiles
  add constraint profiles_current_formation_fk
  foreign key (current_formation_id) references public.formations (id) on delete set null;

-- RLS activee des la creation (ADR-0112) : sans politique, seul le proprietaire (serviceDb)
-- accede aux lignes ; SPEC-113 ajoutera les politiques nommees.
alter table public.formations enable row level security;
alter table public.cadrage_messages enable row level security;
alter table public.programme_imports enable row level security;
alter table public.programme_change_requests enable row level security;
alter table public.modules enable row level security;
alter table public.chapters enable row level security;
alter table public.chapter_progress enable row level security;
alter table public.module_progress enable row level security;
alter table public.notions enable row level security;
alter table public.notion_links enable row level security;

-- updated_at maintenu par la fonction partagee (SPEC-101, EF-5).
create trigger set_updated_at before update on public.formations
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.programme_imports
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.programme_change_requests
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.modules
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.chapters
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.chapter_progress
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.module_progress
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.notions
  for each row execute function public.set_updated_at();

-- EF-5 / CL-5 : un lien relie deux notions de la meme formation ; un prerequis de programme
-- ne peut pas fermer un cycle. Les liens personnels (owner_id non nul) et les liens `tutor`
-- echappent au controle de cycle.
create or replace function public.validate_notion_link() returns trigger
  language plpgsql
  set search_path = ''
  as $$
declare
  v_from_formation uuid;
  v_to_formation uuid;
begin
  select n.formation_id into v_from_formation
  from public.notions n where n.id = new.from_notion_id;
  select n.formation_id into v_to_formation
  from public.notions n where n.id = new.to_notion_id;

  if v_from_formation is null
     or v_to_formation is null
     or v_from_formation <> new.formation_id
     or v_to_formation <> new.formation_id then
    raise exception using errcode = '23514', message = 'notion_link_cross_formation';
  end if;

  if new.kind = 'prerequisite' and new.owner_id is null then
    if exists (
      with recursive reachable(notion_id) as (
        select l.to_notion_id
        from public.notion_links l
        where l.kind = 'prerequisite'
          and l.owner_id is null
          and l.from_notion_id = new.to_notion_id
          and l.id <> new.id
        union
        select l.to_notion_id
        from public.notion_links l
        join reachable r on l.from_notion_id = r.notion_id
        where l.kind = 'prerequisite'
          and l.owner_id is null
          and l.id <> new.id
      )
      select 1 from reachable where notion_id = new.from_notion_id
    ) then
      raise exception using errcode = '23514', message = 'notion_link_cycle';
    end if;
  end if;

  return new;
end $$;

create trigger notion_links_validate before insert or update on public.notion_links
  for each row execute function public.validate_notion_link();

revoke execute on function public.validate_notion_link() from public, anon, authenticated;

-- EF-6 / ADR-0062 / ADR-0111 : recherche plein texte sans accents ; l'index d'expression passe
-- obligatoirement par le wrapper immutable partage.
create index notions_fts_idx on public.notions
  using gin (
    to_tsvector(
      'simple',
      public.immutable_unaccent(label || ' ' || coalesce(short_definition, ''))
    )
  );
