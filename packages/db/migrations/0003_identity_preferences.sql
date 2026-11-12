CREATE TYPE "public"."automation_key" AS ENUM('reprise', 'micro_seance', 'echauffement', 'remediation', 'jeu_lacune', 'questions_cartes', 'plafond_quiz', 'sprint', 'bilan', 'pause');--> statement-breakpoint
CREATE TYPE "public"."onboarding_step" AS ENUM('profil', 'rythme', 'ia', 'rappels', 'depart', 'done');--> statement-breakpoint
CREATE TYPE "public"."pause_status" AS ENUM('active', 'ended', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."study_slot" AS ENUM('matin', 'apres_midi', 'soir');--> statement-breakpoint
CREATE TYPE "public"."tutor_tone" AS ENUM('vous', 'tu');--> statement-breakpoint
CREATE TABLE "automation_settings" (
	"user_id" uuid NOT NULL,
	"key" "automation_key" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"params" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_settings_user_id_key_pk" PRIMARY KEY("user_id","key"),
	CONSTRAINT "automation_settings_params_check" CHECK (jsonb_typeof("automation_settings"."params") = 'object')
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"channel_email" boolean DEFAULT true NOT NULL,
	"channel_push" boolean DEFAULT true NOT NULL,
	"type_revision" boolean DEFAULT true NOT NULL,
	"type_validation" boolean DEFAULT true NOT NULL,
	"type_course" boolean DEFAULT true NOT NULL,
	"type_gap" boolean DEFAULT true NOT NULL,
	"type_planning" boolean DEFAULT true NOT NULL,
	"type_relaunch" boolean DEFAULT true NOT NULL,
	"digest_time" time DEFAULT '08:00' NOT NULL,
	"quiet_start" time DEFAULT '21:00' NOT NULL,
	"quiet_end" time DEFAULT '08:00' NOT NULL,
	"weekend_quiet" boolean DEFAULT true NOT NULL,
	"max_per_day" smallint DEFAULT 5 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_settings_max_per_day_check" CHECK ("notification_settings"."max_per_day" in (3,5,8))
);
--> statement-breakpoint
CREATE TABLE "pauses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"diagnostic_on_return" boolean DEFAULT true NOT NULL,
	"status" "pause_status" DEFAULT 'active' NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pauses_period_check" CHECK ("pauses"."ends_on" >= "pauses"."starts_on"),
	CONSTRAINT "pauses_ended_at_check" CHECK (("pauses"."status" = 'ended') = ("pauses"."ended_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"course_language" "course_language" DEFAULT 'fr' NOT NULL,
	"tutor_tone" "tutor_tone" DEFAULT 'vous' NOT NULL,
	"timezone" text DEFAULT 'Europe/Paris' NOT NULL,
	"onboarding_step" "onboarding_step" DEFAULT 'profil' NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"terms_version" text,
	"terms_accepted_at" timestamp with time zone,
	"current_formation_id" uuid,
	"deletion_requested_at" timestamp with time zone,
	"deletion_scheduled_for" timestamp with time zone,
	"sidebar_collapsed" boolean DEFAULT false NOT NULL,
	"streak_days" integer DEFAULT 0 NOT NULL,
	"streak_computed_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_email_unique" UNIQUE("email"),
	CONSTRAINT "profiles_first_name_length_check" CHECK (char_length("profiles"."first_name") <= 60),
	CONSTRAINT "profiles_last_name_length_check" CHECK (char_length("profiles"."last_name") <= 60),
	CONSTRAINT "profiles_streak_days_check" CHECK ("profiles"."streak_days" >= 0),
	CONSTRAINT "profiles_deletion_pair_check" CHECK (("profiles"."deletion_requested_at" is null) = ("profiles"."deletion_scheduled_for" is null))
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone,
	"failure_count" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint"),
	CONSTRAINT "push_subscriptions_endpoint_check" CHECK ("push_subscriptions"."endpoint" like 'https://%' and char_length("push_subscriptions"."endpoint") <= 2048),
	CONSTRAINT "push_subscriptions_user_agent_check" CHECK (char_length("push_subscriptions"."user_agent") <= 512),
	CONSTRAINT "push_subscriptions_failure_count_check" CHECK ("push_subscriptions"."failure_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "study_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"hours_per_day" smallint DEFAULT 2 NOT NULL,
	"study_days" smallint[] DEFAULT '{1,2,3,4,5}'::smallint[] NOT NULL,
	"preferred_slots" "study_slot"[] DEFAULT '{soir}'::study_slot[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_preferences_hours_per_day_check" CHECK ("study_preferences"."hours_per_day" between 1 and 6),
	CONSTRAINT "study_preferences_study_days_check" CHECK (cardinality("study_preferences"."study_days") between 1 and 7 and "study_preferences"."study_days" <@ '{1,2,3,4,5,6,7}'::smallint[] and public.smallint_array_is_set("study_preferences"."study_days")),
	CONSTRAINT "study_preferences_preferred_slots_check" CHECK (cardinality("study_preferences"."preferred_slots") between 1 and 3)
);
--> statement-breakpoint
ALTER TABLE "automation_settings" ADD CONSTRAINT "automation_settings_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pauses" ADD CONSTRAINT "pauses_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_preferences" ADD CONSTRAINT "study_preferences_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pauses_user_id_status_idx" ON "pauses" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "pauses_one_active_per_user" ON "pauses" USING btree ("user_id") WHERE "pauses"."status" = 'active';--> statement-breakpoint
CREATE INDEX "profiles_deletion_scheduled_for_idx" ON "profiles" USING btree ("deletion_scheduled_for") WHERE "profiles"."deletion_scheduled_for" is not null;--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions" USING btree ("user_id");