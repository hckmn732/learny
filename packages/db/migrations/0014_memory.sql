CREATE TYPE "public"."fsrs_grade" AS ENUM('again', 'hard', 'good', 'easy');--> statement-breakpoint
CREATE TYPE "public"."gap_event_kind" AS ENUM('detected', 'nature_changed', 'cleared');--> statement-breakpoint
CREATE TYPE "public"."gap_nature" AS ENUM('forgetting', 'confusion', 'misunderstanding', 'application');--> statement-breakpoint
CREATE TYPE "public"."review_source" AS ENUM('validation', 'global_quiz', 'warmup', 'exercise', 'exam', 'self_test', 'micro_session', 'sprint', 'offline');--> statement-breakpoint
CREATE TABLE "gap_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"notion_id" uuid NOT NULL,
	"kind" "gap_event_kind" NOT NULL,
	"nature" "gap_nature",
	"evidence" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gap_events_nature_check" CHECK ("gap_events"."kind" = 'cleared' or "gap_events"."nature" is not null),
	CONSTRAINT "gap_events_evidence_check" CHECK ("gap_events"."evidence" is null or jsonb_typeof("gap_events"."evidence") = 'object')
);
--> statement-breakpoint
CREATE TABLE "notion_states" (
	"user_id" uuid NOT NULL,
	"notion_id" uuid NOT NULL,
	"fsrs" jsonb NOT NULL,
	"due_at" timestamp with time zone,
	"mastery" numeric(5, 2) DEFAULT '0' NOT NULL,
	"first_seen_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"success_count" integer DEFAULT 0 NOT NULL,
	"gap_nature" "gap_nature",
	"gap_confused_with" uuid,
	"gap_detected_at" timestamp with time zone,
	"gap_evidence" text,
	"gap_cleared_at" timestamp with time zone,
	"suspended" boolean DEFAULT false NOT NULL,
	"in_review" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notion_states_pkey" PRIMARY KEY("user_id","notion_id"),
	CONSTRAINT "notion_states_mastery_check" CHECK ("notion_states"."mastery" between 0 and 100),
	CONSTRAINT "notion_states_success_count_check" CHECK ("notion_states"."success_count" >= 0),
	CONSTRAINT "notion_states_revision_check" CHECK ("notion_states"."revision" >= 0),
	CONSTRAINT "notion_states_gap_confused_not_self_check" CHECK ("notion_states"."gap_confused_with" is null or "notion_states"."gap_confused_with" <> "notion_states"."notion_id"),
	CONSTRAINT "notion_states_gap_confused_nature_check" CHECK ("notion_states"."gap_confused_with" is null or "notion_states"."gap_nature" = 'confusion'),
	CONSTRAINT "notion_states_gap_detected_at_check" CHECK ("notion_states"."gap_nature" is null or "notion_states"."gap_detected_at" is not null),
	CONSTRAINT "notion_states_gap_cleared_at_check" CHECK ("notion_states"."gap_cleared_at" is null or "notion_states"."gap_detected_at" is null or "notion_states"."gap_cleared_at" >= "notion_states"."gap_detected_at"),
	CONSTRAINT "notion_states_fsrs_check" CHECK (jsonb_typeof("notion_states"."fsrs") = 'object'
        and "notion_states"."fsrs" ? 'due'
        and "notion_states"."fsrs" ? 'stability'
        and "notion_states"."fsrs" ? 'difficulty'
        and "notion_states"."fsrs" ? 'elapsed_days'
        and "notion_states"."fsrs" ? 'scheduled_days'
        and "notion_states"."fsrs" ? 'reps'
        and "notion_states"."fsrs" ? 'lapses'
        and "notion_states"."fsrs" ? 'state'
        and "notion_states"."fsrs" ? 'last_review'
        and jsonb_typeof("notion_states"."fsrs" -> 'due') = 'string'
        and jsonb_typeof("notion_states"."fsrs" -> 'stability') = 'number'
        and jsonb_typeof("notion_states"."fsrs" -> 'difficulty') = 'number'
        and jsonb_typeof("notion_states"."fsrs" -> 'elapsed_days') = 'number'
        and jsonb_typeof("notion_states"."fsrs" -> 'scheduled_days') = 'number'
        and jsonb_typeof("notion_states"."fsrs" -> 'reps') = 'number'
        and jsonb_typeof("notion_states"."fsrs" -> 'lapses') = 'number'
        and jsonb_typeof("notion_states"."fsrs" -> 'state') = 'number'
        and jsonb_typeof("notion_states"."fsrs" -> 'last_review') in ('string', 'null'))
);
--> statement-breakpoint
CREATE TABLE "review_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"notion_id" uuid NOT NULL,
	"answer_id" uuid,
	"source" "review_source" NOT NULL,
	"grade" "fsrs_grade" NOT NULL,
	"correct" boolean,
	"time_ms" integer,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fsrs_before" jsonb,
	"fsrs_after" jsonb,
	CONSTRAINT "review_logs_time_ms_check" CHECK ("review_logs"."time_ms" is null or "review_logs"."time_ms" >= 0),
	CONSTRAINT "review_logs_fsrs_before_check" CHECK ("review_logs"."fsrs_before" is null or jsonb_typeof("review_logs"."fsrs_before") = 'object'),
	CONSTRAINT "review_logs_fsrs_after_check" CHECK ("review_logs"."fsrs_after" is null or jsonb_typeof("review_logs"."fsrs_after") = 'object')
);
--> statement-breakpoint
ALTER TABLE "gap_events" ADD CONSTRAINT "gap_events_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gap_events" ADD CONSTRAINT "gap_events_notion_id_notions_id_fk" FOREIGN KEY ("notion_id") REFERENCES "public"."notions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_states" ADD CONSTRAINT "notion_states_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_states" ADD CONSTRAINT "notion_states_notion_id_notions_id_fk" FOREIGN KEY ("notion_id") REFERENCES "public"."notions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_states" ADD CONSTRAINT "notion_states_gap_confused_with_notions_id_fk" FOREIGN KEY ("gap_confused_with") REFERENCES "public"."notions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_notion_id_notions_id_fk" FOREIGN KEY ("notion_id") REFERENCES "public"."notions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_answer_id_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."answers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gap_events_user_id_notion_id_created_at_idx" ON "gap_events" USING btree ("user_id","notion_id","created_at");--> statement-breakpoint
CREATE INDEX "notion_states_due_idx" ON "notion_states" USING btree ("user_id","due_at") WHERE "notion_states"."in_review";--> statement-breakpoint
CREATE INDEX "notion_states_notion_id_idx" ON "notion_states" USING btree ("notion_id");--> statement-breakpoint
CREATE INDEX "notion_states_gap_confused_with_idx" ON "notion_states" USING btree ("gap_confused_with");--> statement-breakpoint
CREATE INDEX "review_logs_user_id_notion_id_reviewed_at_idx" ON "review_logs" USING btree ("user_id","notion_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "review_logs_answer_id_idx" ON "review_logs" USING btree ("answer_id");