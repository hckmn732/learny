CREATE TYPE "public"."delivery_channel" AS ENUM('email', 'push');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('scheduled', 'sent', 'deferred_quiet', 'capped', 'failed', 'skipped_pref');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('validation_soon', 'course_ready', 'global_quiz_today', 'new_gap', 'session_planned', 'module_validated', 'session_to_reschedule', 'weekly_review', 'milestone', 'ai_cost_alert', 'ai_task_failed', 'export_ready', 'group_invitation', 'daily_digest', 'relaunch', 'planning_adjusted');--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"channel" "delivery_channel" NOT NULL,
	"status" "delivery_status" NOT NULL,
	"scheduled_for" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "notification_deliveries_notification_id_channel_unique" UNIQUE("notification_id","channel"),
	CONSTRAINT "notification_deliveries_sent_at_check" CHECK (("notification_deliveries"."status" = 'sent') = ("notification_deliveries"."sent_at" is not null)),
	CONSTRAINT "notification_deliveries_scheduled_for_check" CHECK ("notification_deliveries"."status" not in ('scheduled', 'deferred_quiet') or "notification_deliveries"."scheduled_for" is not null),
	CONSTRAINT "notification_deliveries_error_check" CHECK ("notification_deliveries"."error" is null or ("notification_deliveries"."status" in ('failed', 'skipped_pref') and "notification_deliveries"."error" ~ '^[a-z][a-z0-9_]{0,63}$'))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"formation_id" uuid,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"href" text NOT NULL,
	"icon" text NOT NULL,
	"dedupe_key" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_user_id_dedupe_key_unique" UNIQUE("user_id","dedupe_key"),
	CONSTRAINT "notifications_href_check" CHECK ("notifications"."href" like '/%' and "notifications"."href" not like '//%' and strpos("notifications"."href", chr(92)) = 0 and "notifications"."href" !~ '[\r\n\t ]' and char_length("notifications"."href") between 1 and 2048),
	CONSTRAINT "notifications_title_check" CHECK (char_length("notifications"."title") between 1 and 120 and btrim("notifications"."title") <> ''),
	CONSTRAINT "notifications_body_check" CHECK (char_length("notifications"."body") between 1 and 400 and btrim("notifications"."body") <> ''),
	CONSTRAINT "notifications_icon_check" CHECK ("notifications"."icon" ~ '^[a-z][a-z0-9-]{0,39}$'),
	CONSTRAINT "notifications_dedupe_key_check" CHECK ("notifications"."dedupe_key" is null or (btrim("notifications"."dedupe_key") <> '' and char_length("notifications"."dedupe_key") <= 200))
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_deliveries_status_scheduled_for_idx" ON "notification_deliveries" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_user_id_unread_idx" ON "notifications" USING btree ("user_id") WHERE "notifications"."read_at" is null;--> statement-breakpoint
CREATE INDEX "notifications_formation_id_idx" ON "notifications" USING btree ("formation_id");