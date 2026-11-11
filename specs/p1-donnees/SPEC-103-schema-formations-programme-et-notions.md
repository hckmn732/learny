---
id: SPEC-103
title: Schéma formations, programme et notions
phase: P1
priority: V1
depends_on: [SPEC-102]
business_rules: [BR-FOR-03, BR-FOR-05]
screens: []
adrs: [ADR-0014, ADR-0035, ADR-0062, ADR-0111, ADR-0112, ADR-0113]
visual: demo
---

# SPEC-103 — Schéma formations, programme et notions

## 1. Objectif

Créer les tables de la formation et de son programme (`formations`, `cadrage_messages`, `programme_imports`, `programme_change_requests`, `modules`, `chapters`, `chapter_progress`, `module_progress`, `notions`, `notion_links`) avec leurs contraintes (seuils 60..95, positions uniques, cohérence formation/module/chapitre, liens sans boucle) et l'index plein texte des notions.

## 2. Contexte

Section §2 de `docs/architecture/data-model.md`, complétée par ADR-0113. Le programme (modules, chapitres, notions, liens « de programme ») appartient à la ligne `formations` et est **partagé** entre les membres d'une formation à plusieurs (ADR-0035) ; l'avancement est **personnel** (`module_progress`, `chapter_progress`). Lire `docs/product/business-rules.md` §FOR, ADR-0014 (seuils), ADR-0035, ADR-0062 (FTS), ADR-0016 (pause).

## 3. Dépendances

- **SPEC-102** : `profiles` (propriétaire), énumération `course_language`, `actor` (SPEC-101), helpers et harnais `@learny/db`.
- Les clés étrangères vers `groups` (`formations.group_id`) et `resources` (`programme_imports.resource_id`) sont ajoutées respectivement par SPEC-111 et SPEC-104 : la colonne existe dès maintenant, sans contrainte.
- Aucune dépendance externe hors base locale.

## 4. Règles métier couvertes

- **BR-FOR-03** (objectifs) : `formations.objectives formation_objective[]` avec les valeurs `operational`, `exam`, `dialogue`, `project` ; au moins un objectif dès que la formation quitte l'état `cadrage` (contrainte `formations_objectives_required`), sans doublon.
- **BR-FOR-05** (structure du programme) : `modules` ordonnés (`unique(formation_id, position)`), avec titre, objectifs pédagogiques (`objectives text[]`), dates prévues, seuil (`threshold` 60..95) ; `chapters` ordonnés par module ; `notions` rattachées à un chapitre (intitulé ≤ 120, définition courte ≤ 400). La cohérence formation → module → chapitre → notion est garantie par des clés étrangères composites.

## 5. Exigences fonctionnelles

- **EF-1** — Une formation créée sans précision a `status = 'cadrage'`, `objectives = '{}'`, `default_threshold = 80`, `cadrage_profile = '{}'`.
- **EF-2** — Un module créé sans seuil reçoit `threshold = 80` ; tout seuil hors `[60, 95]` est refusé (formation et module).
- **EF-3** — Les positions des modules d'une formation, des chapitres d'un module et des notions d'un chapitre sont uniques et ≥ 1 ; l'unicité est **différée** (`deferrable initially deferred`) pour permettre la réorganisation dans une transaction.
- **EF-4** — Une notion ne peut référencer qu'un chapitre de son module et un module de sa formation ; un chapitre ne peut référencer qu'un module de la formation indiquée.
- **EF-5** — Un lien entre notions refuse : la même notion aux deux extrémités ; deux notions de formations différentes ; un doublon `(from, to, kind, owner_id)` (les liens de programme ont `owner_id` nul et sont dédoublonnés comme tels) ; un cycle de liens `prerequisite` de programme. Un lien `confusion` est stocké dans l'ordre canonique `from_notion_id < to_notion_id`.
- **EF-6** — La recherche plein texte des notions (`to_tsvector('simple', immutable_unaccent(label || ' ' || coalesce(short_definition,'')))`) utilise l'index `notions_fts_idx` (plan `Bitmap Index Scan`).
- **EF-7** — La suppression d'une formation supprime en cascade tout son programme, ses messages de cadrage, imports, demandes d'ajustement et l'avancement de tous les utilisateurs ; `profiles.current_formation_id` qui la référençait devient nul.

## 6. Exigences techniques

- **ET-1 — Énumérations** (`packages/db/src/schema/formations.ts`) : `formation_objective` (`operational`,`exam`,`dialogue`,`project`) ; `formation_status` (`cadrage`,`programme_proposed`,`active`,`paused`,`completed`,`archived`) ; `maintenance_mode` (`light`,`stopped`) ; `message_role` (`tutor`,`learner`) ; `cadrage_key` (`scope`,`starting_point`,`target_level`,`volume`,`dates`,`other`) ; `import_kind` (`file`,`text`) ; `module_status` (`locked`,`open`,`validated`) ; `contrib_status` (`in_progress`,`done`) ; `link_kind` (`prerequisite`,`confusion`,`tutor`).
- **ET-2 — Tables** (migration générée `formations_programme`, SQL attendu) :
  ```sql
  create table public.formations (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references public.profiles(id) on delete cascade,
    group_id uuid,                                   -- FK vers groups ajoutée par SPEC-111
    title text not null check (char_length(title) between 1 and 120),
    description text check (char_length(description) <= 2000),
    objectives formation_objective[] not null default '{}',
    status formation_status not null default 'cadrage',
    cadrage_profile jsonb not null default '{}' check (jsonb_typeof(cadrage_profile) = 'object'),
    volume_hours smallint check (volume_hours between 1 and 2000),
    start_date date,
    end_date date,
    study_override jsonb check (study_override is null or jsonb_typeof(study_override) = 'object'),
    default_threshold smallint not null default 80 check (default_threshold between 60 and 95),
    exam_format jsonb check (exam_format is null or jsonb_typeof(exam_format) = 'object'),
    maintenance_mode maintenance_mode,
    course_language course_language not null default 'fr',
    last_opened_at timestamptz,
    paused_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint formations_dates_order check (end_date is null or start_date is null or end_date >= start_date),
    constraint formations_objectives_required check (status = 'cadrage' or cardinality(objectives) >= 1),
    constraint formations_objectives_unique check (public.enum_array_is_set(objectives::text[])),
    constraint formations_maintenance_only_completed check (maintenance_mode is null or status = 'completed')
  );
  create index formations_owner_status_idx on public.formations (owner_id, status);
  create index formations_group_id_idx on public.formations (group_id) where group_id is not null;
  alter table public.profiles add constraint profiles_current_formation_fk foreign key (current_formation_id) references public.formations(id) on delete set null;

  create table public.cadrage_messages (
    id uuid primary key default gen_random_uuid(),
    formation_id uuid not null references public.formations(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,      -- ADR-0113
    role message_role not null,
    content text not null check (char_length(content) between 1 and 4000),
    question_key cadrage_key,
    suggestions jsonb check (suggestions is null or jsonb_typeof(suggestions) = 'array'),
    position integer not null check (position >= 1),
    created_at timestamptz not null default now(),
    unique (formation_id, position)
  );
  create index cadrage_messages_user_id_idx on public.cadrage_messages (user_id);

  create table public.programme_imports (
    id uuid primary key default gen_random_uuid(),
    formation_id uuid not null references public.formations(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,      -- ADR-0113
    source_kind import_kind not null,
    resource_id uuid,                                -- FK vers resources ajoutée par SPEC-104
    raw_text text check (char_length(raw_text) <= 200000),
    parsed jsonb,
    status job_status not null default 'queued',
    error text check (char_length(error) <= 2000),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check ((source_kind = 'text') = (raw_text is not null))
  );
  create index programme_imports_user_id_idx on public.programme_imports (user_id);

  create table public.programme_change_requests (
    id uuid primary key default gen_random_uuid(),
    formation_id uuid not null references public.formations(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    message text not null check (char_length(message) between 1 and 2000),
    status job_status not null default 'queued',
    result_summary text check (char_length(result_summary) <= 4000),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create index programme_change_requests_user_id_idx on public.programme_change_requests (user_id);

  create table public.modules (
    id uuid primary key default gen_random_uuid(),
    formation_id uuid not null references public.formations(id) on delete cascade,
    position smallint not null check (position >= 1),
    title text not null check (char_length(title) between 1 and 160),
    objectives text[] not null default '{}',
    planned_start date,
    planned_end date,
    threshold smallint not null default 80 check (threshold between 60 and 95),
    status module_status not null default 'locked',
    opened_at timestamptz,
    validated_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (id, formation_id),
    constraint modules_position_unique unique (formation_id, position) deferrable initially deferred,
    check (planned_end is null or planned_start is null or planned_end >= planned_start)
  );

  create table public.chapters (
    id uuid primary key default gen_random_uuid(),
    module_id uuid not null,
    formation_id uuid not null,                      -- ADR-0113 (RLS sans jointure)
    position smallint not null check (position >= 1),
    title text not null check (char_length(title) between 1 and 160),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (id, module_id),
    foreign key (module_id, formation_id) references public.modules(id, formation_id) on delete cascade,
    constraint chapters_position_unique unique (module_id, position) deferrable initially deferred
  );
  create index chapters_formation_id_idx on public.chapters (formation_id);

  create table public.chapter_progress (
    user_id uuid not null references public.profiles(id) on delete cascade,
    chapter_id uuid not null references public.chapters(id) on delete cascade,
    contributions_status contrib_status not null default 'in_progress',
    done_at timestamptz,
    updated_at timestamptz not null default now(),
    primary key (user_id, chapter_id),
    check ((contributions_status = 'done') = (done_at is not null))
  );
  create index chapter_progress_chapter_id_idx on public.chapter_progress (chapter_id);

  create table public.module_progress (
    user_id uuid not null references public.profiles(id) on delete cascade,
    module_id uuid not null references public.modules(id) on delete cascade,
    status module_status not null default 'locked',
    opened_at timestamptz,
    validated_at timestamptz,
    best_score numeric(5,2) check (best_score between 0 and 100),
    updated_at timestamptz not null default now(),
    primary key (user_id, module_id),
    check (status <> 'validated' or validated_at is not null)
  );
  create index module_progress_module_id_idx on public.module_progress (module_id);

  create table public.notions (
    id uuid primary key default gen_random_uuid(),
    formation_id uuid not null references public.formations(id) on delete cascade,
    module_id uuid not null,
    chapter_id uuid not null,
    label text not null check (char_length(label) between 1 and 120),
    short_definition text check (char_length(short_definition) <= 400),
    position smallint not null default 1 check (position >= 1),
    created_by actor not null default 'tutor',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    foreign key (module_id, formation_id) references public.modules(id, formation_id) on delete cascade,
    foreign key (chapter_id, module_id) references public.chapters(id, module_id) on delete cascade,
    constraint notions_position_unique unique (chapter_id, position) deferrable initially deferred
  );
  create index notions_formation_id_idx on public.notions (formation_id);
  create index notions_module_id_idx on public.notions (module_id);

  create table public.notion_links (
    id uuid primary key default gen_random_uuid(),
    formation_id uuid not null references public.formations(id) on delete cascade,
    from_notion_id uuid not null references public.notions(id) on delete cascade,
    to_notion_id uuid not null references public.notions(id) on delete cascade,
    kind link_kind not null,
    owner_id uuid references public.profiles(id) on delete cascade,
    rationale text check (char_length(rationale) <= 500),
    created_at timestamptz not null default now(),
    constraint notion_links_unique unique nulls not distinct (from_notion_id, to_notion_id, kind, owner_id),
    constraint notion_links_no_self check (from_notion_id <> to_notion_id),
    constraint notion_links_confusion_canonical check (kind <> 'confusion' or from_notion_id < to_notion_id)
  );
  create index notion_links_formation_id_idx on public.notion_links (formation_id);
  create index notion_links_to_idx on public.notion_links (to_notion_id);
  create index notion_links_owner_id_idx on public.notion_links (owner_id) where owner_id is not null;
  ```
  RLS activée sur les 10 tables (ADR-0112) ; déclencheurs `set_updated_at` sur `formations`, `programme_imports`, `programme_change_requests`, `modules`, `chapters`, `chapter_progress`, `module_progress`, `notions`.
- **ET-3 — Migration personnalisée `formations_functions`** (avant la migration générée) : `public.enum_array_is_set(text[]) returns boolean immutable` (pas de doublon).
- **ET-4 — Migration personnalisée `formations_constraints`** (après la migration générée) :
  - Déclencheur `notion_links_validate` (`before insert or update`) : vérifie que `from` et `to` appartiennent à `formation_id` (`errcode '23514'`, message `notion_link_cross_formation`) ; pour `kind = 'prerequisite'` et `owner_id is null`, refuse si `to_notion_id` atteint déjà `from_notion_id` par une requête récursive sur les liens `prerequisite` de programme (`notion_link_cycle`).
  - Index FTS : `create index notions_fts_idx on public.notions using gin (to_tsvector('simple', public.immutable_unaccent(label || ' ' || coalesce(short_definition, ''))));`
- **ET-5 — Types exportés** : `Formation`, `NewFormation`, `Module`, `Chapter`, `Notion`, `NotionLink`, `ModuleProgress`, `ChapterProgress`, `CadrageMessage`, `ProgrammeImport`, `ProgrammeChangeRequest`. Schémas Zod des colonnes JSON dans `packages/db/src/schema/formations.json-schemas.ts` (réutilisés par `packages/contracts`, SPEC-201) :
  - `cadrageProfileSchema` : `{ scope?, starting_point?, target_level?, volume?, dates? }`, chaque valeur `{ value: string | null, state: 'todo' | 'waiting' | 'done' }` ;
  - `studyOverrideSchema` : `{ hoursPerDay: 1..6, studyDays: (1..7)[] non vide, preferredSlots: ('matin'|'apres_midi'|'soir')[] non vide }` ;
  - `examFormatSchema` : `{ questions: int 1..200, durationMin: int 1..600, threshold: int 1..100, sourceResourceId?: uuid, confirmed: boolean }` ;
  - `cadrageSuggestionsSchema` : `[{ label: string ≤ 80, value: string ≤ 200, multi?: boolean }]` (≤ 8 éléments).
- **ET-6 — Performance** : la requête « programme complet d'une formation » (modules + chapitres + notions triés) sur 7 modules / 24 chapitres / 48 notions s'exécute en < 20 ms (mesuré).

## 7. Comportements attendus et cas limites

- **CL-1** — `threshold = 59` ou `96` (module ou formation) → 23514.
- **CL-2** — Passage en `programme_proposed` avec `objectives = '{}'` → 23514 (`formations_objectives_required`) ; `objectives = '{exam,exam}'` → 23514.
- **CL-3** — Échange de positions de deux modules dans une transaction (`1↔2`) → accepté (contrainte différée) ; le même échange hors transaction en deux ordres successifs → 23505 à la première instruction sans transaction englobante (ce cas documente pourquoi les services réordonnent en transaction).
- **CL-4** — Notion dont `chapter_id` appartient à un autre module → 23503 (clé composite).
- **CL-5** — Lien `prerequisite` A→B puis B→C puis C→A (programme) → le troisième est refusé (`notion_link_cycle`) ; le même C→A en lien personnel (`owner_id` non nul) ou de type `tutor` → accepté.
- **CL-6** — Lien `confusion` inséré B→A avec `B > A` → refusé (`notion_links_confusion_canonical`) ; le service doit trier les identifiants.
- **CL-7** — Deux liens de programme identiques (owner nul) → 23505 grâce à `nulls not distinct`.
- **CL-8** — `chapter_progress` à `done` sans `done_at` → 23514 ; `module_progress` à `validated` sans `validated_at` → 23514.
- **CL-9** — Suppression de la formation courante d'un profil → `current_formation_id` passe à nul (EF-7).
- **CL-10** — `maintenance_mode = 'light'` sur une formation `active` → 23514.

## 8. Instructions d'implémentation

1. `pnpm db:migration:custom formations_functions` (ET-3).
2. Écrire `packages/db/src/schema/formations.ts` (ET-1, ET-2 ; clés composites via `foreignKey({ columns, foreignColumns })`, `unique().nullsNotDistinct()`, contraintes différées ajoutées dans la migration personnalisée si Drizzle ne les exprime pas) et `formations.json-schemas.ts` (ET-5).
3. `pnpm db:generate --name formations_programme` ; vérifier le SQL contre ET-2.
4. `pnpm db:migration:custom formations_constraints` : RLS, `set_updated_at`, contraintes `deferrable` (si `drizzle-kit` les a générées non différées : `alter table … drop constraint …, add constraint … deferrable initially deferred`), déclencheur ET-4, index FTS, FK `profiles.current_formation_id`.
5. Tests (§12), page de démonstration, test e2e.
6. Commits : `feat(SPEC-103): ajoute le schéma des formations et du programme` ; `feat(SPEC-103): ajoute contraintes de liens et index plein texte` ; `test(SPEC-103): couvre contraintes et cascades du programme` ; `feat(SPEC-103): ajoute la page de démonstration`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/db/src/schema/formations.ts`, `formations.json-schemas.ts`, `formations.test.ts` ; migrations `NNNN_formations_functions.sql`, `NNNN_formations_programme.sql`, `NNNN_formations_constraints.sql` (+ copies) ; `packages/db/test/integration/formations.test.ts` ; `apps/web/app/_dev/sdd/SPEC-103/page.tsx` ; `apps/web/e2e/specs/p1/spec-103-formations.spec.ts` ; fabrique minimale `packages/db/src/testing/programme.ts` (`createTestProgramme(tx, ownerId, { modules: 2, chaptersPerModule: 2, notionsPerChapter: 2 })`, enrichie par SPEC-115).
- **Modifiés** : `packages/db/src/schema/index.ts`, `packages/db/src/testing/index.ts`.
- **Lus** : data-model §2, business-rules §FOR.

## 10. Interface et conformité visuelle

Mode `demo`. Page `/_dev/sdd/SPEC-103` :
- `h1` « SPEC-103 · Formations, programme et notions ».
- Carte « Programme de démonstration » (`data-testid="programme-tree"`) : arbre construit dans une transaction annulée par `createTestProgramme` (2 modules × 2 chapitres × 2 notions) : « Module 1 · … · seuil 80 % » → chapitres → notions.
- Carte « Contraintes » (`data-testid="constraints-card"`) : résultat de CL-1, CL-2, CL-4, CL-5, CL-6, CL-7 (SQLSTATE et message, « Refusé comme attendu ») et de CL-3 (« Réorganisation en transaction acceptée »).
- Carte « Recherche plein texte » (`data-testid="fts-card"`) : requête « ecriture » (sans accent) sur des notions « Écriture de régularisation » / « Équilibre d’une pièce » → 1 résultat ; affichage du plan `EXPLAIN` contenant `notions_fts_idx`.
- Contrôles visuels : contrôles 1, 2, 4 ; ligne de base (UUID masqués).

## 11. Critères d'acceptation

- **CA-1** — Les 10 tables, 9 énumérations, index et contraintes d'ET-2/ET-4 existent après `pnpm db:reset` (introspection `pg_catalog`).
- **CA-2** — Seuils hors 60..95 refusés, défaut 80 appliqué (CL-1, EF-2).
- **CA-3** — Objectifs requis hors cadrage et sans doublon (BR-FOR-03, CL-2).
- **CA-4** — Cohérence formation/module/chapitre/notion garantie (CL-4) et réorganisation différée possible (CL-3).
- **CA-5** — Liens : auto-lien, inter-formation, doublon, cycle de prérequis et ordre non canonique des confusions refusés (EF-5, CL-5 à CL-7).
- **CA-6** — Cascades et `set null` conformes (EF-7, CL-9).
- **CA-7** — La recherche FTS insensible aux accents utilise `notions_fts_idx` et le programme complet se lit en < 20 ms (ET-6).
- **CA-8** — Page de démonstration filmée et contrôle `@visual` réussi.

## 12. Plan de tests

- **Unitaires** — `packages/db/src/schema/formations.test.ts`, `describe('[SPEC-103] schémas JSON du programme')` : `cadrageProfileSchema`, `studyOverrideSchema`, `examFormatSchema`, `cadrageSuggestionsSchema` (cas valides, bornes, valeurs refusées) ; valeurs des énumérations.
- **Intégration** — `packages/db/test/integration/formations.test.ts`, `describe('[SPEC-103] formations et programme')` : CA-1 (introspection), CA-2, CA-3, CA-4 (CL-3, CL-4), CA-5 (CL-5, CL-6, CL-7, inter-formation), CA-6 (suppression formation : comptes à 0, profil à nul), CL-8, CL-10, CA-7 (`EXPLAIN (format json)` contient `notions_fts_idx` après `set local enable_seqscan = off` ; mesure de durée sur programme 7×24×48 créé par la fabrique).
- **End-to-end** — `apps/web/e2e/specs/p1/spec-103-formations.spec.ts`, `test('programme et contraintes @SPEC-103', …)` : ouvrir la page, vérifier l'arbre (2 modules, 4 chapitres, 8 notions), les 7 lignes de la carte Contraintes, le résultat FTS ; vidéo.
- **Visuel** — `test('page programme conforme @SPEC-103 @visual', …)`.
- **Non-régression** : `[SPEC-101]`, `[SPEC-102]`, `@SPEC-101`, `@SPEC-102`.
- **Traçabilité** : CA-1 à CA-7 → intégration (et unitaires pour CA-3 via schémas) ; CA-5, CA-7 → aussi e2e ; CA-8 → e2e + `@visual`.

## 13. Preuves attendues

Vidéo e2e, capture de la page, `EXPLAIN` FTS et durée de lecture du programme consignés dans `summary.md`.

## 14. Définition de terminé

Définition commune ; test générique `[SPEC-101] conventions de schéma` vert ; `createTestProgramme` documentée dans `packages/db/README.md`.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0014 (seuil 80, bornes 60..95), ADR-0035 (programme partagé sur la ligne `formations`, avancement personnel), ADR-0062 (FTS `simple` + `unaccent`), ADR-0111, ADR-0112.
- **ADR-0113** : ajout de `cadrage_messages.user_id`, `programme_imports.user_id`, `chapters.formation_id`, `updated_at` sur `modules`, `chapters`, `notions`, `chapter_progress`, `module_progress`, `programme_imports`, `programme_change_requests` ; énumération `cadrage_key` ; clés étrangères composites ; unicité `nulls not distinct` ; ordre canonique des liens `confusion` ; refus des cycles de prérequis de programme ; positions uniques différées ; `course_language` par défaut `fr` (copié du profil par le service de création).
- Hypothèse : Postgres ≥ 15 (Supabase CLI 2) pour `unique nulls not distinct`.
- `modules.status` reste le miroir de `module_progress` du propriétaire (data-model §2) ; la synchronisation est faite par les services (SPEC-411, SPEC-612), pas par déclencheur.
