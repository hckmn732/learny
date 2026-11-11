---
id: SPEC-105
title: Schéma cours et discussions
phase: P1
priority: V1
depends_on: [SPEC-104]
business_rules: [BR-COU-10]
screens: []
adrs: [ADR-0040, ADR-0039, ADR-0112, ADR-0113]
visual: demo
---

# SPEC-105 — Schéma cours et discussions

## 1. Objectif

Créer les tables du cours versionné (`courses`, `course_sections`, `course_section_revisions`, `citations`), de la lecture (`reading_progress`, `chapter_summaries`) et de la discussion avec le tuteur (`tutor_conversations`, `tutor_messages`), avec l'unicité de la version courante et l'historique des sections modifiées.

## 2. Contexte

Section §4 de `docs/architecture/data-model.md` complétée par ADR-0113. Le cours est **personnel** (généré depuis les apports privés de l'apprenant, ADR-0026/ADR-0035) même dans une formation partagée. Producteurs : SPEC-608 (génération), SPEC-609 (lecture, correction, signalement, résumé), SPEC-610 (discussion), SPEC-211 (export). Lire BR-COU-01 à BR-COU-11, BR-TUT-07, ADR-0040, ADR-0039 (citations conservées avec `chunk_id` nul).

## 3. Dépendances

- **SPEC-104** : `resources`, `resource_chunks` (cibles des citations).
- **SPEC-103** : `modules`, `chapters`, `formations` ; énumérations `message_role` (réutilisée pour `tutor_messages.role`), `content_origin` (SPEC-101).
- Aucune dépendance externe.

## 4. Règles métier couvertes

- **BR-COU-10** (cours stocké par version, résultats et citations liés à la version utilisée) : chaque génération crée une ligne `courses` de `version` n+1 pour `(owner_id, module_id)` ; une seule version est courante (index unique partiel `courses_one_current_idx`), la précédente est conservée (non supprimée) avec ses sections et citations ; les citations appartiennent à une section d'une version donnée (`citations.section_id`) ; la correction d'une section par l'apprenant (BR-COU-09) incrémente `course_sections.version` et archive l'état précédent dans `course_section_revisions` ; la progression de lecture et les résumés référencent la version (`reading_progress.course_id`, `chapter_summaries.course_id`).

## 5. Exigences fonctionnelles

- **EF-1** — Insérer une version `is_current = true` d'un cours bascule automatiquement toutes les autres versions du même `(owner_id, module_id)` à `is_current = false` (déclencheur), dans la même transaction.
- **EF-2** — `version` est unique par `(owner_id, module_id)` et ≥ 1 ; une version `failed` porte `error`.
- **EF-3** — Une section a une ancre unique dans son cours (`anchor` en minuscules, chiffres et tirets, 1 à 80 caractères) ; ses positions sont uniques par `(course_id, chapter_id)`.
- **EF-4** — Toute mise à jour de `title`, `content_md` ou `data` d'une section enregistre l'état précédent dans `course_section_revisions` et incrémente `version` ; `reported` peut changer sans créer de révision.
- **EF-5** — La suppression d'un passage (`resource_chunks`) ou d'une ressource met `citations.chunk_id` / `citations.resource_id` à nul sans supprimer la citation (« source supprimée », ADR-0039).
- **EF-6** — `reading_progress.percent` ∈ [0, 100], `seconds_spent` ≥ 0 ; une ligne par `(user_id, course_id, chapter_id)`.
- **EF-7** — Une discussion appartient à un utilisateur et à un cours ; ses messages sont ordonnés par `created_at` puis `id` ; supprimer la discussion supprime ses messages ; « Nouvelle discussion » crée une nouvelle ligne (ADR-0040).

## 6. Exigences techniques

- **ET-1 — Énumérations** (`packages/db/src/schema/courses.ts`) : `course_status` (`generating`,`ready`,`failed`) ; `section_kind` (`text`,`flash_question`,`dont_confuse`,`tutor_completed`,`retain`,`summary_prompt`) ; `citation_media` (`pdf`,`audio`,`video`,`web`,`note`,`image`) ; `summary_verdict` n'est pas une énumération SQL (valeur JSON validée par Zod).
- **ET-2 — Tables** (migration générée `courses_conversations`) :
  ```sql
  create table public.courses (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references public.profiles(id) on delete cascade,
    formation_id uuid not null references public.formations(id) on delete cascade,  -- ADR-0113
    module_id uuid not null references public.modules(id) on delete cascade,
    version integer not null check (version >= 1),
    is_current boolean not null default true,
    status course_status not null default 'generating',
    model text check (char_length(model) <= 120),
    error text check (char_length(error) <= 2000),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (owner_id, module_id, version),
    check (status <> 'failed' or error is not null)
  );
  create unique index courses_one_current_idx on public.courses (owner_id, module_id) where is_current;
  create index courses_owner_formation_idx on public.courses (owner_id, formation_id);

  create table public.course_sections (
    id uuid primary key default gen_random_uuid(),
    course_id uuid not null references public.courses(id) on delete cascade,
    owner_id uuid not null references public.profiles(id) on delete cascade,        -- ADR-0113
    chapter_id uuid not null references public.chapters(id) on delete cascade,
    position integer not null check (position >= 1),
    kind section_kind not null,
    anchor text not null check (anchor ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(anchor) <= 80),
    title text check (char_length(title) <= 200),
    content_md text check (char_length(content_md) <= 50000),
    data jsonb check (data is null or jsonb_typeof(data) = 'object'),
    notion_ids uuid[] not null default '{}',
    origin content_origin not null,
    version integer not null default 1 check (version >= 1),
    reported boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (course_id, chapter_id, position),
    unique (course_id, anchor)
  );
  create index course_sections_owner_id_idx on public.course_sections (owner_id);
  create index course_sections_chapter_id_idx on public.course_sections (chapter_id);
  create index course_sections_notion_ids_idx on public.course_sections using gin (notion_ids);

  create table public.course_section_revisions (                                   -- ADR-0113
    id uuid primary key default gen_random_uuid(),
    section_id uuid not null references public.course_sections(id) on delete cascade,
    owner_id uuid not null references public.profiles(id) on delete cascade,
    version integer not null check (version >= 1),
    title text, content_md text, data jsonb,
    edited_by actor not null,
    created_at timestamptz not null default now(),
    unique (section_id, version)
  );
  create index course_section_revisions_owner_id_idx on public.course_section_revisions (owner_id);

  create table public.citations (
    id uuid primary key default gen_random_uuid(),
    section_id uuid not null references public.course_sections(id) on delete cascade,
    owner_id uuid not null references public.profiles(id) on delete cascade,        -- ADR-0113
    chunk_id uuid references public.resource_chunks(id) on delete set null,
    resource_id uuid references public.resources(id) on delete set null,
    quote text check (char_length(quote) <= 2000),
    location jsonb check (location is null or jsonb_typeof(location) = 'object'),
    label text not null check (char_length(label) between 1 and 120),
    media_kind citation_media not null,
    created_at timestamptz not null default now()
  );
  create index citations_section_id_idx on public.citations (section_id);
  create index citations_owner_id_idx on public.citations (owner_id);
  create index citations_chunk_id_idx on public.citations (chunk_id);
  create index citations_resource_id_idx on public.citations (resource_id);

  create table public.reading_progress (
    user_id uuid not null references public.profiles(id) on delete cascade,
    course_id uuid not null references public.courses(id) on delete cascade,
    chapter_id uuid not null references public.chapters(id) on delete cascade,
    percent smallint not null default 0 check (percent between 0 and 100),
    seconds_spent integer not null default 0 check (seconds_spent >= 0),
    updated_at timestamptz not null default now(),
    primary key (user_id, course_id, chapter_id)
  );

  create table public.chapter_summaries (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    chapter_id uuid not null references public.chapters(id) on delete cascade,
    course_id uuid references public.courses(id) on delete set null,               -- ADR-0113
    text text not null check (char_length(text) between 1 and 2000),
    feedback jsonb check (feedback is null or jsonb_typeof(feedback) = 'object'),
    created_at timestamptz not null default now()
  );
  create index chapter_summaries_user_chapter_idx on public.chapter_summaries (user_id, chapter_id, created_at desc);

  create table public.tutor_conversations (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    course_id uuid not null references public.courses(id) on delete cascade,
    title text check (char_length(title) <= 200),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create index tutor_conversations_user_course_idx on public.tutor_conversations (user_id, course_id, created_at desc);

  create table public.tutor_messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.tutor_conversations(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,         -- ADR-0113
    role message_role not null,
    content text not null check (char_length(content) between 1 and 20000),
    context jsonb check (context is null or jsonb_typeof(context) = 'object'),
    sources jsonb not null default '[]' check (jsonb_typeof(sources) = 'array'),
    follow_ups text[] not null default '{}',
    self_test jsonb check (self_test is null or jsonb_typeof(self_test) = 'object'),
    created_at timestamptz not null default now()
  );
  create index tutor_messages_conversation_idx on public.tutor_messages (conversation_id, created_at, id);
  create index tutor_messages_user_id_idx on public.tutor_messages (user_id);
  ```
- **ET-3 — Migration personnalisée `courses_rules`** : RLS activée sur les 8 tables ; `set_updated_at` sur `courses`, `course_sections`, `reading_progress`, `tutor_conversations` ; déclencheurs :
  - `courses_single_current` (`before insert or update of is_current`, quand `new.is_current`) : `update public.courses set is_current = false where owner_id = new.owner_id and module_id = new.module_id and id <> new.id and is_current;`
  - `course_sections_revision` (`before update`, quand `title`, `content_md` ou `data` diffèrent) : insère l'ancienne valeur dans `course_section_revisions` (`version = old.version`, `edited_by = coalesce(current_setting('learny.actor', true), 'tutor')::actor`) puis `new.version := old.version + 1`. Les services positionnent `set local learny.actor = 'learner'` lors d'une correction de l'apprenant.
  - `owner_consistency` (une fonction générique `public.assert_same_owner()` paramétrée par `TG_ARGV`) sur `course_sections` (vs `courses.owner_id`), `citations` (vs section), `tutor_messages` (vs conversation), `chapter_summaries` et `reading_progress` (vs `courses.owner_id` quand `course_id` non nul) : refuse une incohérence (`owner_mismatch`, 23514).
  - `tutor_messages_touch_conversation` (`after insert`) : `update tutor_conversations set updated_at = now()`.
- **ET-4 — Schémas Zod** (`courses.json-schemas.ts`) pour `course_sections.data` selon `kind` : `flash_question` `{ question ≤ 500, answer ≤ 1000 }` ; `dont_confuse` `{ left: {title ≤ 80, body ≤ 400, example ≤ 200}, right: idem }` ; `retain` `{ points: string[3..7] (≤ 200), diagram?: { blocks: [{id, label ≤ 60}] (1..8), arrows: [{from, to, label?}] }, mnemonic?: string ≤ 300 }` ; `text`, `tutor_completed`, `summary_prompt` → `data` nul. `chapterSummaryFeedbackSchema` `{ verdict: 'good'|'partial'|'insufficient', message ≤ 1000, missing: string[] ≤ 10 }` ; `tutorMessageSourceSchema` `{ chunkId?: uuid, resourceId?: uuid, label ≤ 120, location? }` ; `selfTestSchema` `{ question, notionId, expected?, answer?, correct?: boolean, answeredAt? }`.
- **ET-5 — Types exportés** : `Course`, `CourseSection`, `CourseSectionRevision`, `Citation`, `ReadingProgress`, `ChapterSummary`, `TutorConversation`, `TutorMessage`.

## 7. Comportements attendus et cas limites

- **CL-1** — Deux insertions concurrentes de versions courantes pour le même module : la seconde attend le verrou de ligne puis bascule la première ; à la fin, une seule version courante (vérifié avec deux connexions).
- **CL-2** — Mise à jour forcée `is_current = true` sur deux lignes dans la même instruction → l'index partiel refuse (23505).
- **CL-3** — Ancre `Postes-Et-Cles` ou dupliquée dans le cours → 23514 / 23505.
- **CL-4** — Correction d'une section trois fois → `version = 4`, trois révisions (1, 2, 3).
- **CL-5** — Suppression logique de la ressource citée (SPEC-104) → passages supprimés → `citations.chunk_id` nul, citation conservée ; suppression physique de la ressource → `resource_id` nul.
- **CL-6** — `percent = 101` → 23514.
- **CL-7** — Message de tuteur dont `user_id` diffère de celui de la discussion → `owner_mismatch`.
- **CL-8** — Suppression d'un module → ses cours (toutes versions), sections, révisions, citations, progressions et discussions sont supprimés en cascade.
- **CL-9** — Résumé de 2 001 caractères → 23514.

## 8. Instructions d'implémentation

1. Écrire `packages/db/src/schema/courses.ts` et `courses.json-schemas.ts` (ET-1, ET-2, ET-4, ET-5).
2. `pnpm db:generate --name courses_conversations` ; vérifier le SQL.
3. `pnpm db:migration:custom courses_rules` (ET-3).
4. Ajouter à la fabrique `packages/db/src/testing/programme.ts` une fonction `createTestCourse(tx, { ownerId, moduleId, sectionsPerChapter })`.
5. Tests, page de démonstration, e2e.
6. Commits : `feat(SPEC-105): ajoute le schéma des cours et discussions` ; `feat(SPEC-105): ajoute versions courantes et révisions de sections` ; `test(SPEC-105): couvre versions, citations et discussions` ; `feat(SPEC-105): ajoute la page de démonstration`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/db/src/schema/courses.ts`, `courses.json-schemas.ts`, `courses.test.ts` ; migrations `NNNN_courses_conversations.sql`, `NNNN_courses_rules.sql` (+ copies) ; `packages/db/test/integration/courses.test.ts` ; `apps/web/app/_dev/sdd/SPEC-105/page.tsx` ; `apps/web/e2e/specs/p1/spec-105-courses.spec.ts`.
- **Modifiés** : `packages/db/src/schema/index.ts`, `packages/db/src/testing/programme.ts`.
- **Lus** : data-model §4, ADR-0040, ADR-0039.

## 10. Interface et conformité visuelle

Mode `demo`. Page `/_dev/sdd/SPEC-105` :
- `h1` « SPEC-105 · Cours et discussions ».
- Carte « Versions du cours » (`data-testid="course-versions"`) : génération de la version 1 puis 2 d'un cours de test ; tableau version / statut / courante (attendu : v1 non courante, v2 courante).
- Carte « Révisions d'une section » (`data-testid="section-revisions"`) : section « L'en-tête de pièce » corrigée deux fois ; versions 1, 2 listées, version courante 3.
- Carte « Citation après suppression » (`data-testid="citation-orphan"`) : libellé « Guide FI, p. 4 » puis, après suppression logique de la ressource, « source supprimée » (chunk nul).
- Carte « Discussion » (`data-testid="conversation"`) : 2 messages (apprenant, tuteur) avec sources.
- Contrôles visuels : contrôles 1, 2, 4.

## 11. Critères d'acceptation

- **CA-1** — Tables, énumérations, index (dont l'index unique partiel) et déclencheurs présents.
- **CA-2** — Une seule version courante par `(owner_id, module_id)`, y compris en concurrence (EF-1, CL-1, CL-2) ; les versions précédentes et leurs citations sont conservées (BR-COU-10).
- **CA-3** — La correction d'une section crée une révision et incrémente la version (EF-4, CL-4).
- **CA-4** — Les citations survivent à la suppression de leur source avec références nulles (EF-5, CL-5).
- **CA-5** — Les contraintes (ancre, pourcentage, longueurs, cohérence propriétaire) sont appliquées (CL-3, CL-6, CL-7, CL-9).
- **CA-6** — Cascades de suppression conformes (CL-8, EF-7).
- **CA-7** — Page de démonstration filmée ; `@visual` réussi.

## 12. Plan de tests

- **Unitaires** — `packages/db/src/schema/courses.test.ts`, `describe('[SPEC-105] schémas du cours')` : schémas `data` par `kind` (3 à 7 points pour `retain`, bornes), `chapterSummaryFeedbackSchema`, `selfTestSchema`, expression de l'ancre (cas valides/invalides).
- **Intégration** — `packages/db/test/integration/courses.test.ts`, `describe('[SPEC-105] cours et discussions')` : CA-1 ; CA-2 (bascule, concurrence avec deux connexions, CL-2) ; CA-3 (avec `learny.actor = 'learner'` → `edited_by = learner`) ; CA-4 ; CA-5 ; CA-6.
- **End-to-end** — `apps/web/e2e/specs/p1/spec-105-courses.spec.ts`, `test('versions, révisions et citations @SPEC-105', …)` ; vidéo.
- **Visuel** — `test('page cours conforme @SPEC-105 @visual', …)`.
- **Non-régression** : `[SPEC-101]` à `[SPEC-104]`.
- **Traçabilité** : CA-1 à CA-6 → intégration ; CA-2, CA-3, CA-4 → aussi e2e ; CA-7 → e2e + `@visual` ; CA-5 → unitaires + intégration.

## 13. Preuves attendues

Vidéo e2e, capture de la page, rapport d'intégration montrant le test de concurrence.

## 14. Définition de terminé

Définition commune ; conventions de schéma vertes ; documentation de `learny.actor` dans `packages/db/README.md`.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0040 (une discussion par ouverture, conservée et privée), ADR-0039, ADR-0112.
- **ADR-0113** : ajout de `courses.formation_id`, `course_sections.owner_id`, `citations.owner_id`, `tutor_messages.user_id`, `chapter_summaries.course_id`, table `course_section_revisions`, énumération `citation_media` (au lieu d'un texte libre), `citations.label` et `media_kind` obligatoires, `tutor_conversations.updated_at`, réutilisation de `message_role` pour `tutor_messages.role`.
- Hypothèse : la variable de session `learny.actor` (`tutor` par défaut) identifie l'auteur d'une correction ; elle est positionnée par les services (SPEC-609).
