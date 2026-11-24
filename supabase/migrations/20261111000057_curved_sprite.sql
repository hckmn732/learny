CREATE TYPE "public"."formation_creation_mode" AS ENUM('tutor', 'simple');--> statement-breakpoint
CREATE TYPE "public"."simple_status" AS ENUM('collecting', 'analysing', 'proposed', 'failed');--> statement-breakpoint
ALTER TYPE "public"."programme_source" ADD VALUE 'document';--> statement-breakpoint
ALTER TYPE "public"."activity_kind" ADD VALUE 'diagnostic';--> statement-breakpoint
ALTER TYPE "public"."ai_task" ADD VALUE 'simple_analysis';--> statement-breakpoint
CREATE TABLE "chapter_sources" (
	"chapter_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"formation_id" uuid NOT NULL,
	"page_from" integer,
	"page_to" integer,
	CONSTRAINT "chapter_sources_chapter_id_resource_id_pk" PRIMARY KEY("chapter_id","resource_id"),
	CONSTRAINT "chapter_sources_page_from_check" CHECK ("chapter_sources"."page_from" is null or "chapter_sources"."page_from" >= 1),
	CONSTRAINT "chapter_sources_page_to_check" CHECK ("chapter_sources"."page_to" is null or "chapter_sources"."page_to" >= 1),
	CONSTRAINT "chapter_sources_pages_order_check" CHECK ("chapter_sources"."page_to" is null or "chapter_sources"."page_from" is null or "chapter_sources"."page_to" >= "chapter_sources"."page_from")
);
--> statement-breakpoint
CREATE TABLE "simple_analyses" (
	"formation_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"status" "simple_status" DEFAULT 'collecting' NOT NULL,
	"steps" jsonb NOT NULL,
	"chapters_found" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"section_summaries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_code" text,
	"error_message" text,
	"diagnostic_status" text DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "simple_analyses_steps_check" CHECK (jsonb_typeof("simple_analyses"."steps") = 'array'),
	CONSTRAINT "simple_analyses_chapters_found_check" CHECK (jsonb_typeof("simple_analyses"."chapters_found") = 'array'),
	CONSTRAINT "simple_analyses_section_summaries_check" CHECK (jsonb_typeof("simple_analyses"."section_summaries") = 'array'),
	CONSTRAINT "simple_analyses_error_code_length_check" CHECK ("simple_analyses"."error_code" is null or char_length("simple_analyses"."error_code") <= 64),
	CONSTRAINT "simple_analyses_error_message_length_check" CHECK ("simple_analyses"."error_message" is null or char_length("simple_analyses"."error_message") <= 1000),
	CONSTRAINT "simple_analyses_diagnostic_status_check" CHECK ("simple_analyses"."diagnostic_status" in ('none', 'done', 'skipped'))
);
--> statement-breakpoint
ALTER TABLE "formations" ADD COLUMN "creation_mode" "formation_creation_mode" DEFAULT 'tutor' NOT NULL;--> statement-breakpoint
ALTER TABLE "formations" ADD COLUMN "simple_motivation" text;--> statement-breakpoint
ALTER TABLE "chapter_sources" ADD CONSTRAINT "chapter_sources_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_sources" ADD CONSTRAINT "chapter_sources_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_sources" ADD CONSTRAINT "chapter_sources_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simple_analyses" ADD CONSTRAINT "simple_analyses_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simple_analyses" ADD CONSTRAINT "simple_analyses_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chapter_sources_formation_id_idx" ON "chapter_sources" USING btree ("formation_id");--> statement-breakpoint
CREATE INDEX "chapter_sources_resource_id_idx" ON "chapter_sources" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "simple_analyses_owner_id_idx" ON "simple_analyses" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "formations" ADD CONSTRAINT "formations_simple_motivation_length_check" CHECK ("formations"."simple_motivation" is null or char_length("formations"."simple_motivation") <= 300);--> statement-breakpoint
ALTER TABLE "formations" ADD CONSTRAINT "formations_simple_motivation_mode_check" CHECK ("formations"."simple_motivation" is null or "formations"."creation_mode" = 'simple');