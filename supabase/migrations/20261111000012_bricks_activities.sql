CREATE TYPE "public"."activity_kind" AS ENUM('course', 'validation_quiz', 'global_quiz_session', 'remediation', 'exercise', 'mock_exam', 'warmup', 'micro_session', 'sprint', 'self_test', 'scripted_dialogue', 'project_step');--> statement-breakpoint
CREATE TYPE "public"."activity_status" AS ENUM('draft', 'ready', 'archived');--> statement-breakpoint
CREATE TYPE "public"."attempt_status" AS ENUM('in_progress', 'submitted', 'graded', 'timed_out', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."brick_purpose" AS ENUM('course', 'validation', 'bank', 'remediation', 'exercise', 'exam', 'warmup', 'review');--> statement-breakpoint
CREATE TYPE "public"."brick_status" AS ENUM('active', 'reported', 'retired');--> statement-breakpoint
CREATE TYPE "public"."brick_type" AS ENUM('text', 'resource_excerpt', 'choice_question', 'open_question', 'cloze', 'matching', 'ordering', 'categorization', 'recall_card', 'instruction', 'scripted_dialogue', 'timer', 'scoring');--> statement-breakpoint
CREATE TYPE "public"."grader" AS ENUM('code', 'tutor');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'corrected', 'dismissed');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"formation_id" uuid NOT NULL,
	"module_id" uuid,
	"kind" "activity_kind" NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "activity_status" DEFAULT 'draft' NOT NULL,
	"for_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activities_config_check" CHECK (jsonb_typeof("activities"."config") = 'object'),
	CONSTRAINT "activities_items_check" CHECK (jsonb_typeof("activities"."items") = 'array'),
	CONSTRAINT "activities_ready_items_check" CHECK ("activities"."status" <> 'ready' or jsonb_array_length("activities"."items") > 0)
);
--> statement-breakpoint
CREATE TABLE "answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"brick_version_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"response" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_correct" boolean,
	"score" numeric(5, 2),
	"max_score" numeric(5, 2),
	"time_ms" integer,
	"graded_by" "grader",
	"feedback" jsonb,
	"chosen_distractor_notion_id" uuid,
	"marked_for_review" boolean DEFAULT false NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "answers_attempt_id_position_unique" UNIQUE("attempt_id","position"),
	CONSTRAINT "answers_position_check" CHECK ("answers"."position" >= 1),
	CONSTRAINT "answers_response_check" CHECK (jsonb_typeof("answers"."response") in ('object', 'array')),
	CONSTRAINT "answers_score_check" CHECK ("answers"."score" is null or "answers"."score" between 0 and 100),
	CONSTRAINT "answers_max_score_check" CHECK ("answers"."max_score" is null or "answers"."max_score" between 0 and 100),
	CONSTRAINT "answers_score_max_score_check" CHECK ("answers"."score" is null or "answers"."max_score" is null or "answers"."score" <= "answers"."max_score"),
	CONSTRAINT "answers_time_ms_check" CHECK ("answers"."time_ms" is null or "answers"."time_ms" >= 0),
	CONSTRAINT "answers_feedback_check" CHECK ("answers"."feedback" is null or jsonb_typeof("answers"."feedback") = 'object')
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"attempt_no" integer NOT NULL,
	"status" "attempt_status" DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deadline_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"duration_ms" integer,
	"score" numeric(5, 2),
	"passed" boolean,
	"per_notion" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"hints_used" smallint DEFAULT 0 NOT NULL,
	"review_feedback" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempts_activity_id_user_id_attempt_no_unique" UNIQUE("activity_id","user_id","attempt_no"),
	CONSTRAINT "attempts_attempt_no_check" CHECK ("attempts"."attempt_no" >= 1),
	CONSTRAINT "attempts_duration_ms_check" CHECK ("attempts"."duration_ms" is null or "attempts"."duration_ms" >= 0),
	CONSTRAINT "attempts_score_check" CHECK ("attempts"."score" is null or "attempts"."score" between 0 and 100),
	CONSTRAINT "attempts_hints_used_check" CHECK ("attempts"."hints_used" >= 0),
	CONSTRAINT "attempts_per_notion_check" CHECK (jsonb_typeof("attempts"."per_notion") = 'object'),
	CONSTRAINT "attempts_review_feedback_check" CHECK ("attempts"."review_feedback" is null or jsonb_typeof("attempts"."review_feedback") = 'object')
);
--> statement-breakpoint
CREATE TABLE "brick_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"brick_id" uuid NOT NULL,
	"brick_version_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"resolution" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "brick_reports_reason_length_check" CHECK (char_length("brick_reports"."reason") between 1 and 500),
	CONSTRAINT "brick_reports_resolution_check" CHECK ("brick_reports"."resolution" is null or jsonb_typeof("brick_reports"."resolution") = 'object'),
	CONSTRAINT "brick_reports_resolved_at_check" CHECK (("brick_reports"."status" = 'open') = ("brick_reports"."resolved_at" is null))
);
--> statement-breakpoint
CREATE TABLE "brick_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brick_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"fingerprint" text,
	"origin" "content_origin" NOT NULL,
	"created_by" "actor" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brick_versions_brick_id_version_unique" UNIQUE("brick_id","version"),
	CONSTRAINT "brick_versions_id_brick_id_unique" UNIQUE("id","brick_id"),
	CONSTRAINT "brick_versions_version_check" CHECK ("brick_versions"."version" >= 1),
	CONSTRAINT "brick_versions_payload_check" CHECK (jsonb_typeof("brick_versions"."payload") = 'object'),
	CONSTRAINT "brick_versions_fingerprint_check" CHECK ("brick_versions"."fingerprint" is null or "brick_versions"."fingerprint" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "bricks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"formation_id" uuid NOT NULL,
	"type" "brick_type" NOT NULL,
	"notion_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"purpose" "brick_purpose" NOT NULL,
	"status" "brick_status" DEFAULT 'active' NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bricks_current_version_check" CHECK ("bricks"."current_version" >= 1),
	CONSTRAINT "bricks_notion_ids_count_check" CHECK (cardinality("bricks"."notion_ids") <= 50)
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_brick_version_id_brick_versions_id_fk" FOREIGN KEY ("brick_version_id") REFERENCES "public"."brick_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_chosen_distractor_notion_id_notions_id_fk" FOREIGN KEY ("chosen_distractor_notion_id") REFERENCES "public"."notions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brick_reports" ADD CONSTRAINT "brick_reports_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brick_reports" ADD CONSTRAINT "brick_reports_brick_id_bricks_id_fk" FOREIGN KEY ("brick_id") REFERENCES "public"."bricks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brick_reports" ADD CONSTRAINT "brick_reports_version_brick_fk" FOREIGN KEY ("brick_version_id","brick_id") REFERENCES "public"."brick_versions"("id","brick_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brick_versions" ADD CONSTRAINT "brick_versions_brick_id_bricks_id_fk" FOREIGN KEY ("brick_id") REFERENCES "public"."bricks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bricks" ADD CONSTRAINT "bricks_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bricks" ADD CONSTRAINT "bricks_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_owner_id_idx" ON "activities" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "activities_owner_status_idx" ON "activities" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "activities_formation_id_idx" ON "activities" USING btree ("formation_id");--> statement-breakpoint
CREATE INDEX "activities_module_id_idx" ON "activities" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "activities_for_date_idx" ON "activities" USING btree ("for_date");--> statement-breakpoint
CREATE INDEX "answers_attempt_id_idx" ON "answers" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "answers_brick_version_id_idx" ON "answers" USING btree ("brick_version_id");--> statement-breakpoint
CREATE INDEX "answers_chosen_distractor_notion_id_idx" ON "answers" USING btree ("chosen_distractor_notion_id");--> statement-breakpoint
CREATE INDEX "attempts_user_id_idx" ON "attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "attempts_activity_id_idx" ON "attempts" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "brick_reports_user_id_idx" ON "brick_reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "brick_reports_brick_id_idx" ON "brick_reports" USING btree ("brick_id");--> statement-breakpoint
CREATE INDEX "brick_versions_fingerprint_idx" ON "brick_versions" USING btree ("fingerprint") WHERE "brick_versions"."fingerprint" is not null;--> statement-breakpoint
CREATE INDEX "bricks_owner_id_idx" ON "bricks" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "bricks_formation_id_idx" ON "bricks" USING btree ("formation_id");--> statement-breakpoint
CREATE INDEX "bricks_owner_status_idx" ON "bricks" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "bricks_notion_ids_idx" ON "bricks" USING gin ("notion_ids");