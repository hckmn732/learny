CREATE TYPE "public"."cadrage_key" AS ENUM('scope', 'starting_point', 'target_level', 'volume', 'dates', 'other');--> statement-breakpoint
CREATE TYPE "public"."contrib_status" AS ENUM('in_progress', 'done');--> statement-breakpoint
CREATE TYPE "public"."formation_objective" AS ENUM('operational', 'exam', 'dialogue', 'project');--> statement-breakpoint
CREATE TYPE "public"."formation_status" AS ENUM('cadrage', 'programme_proposed', 'active', 'paused', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."import_kind" AS ENUM('file', 'text');--> statement-breakpoint
CREATE TYPE "public"."link_kind" AS ENUM('prerequisite', 'confusion', 'tutor');--> statement-breakpoint
CREATE TYPE "public"."maintenance_mode" AS ENUM('light', 'stopped');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('tutor', 'learner');--> statement-breakpoint
CREATE TYPE "public"."module_status" AS ENUM('locked', 'open', 'validated');--> statement-breakpoint
CREATE TABLE "cadrage_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"formation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"question_key" "cadrage_key",
	"suggestions" jsonb,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cadrage_messages_formation_id_position_unique" UNIQUE("formation_id","position"),
	CONSTRAINT "cadrage_messages_content_length_check" CHECK (char_length("cadrage_messages"."content") between 1 and 4000),
	CONSTRAINT "cadrage_messages_suggestions_check" CHECK ("cadrage_messages"."suggestions" is null or jsonb_typeof("cadrage_messages"."suggestions") = 'array'),
	CONSTRAINT "cadrage_messages_position_check" CHECK ("cadrage_messages"."position" >= 1)
);
--> statement-breakpoint
CREATE TABLE "chapter_progress" (
	"user_id" uuid NOT NULL,
	"chapter_id" uuid NOT NULL,
	"contributions_status" "contrib_status" DEFAULT 'in_progress' NOT NULL,
	"done_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chapter_progress_user_id_chapter_id_pk" PRIMARY KEY("user_id","chapter_id"),
	CONSTRAINT "chapter_progress_done_at_check" CHECK (("chapter_progress"."contributions_status" = 'done') = ("chapter_progress"."done_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"formation_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chapters_id_module_id_unique" UNIQUE("id","module_id"),
	CONSTRAINT "chapters_position_unique" UNIQUE("module_id","position"),
	CONSTRAINT "chapters_position_check" CHECK ("chapters"."position" >= 1),
	CONSTRAINT "chapters_title_length_check" CHECK (char_length("chapters"."title") between 1 and 160)
);
--> statement-breakpoint
CREATE TABLE "formations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"group_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"objectives" "formation_objective"[] DEFAULT '{}'::public.formation_objective[] NOT NULL,
	"status" "formation_status" DEFAULT 'cadrage' NOT NULL,
	"cadrage_profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"volume_hours" smallint,
	"start_date" date,
	"end_date" date,
	"study_override" jsonb,
	"default_threshold" smallint DEFAULT 80 NOT NULL,
	"exam_format" jsonb,
	"maintenance_mode" "maintenance_mode",
	"course_language" "course_language" DEFAULT 'fr' NOT NULL,
	"last_opened_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "formations_title_length_check" CHECK (char_length("formations"."title") between 1 and 120),
	CONSTRAINT "formations_description_length_check" CHECK (char_length("formations"."description") <= 2000),
	CONSTRAINT "formations_cadrage_profile_check" CHECK (jsonb_typeof("formations"."cadrage_profile") = 'object'),
	CONSTRAINT "formations_volume_hours_check" CHECK ("formations"."volume_hours" between 1 and 2000),
	CONSTRAINT "formations_study_override_check" CHECK ("formations"."study_override" is null or jsonb_typeof("formations"."study_override") = 'object'),
	CONSTRAINT "formations_default_threshold_check" CHECK ("formations"."default_threshold" between 60 and 95),
	CONSTRAINT "formations_exam_format_check" CHECK ("formations"."exam_format" is null or jsonb_typeof("formations"."exam_format") = 'object'),
	CONSTRAINT "formations_dates_order" CHECK ("formations"."end_date" is null or "formations"."start_date" is null or "formations"."end_date" >= "formations"."start_date"),
	CONSTRAINT "formations_objectives_required" CHECK ("formations"."status" = 'cadrage' or cardinality("formations"."objectives") >= 1),
	CONSTRAINT "formations_objectives_unique" CHECK (public.enum_array_is_set("formations"."objectives"::text[])),
	CONSTRAINT "formations_maintenance_only_completed" CHECK ("formations"."maintenance_mode" is null or "formations"."status" = 'completed')
);
--> statement-breakpoint
CREATE TABLE "module_progress" (
	"user_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"status" "module_status" DEFAULT 'locked' NOT NULL,
	"opened_at" timestamp with time zone,
	"validated_at" timestamp with time zone,
	"best_score" numeric(5, 2),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "module_progress_user_id_module_id_pk" PRIMARY KEY("user_id","module_id"),
	CONSTRAINT "module_progress_best_score_check" CHECK ("module_progress"."best_score" between 0 and 100),
	CONSTRAINT "module_progress_validated_at_check" CHECK ("module_progress"."status" <> 'validated' or "module_progress"."validated_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"formation_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"title" text NOT NULL,
	"objectives" text[] DEFAULT '{}'::text[] NOT NULL,
	"planned_start" date,
	"planned_end" date,
	"threshold" smallint DEFAULT 80 NOT NULL,
	"status" "module_status" DEFAULT 'locked' NOT NULL,
	"opened_at" timestamp with time zone,
	"validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "modules_id_formation_id_unique" UNIQUE("id","formation_id"),
	CONSTRAINT "modules_position_unique" UNIQUE("formation_id","position"),
	CONSTRAINT "modules_position_check" CHECK ("modules"."position" >= 1),
	CONSTRAINT "modules_title_length_check" CHECK (char_length("modules"."title") between 1 and 160),
	CONSTRAINT "modules_threshold_check" CHECK ("modules"."threshold" between 60 and 95),
	CONSTRAINT "modules_planned_dates_check" CHECK ("modules"."planned_end" is null or "modules"."planned_start" is null or "modules"."planned_end" >= "modules"."planned_start")
);
--> statement-breakpoint
CREATE TABLE "notion_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"formation_id" uuid NOT NULL,
	"from_notion_id" uuid NOT NULL,
	"to_notion_id" uuid NOT NULL,
	"kind" "link_kind" NOT NULL,
	"owner_id" uuid,
	"rationale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notion_links_unique" UNIQUE NULLS NOT DISTINCT("from_notion_id","to_notion_id","kind","owner_id"),
	CONSTRAINT "notion_links_no_self" CHECK ("notion_links"."from_notion_id" <> "notion_links"."to_notion_id"),
	CONSTRAINT "notion_links_confusion_canonical" CHECK ("notion_links"."kind" <> 'confusion' or "notion_links"."from_notion_id" < "notion_links"."to_notion_id"),
	CONSTRAINT "notion_links_rationale_length_check" CHECK (char_length("notion_links"."rationale") <= 500)
);
--> statement-breakpoint
CREATE TABLE "notions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"formation_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"chapter_id" uuid NOT NULL,
	"label" text NOT NULL,
	"short_definition" text,
	"position" smallint DEFAULT 1 NOT NULL,
	"created_by" "actor" DEFAULT 'tutor' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notions_position_unique" UNIQUE("chapter_id","position"),
	CONSTRAINT "notions_label_length_check" CHECK (char_length("notions"."label") between 1 and 120),
	CONSTRAINT "notions_short_definition_length_check" CHECK (char_length("notions"."short_definition") <= 400),
	CONSTRAINT "notions_position_check" CHECK ("notions"."position" >= 1)
);
--> statement-breakpoint
CREATE TABLE "programme_change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"formation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"message" text NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"result_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "programme_change_requests_message_length_check" CHECK (char_length("programme_change_requests"."message") between 1 and 2000),
	CONSTRAINT "programme_change_requests_result_summary_length_check" CHECK (char_length("programme_change_requests"."result_summary") <= 4000)
);
--> statement-breakpoint
CREATE TABLE "programme_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"formation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"source_kind" "import_kind" NOT NULL,
	"resource_id" uuid,
	"raw_text" text,
	"parsed" jsonb,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "programme_imports_raw_text_length_check" CHECK (char_length("programme_imports"."raw_text") <= 200000),
	CONSTRAINT "programme_imports_error_length_check" CHECK (char_length("programme_imports"."error") <= 2000),
	CONSTRAINT "programme_imports_source_kind_check" CHECK (("programme_imports"."source_kind" = 'text') = ("programme_imports"."raw_text" is not null))
);
--> statement-breakpoint
ALTER TABLE "cadrage_messages" ADD CONSTRAINT "cadrage_messages_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cadrage_messages" ADD CONSTRAINT "cadrage_messages_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_progress" ADD CONSTRAINT "chapter_progress_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_progress" ADD CONSTRAINT "chapter_progress_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_module_id_formation_id_fk" FOREIGN KEY ("module_id","formation_id") REFERENCES "public"."modules"("id","formation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formations" ADD CONSTRAINT "formations_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_progress" ADD CONSTRAINT "module_progress_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_progress" ADD CONSTRAINT "module_progress_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_links" ADD CONSTRAINT "notion_links_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_links" ADD CONSTRAINT "notion_links_from_notion_id_notions_id_fk" FOREIGN KEY ("from_notion_id") REFERENCES "public"."notions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_links" ADD CONSTRAINT "notion_links_to_notion_id_notions_id_fk" FOREIGN KEY ("to_notion_id") REFERENCES "public"."notions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_links" ADD CONSTRAINT "notion_links_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notions" ADD CONSTRAINT "notions_module_id_formation_id_fk" FOREIGN KEY ("module_id","formation_id") REFERENCES "public"."modules"("id","formation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notions" ADD CONSTRAINT "notions_chapter_id_module_id_fk" FOREIGN KEY ("chapter_id","module_id") REFERENCES "public"."chapters"("id","module_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programme_change_requests" ADD CONSTRAINT "programme_change_requests_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programme_change_requests" ADD CONSTRAINT "programme_change_requests_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programme_imports" ADD CONSTRAINT "programme_imports_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programme_imports" ADD CONSTRAINT "programme_imports_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cadrage_messages_user_id_idx" ON "cadrage_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chapter_progress_chapter_id_idx" ON "chapter_progress" USING btree ("chapter_id");--> statement-breakpoint
CREATE INDEX "chapters_formation_id_idx" ON "chapters" USING btree ("formation_id");--> statement-breakpoint
CREATE INDEX "formations_owner_status_idx" ON "formations" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "formations_group_id_idx" ON "formations" USING btree ("group_id") WHERE "formations"."group_id" is not null;--> statement-breakpoint
CREATE INDEX "module_progress_module_id_idx" ON "module_progress" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "notion_links_formation_id_idx" ON "notion_links" USING btree ("formation_id");--> statement-breakpoint
CREATE INDEX "notion_links_to_idx" ON "notion_links" USING btree ("to_notion_id");--> statement-breakpoint
CREATE INDEX "notion_links_owner_id_idx" ON "notion_links" USING btree ("owner_id") WHERE "notion_links"."owner_id" is not null;--> statement-breakpoint
CREATE INDEX "notions_formation_id_idx" ON "notions" USING btree ("formation_id");--> statement-breakpoint
CREATE INDEX "notions_module_id_idx" ON "notions" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "programme_change_requests_user_id_idx" ON "programme_change_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "programme_imports_user_id_idx" ON "programme_imports" USING btree ("user_id");