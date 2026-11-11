# Modèle de données (Postgres / Supabase)

Normatif. Implémenté dans `packages/db/src/schema/*.ts` (Drizzle) par les spécifications SPEC-102 à SPEC-112 ; politiques RLS par SPEC-113. Conventions (ADR-0022) :

- Clés primaires `id uuid default gen_random_uuid()` sauf mention contraire ; clés étrangères `on delete cascade` vers le propriétaire, `restrict` ailleurs sauf mention.
- Colonnes `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` (trigger `set_updated_at`) sur toutes les tables mutables.
- Énumérations : `pgEnum` Drizzle, valeurs en anglais `snake_case`.
- Toute table contenant des données d'un utilisateur porte `user_id` (ou `owner_id`) indexé, utilisé par RLS.
- Textes libres limités par `check (char_length(x) <= N)` quand une borne métier existe.
- Montants monétaires en `numeric(12,6)` USD.
- Les migrations sont générées par `drizzle-kit generate` dans `packages/db/migrations/` puis copiées dans `supabase/migrations/` (SPEC-101). Extensions : `pgcrypto`, `vector`, `unaccent`, `pg_trgm`.

## 1. Identité et préférences (SPEC-102)

**profiles** — `id uuid pk references auth.users(id) on delete cascade`, `email text not null`, `first_name text check(len ≤ 60)`, `last_name text check(len ≤ 60)`, `course_language course_language not null default 'fr'` (`fr|en|es|de`), `tutor_tone tutor_tone not null default 'vous'` (`vous|tu`), `timezone text not null default 'Europe/Paris'`, `onboarding_step onboarding_step not null default 'profil'` (`profil|rythme|ia|rappels|depart|done`), `onboarding_completed_at timestamptz`, `terms_version text`, `terms_accepted_at timestamptz`, `current_formation_id uuid null references formations(id) on delete set null`, `deletion_requested_at timestamptz`, `deletion_scheduled_for timestamptz`, `sidebar_collapsed boolean not null default false`, timestamps. Trigger `on auth.users insert` → crée le profil + les lignes par défaut ci-dessous.

**study_preferences** — `user_id uuid pk → profiles`, `hours_per_day smallint not null default 2 check(1..6)`, `study_days smallint[] not null default '{1,2,3,4,5}'` (ISO 1=lundi … 7=dimanche, non vide), `preferred_slots study_slot[] not null default '{soir}'` (`matin|apres_midi|soir`, non vide), `updated_at`.

**notification_settings** — `user_id pk`, `channel_email bool default true`, `channel_push bool default true`, `type_revision bool default true`, `type_validation bool default true`, `type_course bool default true`, `type_gap bool default true`, `type_planning bool default true`, `type_relaunch bool default true`, `digest_time time default '08:00'`, `quiet_start time default '21:00'`, `quiet_end time default '08:00'`, `weekend_quiet bool default true`, `max_per_day smallint default 5 check(in (3,5,8))`, `updated_at`.

**push_subscriptions** — `id`, `user_id`, `endpoint text unique not null`, `p256dh text`, `auth text`, `user_agent text`, `created_at`, `last_success_at`, `failure_count smallint default 0`.

**automation_settings** — `user_id`, `key automation_key` (`reprise|micro_seance|echauffement|remediation|jeu_lacune|questions_cartes|plafond_quiz|sprint|bilan|pause`), `enabled bool default true`, `params jsonb not null` (schéma par clé dans `packages/contracts/automations.ts`, valeurs par défaut de BR-AUT-*), `updated_at` ; `pk(user_id, key)`.

**pauses** — `id`, `user_id`, `starts_on date not null`, `ends_on date not null check(ends_on >= starts_on)`, `diagnostic_on_return bool default true`, `status pause_status default 'active'` (`active|ended|cancelled`), `ended_at`, `created_at`.

## 2. Formations, programme, notions (SPEC-103)

**formations** — `id`, `owner_id → profiles`, `group_id uuid null → groups`, `title text not null check(1..120)`, `description text check(≤ 2000)`, `objectives formation_objective[] not null default '{}'` (`operational|exam|dialogue|project`), `status formation_status not null default 'cadrage'` (`cadrage|programme_proposed|active|paused|completed|archived`), `cadrage_profile jsonb not null default '{}'` (clés `scope`, `starting_point`, `target_level`, `volume`, `dates` : `{ value: string|null, state: 'todo'|'waiting'|'done' }`), `volume_hours smallint`, `start_date date`, `end_date date`, `study_override jsonb null` (rythme spécifique), `default_threshold smallint not null default 80 check(60..95)`, `exam_format jsonb null` (`{ questions:int, durationMin:int, threshold:int, sourceResourceId?:uuid, confirmed:bool }`), `maintenance_mode maintenance_mode null` (`light|stopped`), `course_language course_language not null`, `last_opened_at timestamptz`, `paused_at`, `completed_at`, timestamps. Index `(owner_id, status)`.

**cadrage_messages** — `id`, `formation_id`, `role message_role` (`tutor|learner`), `content text not null`, `question_key text null` (`scope|starting_point|target_level|volume|dates|other`), `suggestions jsonb null` (`[{label, value, multi?:bool}]`), `position int`, `created_at`.

**programme_imports** — `id`, `formation_id`, `source_kind import_kind` (`file|text`), `resource_id uuid null → resources`, `raw_text text`, `parsed jsonb null`, `status job_status` (`queued|running|done|failed`), `error text`, `created_at`.

**programme_change_requests** — `id`, `formation_id`, `user_id`, `message text not null`, `status job_status`, `result_summary text`, `created_at` (« Ajuster avec le tuteur »).

**modules** — `id`, `formation_id`, `position smallint not null`, `title text not null`, `objectives text[] not null default '{}'`, `planned_start date`, `planned_end date`, `threshold smallint not null check(60..95)`, `status module_status not null default 'locked'` (`locked|open|validated`), `opened_at`, `validated_at`, `unique(formation_id, position)`.

**chapters** — `id`, `module_id`, `position smallint`, `title text not null`, `unique(module_id, position)`. *(le statut d'apports est par utilisateur : voir `chapter_progress`)*

**chapter_progress** — `user_id`, `chapter_id`, `contributions_status contrib_status default 'in_progress'` (`in_progress|done`), `done_at`, `pk(user_id, chapter_id)`.

**module_progress** — `user_id`, `module_id`, `status module_status` (par membre pour les formations à plusieurs), `opened_at`, `validated_at`, `best_score numeric(5,2)`, `pk(user_id, module_id)`. *(Pour une formation individuelle, `modules.status` est le miroir de `module_progress` du propriétaire ; la source de vérité est `module_progress`.)*

**notions** — `id`, `formation_id`, `module_id`, `chapter_id`, `label text not null check(≤ 120)`, `short_definition text check(≤ 400)`, `position smallint`, `created_by actor` (`tutor|learner|import`), `created_at`. Index FTS `to_tsvector('simple', unaccent(label || ' ' || coalesce(short_definition,'')))`.

**notion_links** — `id`, `formation_id`, `from_notion_id`, `to_notion_id`, `kind link_kind` (`prerequisite|confusion|tutor`), `owner_id uuid null` (null = lien du programme ; non null = lien personnel, ex. confusion détectée pour un apprenant), `rationale text`, `unique(from_notion_id, to_notion_id, kind, owner_id)`, `check(from_notion_id <> to_notion_id)`.

## 3. Ressources et passages (SPEC-104)

**resources** — `id`, `owner_id`, `formation_id`, `chapter_id uuid null`, `kind resource_kind` (`note|pdf|web|youtube|image|audio|video|exam_guide`), `origin resource_origin` (`learner|tutor_suggestion`), `suggestion_status suggestion_status null` (`pending|imported|dismissed`), `title text not null`, `content_text text null` (notes, transcriptions), `storage_path text null` (bucket `resources`), `url text null`, `mime text`, `size_bytes bigint`, `status resource_status default 'queued'` (`queued|processing|ready|failed`), `error_code text`, `error_message text`, `metadata jsonb default '{}'` (`pages`, `durationSec`, `language`, `youtubeId`, `siteName`, `anthropicFileId`), `deleted_at`, timestamps. Index `(owner_id, chapter_id)`.

**resource_chunks** — `id`, `resource_id`, `owner_id`, `position int`, `text text not null`, `location jsonb not null` (`{page?, startSec?, endSec?, anchor?, charStart, charEnd}`), `token_count int`, `embedding vector(1024)`, `created_at`. Index HNSW `embedding vector_cosine_ops`, index `(owner_id, resource_id)`.

## 4. Cours (SPEC-105)

**courses** — `id`, `owner_id`, `module_id`, `version int not null`, `is_current bool not null default true`, `status course_status` (`generating|ready|failed`), `model text`, `error text`, `created_at`, `unique(owner_id, module_id, version)`, index partiel unique `(owner_id, module_id) where is_current`.

**course_sections** — `id`, `course_id`, `chapter_id`, `position int`, `kind section_kind` (`text|flash_question|dont_confuse|tutor_completed|retain|summary_prompt`), `anchor text` (slug pour le sommaire), `title text`, `content_md text`, `data jsonb` (question éclair : `{question, answer}` ; ne pas confondre : `{left:{title,body,example}, right:{...}}` ; à retenir : `{points[], diagram?:{blocks[],arrows[]}, mnemonic?}`), `notion_ids uuid[] not null default '{}'`, `origin content_origin` (`resource|tutor`), `version int default 1`, `reported bool default false`, timestamps.

**citations** — `id`, `section_id`, `chunk_id uuid null → resource_chunks on delete set null`, `resource_id uuid null`, `quote text`, `location jsonb`, `label text` (ex. « Guide FI, p. 4 »), `media_kind text` (`pdf|audio|video|web|note|image`).

**reading_progress** — `user_id`, `course_id`, `chapter_id`, `percent smallint check(0..100)`, `seconds_spent int default 0`, `updated_at`, `pk(user_id, course_id, chapter_id)`.

**chapter_summaries** — `id`, `user_id`, `chapter_id`, `text text check(≤ 2000)`, `feedback jsonb` (`{verdict:'good'|'partial'|'insufficient', message, missing:[]}`), `created_at`.

**tutor_conversations** — `id`, `user_id`, `course_id`, `title text`, `created_at`. **tutor_messages** — `id`, `conversation_id`, `role` (`learner|tutor`), `content text`, `context jsonb` (éléments inclus), `sources jsonb` (citations), `follow_ups text[]`, `self_test jsonb null`, `created_at`.

## 5. Briques, activités, tentatives (SPEC-106)

**bricks** — `id`, `owner_id`, `formation_id`, `type brick_type` (`text|resource_excerpt|choice_question|open_question|cloze|matching|ordering|categorization|recall_card|instruction|scripted_dialogue|timer|scoring`), `notion_ids uuid[] not null default '{}'`, `purpose brick_purpose` (`course|validation|bank|remediation|exercise|exam|warmup|review`), `status brick_status default 'active'` (`active|reported|retired`), `current_version int default 1`, `created_at`.

**brick_versions** — `id`, `brick_id`, `version int`, `payload jsonb not null` (validé par `packages/bricks/<type>/schema.ts`), `fingerprint text` (SHA-256, questions uniquement), `origin content_origin`, `created_by actor`, `created_at`, `unique(brick_id, version)`, index `(fingerprint)`.

**brick_reports** — `id`, `user_id`, `brick_id`, `brick_version_id`, `reason text check(≤ 500)`, `status report_status` (`open|corrected|dismissed`), `resolution jsonb`, `created_at`, `resolved_at`.

**activities** — `id`, `owner_id`, `formation_id`, `module_id uuid null`, `kind activity_kind` (`course|validation_quiz|global_quiz_session|remediation|exercise|mock_exam|warmup|micro_session|sprint|self_test|scripted_dialogue|project_step`), `config jsonb` (`{threshold?, durationSec?, questionCount?, scoring?, hintsMax?, examFormat?, diagnosticModuleIds?}`), `items jsonb not null` (liste ordonnée `[{brickId, brickVersionId, points?}]`), `status activity_status` (`draft|ready|archived`), `for_date date null` (sessions quotidiennes), `created_at`.

**attempts** — `id`, `user_id`, `activity_id`, `attempt_no int`, `status attempt_status` (`in_progress|submitted|graded|timed_out|abandoned`), `started_at`, `deadline_at timestamptz null` (examen), `submitted_at`, `duration_ms int`, `score numeric(5,2)`, `passed bool`, `per_notion jsonb` (`{[notionId]: {correct, total, score}}`), `hints_used smallint default 0`, `review_feedback jsonb` (synthèse tuteur), `unique(activity_id, user_id, attempt_no)`.

**answers** — `id`, `attempt_id`, `brick_version_id`, `position int`, `response jsonb`, `is_correct bool null`, `score numeric(5,2)`, `max_score numeric(5,2)`, `time_ms int`, `graded_by grader` (`code|tutor`), `feedback jsonb` (`{explanation, criteria:[{key, ok, comment}], missing:[]}`), `chosen_distractor_notion_id uuid null`, `marked_for_review bool default false`, `answered_at`, `unique(attempt_id, position)`.

## 6. Mémorisation et lacunes (SPEC-107)

**notion_states** — `user_id`, `notion_id`, `fsrs jsonb not null` (carte `ts-fsrs` sérialisée : `due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review`), `due_at timestamptz` (copie indexée), `mastery numeric(5,2) default 0`, `first_seen_at`, `last_seen_at`, `success_count int default 0`, `gap_nature gap_nature null` (`forgetting|confusion|misunderstanding|application`), `gap_confused_with uuid null → notions`, `gap_detected_at`, `gap_evidence text`, `gap_cleared_at`, `suspended bool default false`, `in_review bool default false` (ajoutée au quiz global), `pk(user_id, notion_id)`. Index `(user_id, due_at) where in_review`.

**review_logs** — `id`, `user_id`, `notion_id`, `answer_id uuid null`, `source review_source` (`validation|global_quiz|warmup|exercise|exam|self_test|micro_session|sprint|offline`), `grade fsrs_grade` (`again|hard|good|easy`), `correct bool`, `time_ms int`, `reviewed_at timestamptz`, `fsrs_before jsonb`, `fsrs_after jsonb`.

**gap_events** — `id`, `user_id`, `notion_id`, `kind` (`detected|nature_changed|cleared`), `nature gap_nature null`, `evidence jsonb`, `created_at`.

## 7. Agenda, automatismes, série (SPEC-108)

**schedule_slots** — `id`, `user_id`, `formation_id`, `module_id uuid null`, `kind slot_kind` (`contributions|course|exercise|validation_quiz|global_quiz|revision|buffer|sprint|mock_exam|warmup|micro_session|weekly_review`), `title text`, `meta text`, `starts_at timestamptz`, `ends_at timestamptz check(ends_at > starts_at)`, `status slot_status default 'planned'` (`planned|done|missed|moved|cancelled`), `activity_id uuid null`, `created_by slot_creator` (`planner|automation|learner`), `moved_from_id uuid null`, `group_milestone bool default false`, timestamps. Index `(user_id, starts_at)`.

**automation_actions** — `id`, `user_id`, `formation_id uuid null`, `automation automation_key`, `kind text` (ex. `slot_rescheduled`, `reprise_proposed`, `plan_lightened`, `card_created`, `quiz_smoothed`, `sprint_planned`, `remediation_ready`, `game_chosen`, `micro_session_proposed`, `weekly_review`, `pause_started`, `pause_ended`), `summary text not null` (une ligne, ton de l'utilisateur), `payload jsonb`, `undo_payload jsonb null`, `requires_consent bool default false`, `status automation_status` (`pending_consent|applied|declined|undone|expired|consumed`), `decided_at`, `created_at`. Index `(user_id, created_at desc)`.

**daily_activity** — `user_id`, `day date`, `minutes int default 0`, `qualifying bool default false` (compte pour la série), `sources text[]`, `pk(user_id, day)`.

**milestones** — `id`, `user_id`, `formation_id uuid null`, `key milestone_key` (`module_validated|notions_100|streak_30`), `ref_id uuid null`, `achieved_at`, `unique(user_id, key, ref_id)`.

## 8. Notifications (SPEC-109)

**notifications** — `id`, `user_id`, `formation_id uuid null`, `type notification_type` (`validation_soon|course_ready|global_quiz_today|new_gap|session_planned|module_validated|session_to_reschedule|weekly_review|milestone|ai_cost_alert|ai_task_failed|export_ready|group_invitation|daily_digest|relaunch|planning_adjusted`), `title text`, `body text`, `href text`, `icon text`, `dedupe_key text null`, `read_at`, `created_at`, `unique(user_id, dedupe_key)`.

**notification_deliveries** — `id`, `notification_id`, `channel` (`email|push`), `status delivery_status` (`scheduled|sent|deferred_quiet|capped|failed|skipped_pref`), `scheduled_for`, `sent_at`, `error text`.

## 9. IA et facturation (SPEC-110)

**ai_credentials** — `id`, `user_id`, `provider ai_provider` (`anthropic|openai|mistral|deepseek|openai_compatible|local`), `label text`, `base_url text null`, `model_ids text[]`, `encrypted_key bytea null` (AES-256-GCM : iv‖tag‖ciphertext), `key_last4 text`, `status credential_status` (`untested|qualified|failed`), `qualification jsonb` (rapport par test), `outside_eu bool`, `qualified_at`, timestamps.

**ai_task_models** — `user_id`, `task ai_task` (`programme|course|gaps|tutor|light`), `credential_id uuid null` (null = IA fournie), `model_id text not null`, `pk(user_id, task)`.

**ai_calls** — `id`, `user_id`, `formation_id uuid null`, `task ai_task`, `provider ai_provider`, `model text`, `managed bool` (IA fournie), `input_tokens int`, `output_tokens int`, `cache_read_tokens int`, `cache_write_tokens int`, `cost_usd numeric(12,6)`, `latency_ms int`, `status` (`ok|error|refused|capped|invalid_output`), `error_code text`, `batch bool default false`, `created_at`. Index `(user_id, created_at)`.

**subscriptions** — `user_id pk`, `stripe_customer_id text unique`, `stripe_subscription_id text unique null`, `status subscription_status` (`none|active|past_due|canceled|incomplete`), `current_period_end timestamptz`, `daily_cap_usd numeric(12,6) not null default 1.50`, `updated_at`. Vue `ai_spend_today(user_id, spent_usd)` (fuseau utilisateur).

## 10. Groupes (SPEC-111)

**groups** — `id`, `formation_id uuid unique`, `owner_id`, `invite_code text unique not null` (`LRN-` + 4 caractères `[A-Z2-9]`), `max_members smallint default 10`, `created_at`, `code_rotated_at`.

**group_members** — `group_id`, `user_id`, `role group_role` (`owner|member`), `member_status formation_status` (statut de la formation **pour ce membre** : `active|paused|completed`), `joined_at`, `left_at`, `pk(group_id, user_id)`.

Modèle de partage (ADR-0035) : les membres partagent **la même ligne `formations`** et donc les mêmes `modules`, `chapters`, `notions` et `notion_links` de programme ; tout ce qui est personnel est porté par des tables indexées par `user_id` (`module_progress`, `chapter_progress`, `resources`, `courses`, `bricks`, `attempts`, `notion_states`, `schedule_slots`, `tutor_conversations`). Quand un membre quitte le groupe, le service copie le programme dans une nouvelle formation individuelle et y rattache ses données personnelles (SPEC-724). Le nombre de formations actives d'un utilisateur = formations possédées au statut `active` + appartenances dont `member_status = 'active'`.

Vue `group_member_progress` (security definer, filtrée par appartenance) : `group_id, user_id, first_name, current_module_position, validated_modules, streak_days`.

## 11. Données personnelles et recherche (SPEC-112)

**data_exports** — `id`, `user_id`, `status job_status`, `storage_path text`, `expires_at`, `size_bytes`, `created_at`.

**legal_acceptances** — `id`, `user_id`, `document` (`cgu|privacy`), `version text`, `accepted_at`.

Fonction `search_user_content(q text, limit int)` (security invoker) : recherche plein texte `unaccent` + trigrammes sur `formations.title`, `notions.label/short_definition`, `course_sections.title/content_md` (cours courant) de l'utilisateur ; renvoie `{kind, id, title, snippet, href, rank}`.

## 12. Limitation de débit et idempotence (SPEC-201, 208)

**idempotency_keys** — `key text`, `user_id`, `route text`, `request_hash text not null` (empreinte SHA-256, ADR-0120), `response jsonb`, `status_code int` (`0` = en cours), `created_at`, `completed_at timestamptz null`, `pk(user_id, key)` ; purge à 24 h (ADR-0219).

**rate_limits** — `bucket text pk` (`user:<id>:<route>` ou `ip:<hash>:<route>`), `tokens numeric`, `updated_at`.
