CREATE TYPE "public"."course_section_report_status" AS ENUM('open', 'corrected', 'dismissed');--> statement-breakpoint
CREATE TABLE "course_section_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" "course_section_report_status" DEFAULT 'open' NOT NULL,
	"affected_brick_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"request_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "course_section_reports_reason_length_check" CHECK (char_length("course_section_reports"."reason") between 1 and 500),
	CONSTRAINT "course_section_reports_affected_bricks_check" CHECK (cardinality("course_section_reports"."affected_brick_ids") <= 500),
	CONSTRAINT "course_section_reports_request_key_check" CHECK ("course_section_reports"."request_key" is null or "course_section_reports"."request_key" ~ '^[A-Za-z0-9_-]{8,128}$')
);
--> statement-breakpoint
ALTER TABLE "chapter_summaries" ADD COLUMN "request_key" text;--> statement-breakpoint
ALTER TABLE "course_section_revisions" ADD COLUMN "request_key" text;--> statement-breakpoint
ALTER TABLE "course_section_reports" ADD CONSTRAINT "course_section_reports_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_section_reports" ADD CONSTRAINT "course_section_reports_section_id_course_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."course_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "course_section_reports_request_key_idx" ON "course_section_reports" USING btree ("owner_id","request_key") WHERE "course_section_reports"."request_key" is not null;--> statement-breakpoint
CREATE INDEX "course_section_reports_section_id_idx" ON "course_section_reports" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "course_section_reports_owner_id_idx" ON "course_section_reports" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chapter_summaries_request_key_idx" ON "chapter_summaries" USING btree ("user_id","request_key") WHERE "chapter_summaries"."request_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "course_section_revisions_request_key_idx" ON "course_section_revisions" USING btree ("owner_id","request_key") WHERE "course_section_revisions"."request_key" is not null;--> statement-breakpoint
ALTER TABLE "chapter_summaries" ADD CONSTRAINT "chapter_summaries_request_key_check" CHECK ("chapter_summaries"."request_key" is null or "chapter_summaries"."request_key" ~ '^[A-Za-z0-9_-]{8,128}$');--> statement-breakpoint
ALTER TABLE "course_section_revisions" ADD CONSTRAINT "course_section_revisions_request_key_check" CHECK ("course_section_revisions"."request_key" is null or "course_section_revisions"."request_key" ~ '^[A-Za-z0-9_-]{8,128}$');