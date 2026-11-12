CREATE TYPE "public"."automation_status" AS ENUM('pending_consent', 'applied', 'declined', 'undone', 'expired', 'consumed');--> statement-breakpoint
CREATE TYPE "public"."milestone_key" AS ENUM('module_validated', 'notions_100', 'streak_30');--> statement-breakpoint
CREATE TYPE "public"."slot_creator" AS ENUM('planner', 'automation', 'learner');--> statement-breakpoint
CREATE TYPE "public"."slot_kind" AS ENUM('contributions', 'course', 'exercise', 'validation_quiz', 'global_quiz', 'revision', 'buffer', 'sprint', 'mock_exam', 'warmup', 'micro_session', 'weekly_review');--> statement-breakpoint
CREATE TYPE "public"."slot_status" AS ENUM('planned', 'done', 'missed', 'moved', 'cancelled');--> statement-breakpoint
CREATE TABLE "automation_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"formation_id" uuid,
	"automation" "automation_key" NOT NULL,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"undo_payload" jsonb,
	"requires_consent" boolean DEFAULT false NOT NULL,
	"status" "automation_status" DEFAULT 'applied' NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_actions_kind_length_check" CHECK (char_length("automation_actions"."kind") between 1 and 80),
	CONSTRAINT "automation_actions_summary_check" CHECK (char_length("automation_actions"."summary") between 1 and 300 and "automation_actions"."summary" !~ '[\r\n]'),
	CONSTRAINT "automation_actions_payload_check" CHECK (jsonb_typeof("automation_actions"."payload") = 'object'),
	CONSTRAINT "automation_actions_undo_payload_check" CHECK ("automation_actions"."undo_payload" is null or jsonb_typeof("automation_actions"."undo_payload") = 'object'),
	CONSTRAINT "automation_actions_pending_consent_check" CHECK ("automation_actions"."status" <> 'pending_consent' or "automation_actions"."requires_consent"),
	CONSTRAINT "automation_actions_pending_decided_at_check" CHECK ("automation_actions"."status" <> 'pending_consent' or "automation_actions"."decided_at" is null),
	CONSTRAINT "automation_actions_declined_decided_at_check" CHECK ("automation_actions"."status" <> 'declined' or "automation_actions"."decided_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "daily_activity" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"minutes" integer DEFAULT 0 NOT NULL,
	"qualifying" boolean DEFAULT false NOT NULL,
	"sources" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "daily_activity_pkey" PRIMARY KEY("user_id","day"),
	CONSTRAINT "daily_activity_minutes_check" CHECK ("daily_activity"."minutes" >= 0),
	CONSTRAINT "daily_activity_sources_check" CHECK (array_position("daily_activity"."sources", null) is null and array_position("daily_activity"."sources", '') is null)
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"formation_id" uuid,
	"key" "milestone_key" NOT NULL,
	"ref_id" uuid,
	"achieved_at" timestamp with time zone NOT NULL,
	CONSTRAINT "milestones_user_id_key_ref_id_unique" UNIQUE NULLS NOT DISTINCT("user_id","key","ref_id")
);
--> statement-breakpoint
CREATE TABLE "schedule_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"formation_id" uuid NOT NULL,
	"module_id" uuid,
	"kind" "slot_kind" NOT NULL,
	"title" text NOT NULL,
	"meta" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "slot_status" DEFAULT 'planned' NOT NULL,
	"activity_id" uuid,
	"created_by" "slot_creator" NOT NULL,
	"moved_from_id" uuid,
	"group_milestone" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_slots_window_check" CHECK ("schedule_slots"."ends_at" > "schedule_slots"."starts_at"),
	CONSTRAINT "schedule_slots_moved_from_not_self_check" CHECK ("schedule_slots"."moved_from_id" is null or "schedule_slots"."moved_from_id" <> "schedule_slots"."id"),
	CONSTRAINT "schedule_slots_title_length_check" CHECK (char_length("schedule_slots"."title") between 1 and 200),
	CONSTRAINT "schedule_slots_meta_length_check" CHECK ("schedule_slots"."meta" is null or char_length("schedule_slots"."meta") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "automation_actions" ADD CONSTRAINT "automation_actions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_actions" ADD CONSTRAINT "automation_actions_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_activity" ADD CONSTRAINT "daily_activity_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_moved_from_id_fk" FOREIGN KEY ("moved_from_id") REFERENCES "public"."schedule_slots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_actions_user_id_created_at_idx" ON "automation_actions" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "automation_actions_formation_id_idx" ON "automation_actions" USING btree ("formation_id");--> statement-breakpoint
CREATE INDEX "milestones_user_id_achieved_at_idx" ON "milestones" USING btree ("user_id","achieved_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "milestones_formation_id_idx" ON "milestones" USING btree ("formation_id");--> statement-breakpoint
CREATE INDEX "schedule_slots_user_id_starts_at_idx" ON "schedule_slots" USING btree ("user_id","starts_at");--> statement-breakpoint
CREATE INDEX "schedule_slots_formation_id_idx" ON "schedule_slots" USING btree ("formation_id");--> statement-breakpoint
CREATE INDEX "schedule_slots_module_id_idx" ON "schedule_slots" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "schedule_slots_activity_id_idx" ON "schedule_slots" USING btree ("activity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_slots_moved_from_active_unique" ON "schedule_slots" USING btree ("moved_from_id") WHERE "schedule_slots"."moved_from_id" is not null and "schedule_slots"."status" in ('planned', 'done', 'missed');