CREATE TYPE "public"."citation_media" AS ENUM('pdf', 'audio', 'video', 'web', 'note', 'image');--> statement-breakpoint
CREATE TYPE "public"."course_status" AS ENUM('generating', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."section_kind" AS ENUM('text', 'flash_question', 'dont_confuse', 'tutor_completed', 'retain', 'summary_prompt');--> statement-breakpoint
CREATE TABLE "chapter_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"chapter_id" uuid NOT NULL,
	"course_id" uuid,
	"text" text NOT NULL,
	"feedback" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chapter_summaries_text_length_check" CHECK (char_length("chapter_summaries"."text") between 1 and 2000),
	CONSTRAINT "chapter_summaries_feedback_check" CHECK ("chapter_summaries"."feedback" is null or jsonb_typeof("chapter_summaries"."feedback") = 'object')
);
--> statement-breakpoint
CREATE TABLE "citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"chunk_id" uuid,
	"resource_id" uuid,
	"quote" text,
	"location" jsonb,
	"label" text NOT NULL,
	"media_kind" "citation_media" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "citations_quote_length_check" CHECK ("citations"."quote" is null or char_length("citations"."quote") <= 2000),
	CONSTRAINT "citations_location_check" CHECK ("citations"."location" is null or jsonb_typeof("citations"."location") = 'object'),
	CONSTRAINT "citations_label_length_check" CHECK (char_length("citations"."label") between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "course_section_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text,
	"content_md" text,
	"data" jsonb,
	"edited_by" "actor" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_section_revisions_section_id_version_unique" UNIQUE("section_id","version"),
	CONSTRAINT "course_section_revisions_version_check" CHECK ("course_section_revisions"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "course_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"chapter_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" "section_kind" NOT NULL,
	"anchor" text NOT NULL,
	"title" text,
	"content_md" text,
	"data" jsonb,
	"notion_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"origin" "content_origin" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"reported" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_sections_course_id_chapter_id_position_unique" UNIQUE("course_id","chapter_id","position"),
	CONSTRAINT "course_sections_course_id_anchor_unique" UNIQUE("course_id","anchor"),
	CONSTRAINT "course_sections_position_check" CHECK ("course_sections"."position" >= 1),
	CONSTRAINT "course_sections_anchor_check" CHECK ("course_sections"."anchor" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length("course_sections"."anchor") <= 80),
	CONSTRAINT "course_sections_title_length_check" CHECK ("course_sections"."title" is null or char_length("course_sections"."title") <= 200),
	CONSTRAINT "course_sections_content_md_length_check" CHECK ("course_sections"."content_md" is null or char_length("course_sections"."content_md") <= 50000),
	CONSTRAINT "course_sections_data_check" CHECK ("course_sections"."data" is null or jsonb_typeof("course_sections"."data") = 'object'),
	CONSTRAINT "course_sections_version_check" CHECK ("course_sections"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"formation_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"status" "course_status" DEFAULT 'generating' NOT NULL,
	"model" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courses_owner_id_module_id_version_unique" UNIQUE("owner_id","module_id","version"),
	CONSTRAINT "courses_version_check" CHECK ("courses"."version" >= 1),
	CONSTRAINT "courses_model_length_check" CHECK ("courses"."model" is null or char_length("courses"."model") <= 120),
	CONSTRAINT "courses_error_length_check" CHECK ("courses"."error" is null or char_length("courses"."error") <= 2000),
	CONSTRAINT "courses_failed_has_error" CHECK ("courses"."status" <> 'failed' or "courses"."error" is not null)
);
--> statement-breakpoint
CREATE TABLE "reading_progress" (
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"chapter_id" uuid NOT NULL,
	"percent" smallint DEFAULT 0 NOT NULL,
	"seconds_spent" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reading_progress_user_id_course_id_chapter_id_pk" PRIMARY KEY("user_id","course_id","chapter_id"),
	CONSTRAINT "reading_progress_percent_check" CHECK ("reading_progress"."percent" between 0 and 100),
	CONSTRAINT "reading_progress_seconds_spent_check" CHECK ("reading_progress"."seconds_spent" >= 0)
);
--> statement-breakpoint
CREATE TABLE "tutor_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_conversations_title_length_check" CHECK ("tutor_conversations"."title" is null or char_length("tutor_conversations"."title") <= 200)
);
--> statement-breakpoint
CREATE TABLE "tutor_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"context" jsonb,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"follow_ups" text[] DEFAULT '{}'::text[] NOT NULL,
	"self_test" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_messages_content_length_check" CHECK (char_length("tutor_messages"."content") between 1 and 20000),
	CONSTRAINT "tutor_messages_context_check" CHECK ("tutor_messages"."context" is null or jsonb_typeof("tutor_messages"."context") = 'object'),
	CONSTRAINT "tutor_messages_sources_check" CHECK (jsonb_typeof("tutor_messages"."sources") = 'array'),
	CONSTRAINT "tutor_messages_self_test_check" CHECK ("tutor_messages"."self_test" is null or jsonb_typeof("tutor_messages"."self_test") = 'object')
);
--> statement-breakpoint
ALTER TABLE "chapter_summaries" ADD CONSTRAINT "chapter_summaries_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_summaries" ADD CONSTRAINT "chapter_summaries_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_summaries" ADD CONSTRAINT "chapter_summaries_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_section_id_course_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."course_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_chunk_id_resource_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."resource_chunks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_section_revisions" ADD CONSTRAINT "course_section_revisions_section_id_course_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."course_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_section_revisions" ADD CONSTRAINT "course_section_revisions_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_sections" ADD CONSTRAINT "course_sections_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_sections" ADD CONSTRAINT "course_sections_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_sections" ADD CONSTRAINT "course_sections_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_conversations" ADD CONSTRAINT "tutor_conversations_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_conversations" ADD CONSTRAINT "tutor_conversations_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_messages" ADD CONSTRAINT "tutor_messages_conversation_id_tutor_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."tutor_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_messages" ADD CONSTRAINT "tutor_messages_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chapter_summaries_user_chapter_idx" ON "chapter_summaries" USING btree ("user_id","chapter_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "citations_section_id_idx" ON "citations" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "citations_owner_id_idx" ON "citations" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "citations_chunk_id_idx" ON "citations" USING btree ("chunk_id");--> statement-breakpoint
CREATE INDEX "citations_resource_id_idx" ON "citations" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "course_section_revisions_owner_id_idx" ON "course_section_revisions" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "course_sections_owner_id_idx" ON "course_sections" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "course_sections_chapter_id_idx" ON "course_sections" USING btree ("chapter_id");--> statement-breakpoint
CREATE INDEX "course_sections_notion_ids_idx" ON "course_sections" USING gin ("notion_ids");--> statement-breakpoint
CREATE UNIQUE INDEX "courses_one_current_idx" ON "courses" USING btree ("owner_id","module_id") WHERE "courses"."is_current";--> statement-breakpoint
CREATE INDEX "courses_owner_formation_idx" ON "courses" USING btree ("owner_id","formation_id");--> statement-breakpoint
CREATE INDEX "tutor_conversations_user_course_idx" ON "tutor_conversations" USING btree ("user_id","course_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tutor_messages_conversation_idx" ON "tutor_messages" USING btree ("conversation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "tutor_messages_user_id_idx" ON "tutor_messages" USING btree ("user_id");