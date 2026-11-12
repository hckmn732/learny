CREATE TYPE "public"."resource_kind" AS ENUM('note', 'pdf', 'web', 'youtube', 'image', 'audio', 'video', 'exam_guide');--> statement-breakpoint
CREATE TYPE "public"."resource_origin" AS ENUM('learner', 'tutor_suggestion');--> statement-breakpoint
CREATE TYPE "public"."resource_status" AS ENUM('queued', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."suggestion_status" AS ENUM('pending', 'imported', 'dismissed');--> statement-breakpoint
CREATE TABLE "resource_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"formation_id" uuid NOT NULL,
	"chapter_id" uuid,
	"position" integer NOT NULL,
	"text" text NOT NULL,
	"location" jsonb NOT NULL,
	"token_count" integer,
	"embedding" extensions.vector(1024),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resource_chunks_resource_id_position_unique" UNIQUE("resource_id","position"),
	CONSTRAINT "resource_chunks_position_check" CHECK ("resource_chunks"."position" >= 0),
	CONSTRAINT "resource_chunks_text_length_check" CHECK (char_length("resource_chunks"."text") between 1 and 20000),
	CONSTRAINT "resource_chunks_location_check" CHECK (jsonb_typeof("resource_chunks"."location") = 'object' and "resource_chunks"."location" ? 'charStart' and "resource_chunks"."location" ? 'charEnd'),
	CONSTRAINT "resource_chunks_token_count_check" CHECK ("resource_chunks"."token_count" is null or "resource_chunks"."token_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"formation_id" uuid NOT NULL,
	"chapter_id" uuid,
	"kind" "resource_kind" NOT NULL,
	"origin" "resource_origin" DEFAULT 'learner' NOT NULL,
	"suggestion_status" "suggestion_status",
	"title" text NOT NULL,
	"content_text" text,
	"storage_path" text,
	"url" text,
	"mime" text,
	"size_bytes" bigint,
	"status" "resource_status" DEFAULT 'queued' NOT NULL,
	"error_code" text,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resources_title_length_check" CHECK (char_length("resources"."title") between 1 and 200),
	CONSTRAINT "resources_storage_path_check" CHECK ("resources"."storage_path" is null or ("resources"."storage_path" ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/.+$' and char_length("resources"."storage_path") <= 512)),
	CONSTRAINT "resources_url_check" CHECK ("resources"."url" is null or ("resources"."url" ~ '^https://' and char_length("resources"."url") <= 2048)),
	CONSTRAINT "resources_mime_length_check" CHECK ("resources"."mime" is null or char_length("resources"."mime") <= 127),
	CONSTRAINT "resources_size_bytes_check" CHECK ("resources"."size_bytes" is null or "resources"."size_bytes" >= 0),
	CONSTRAINT "resources_error_code_length_check" CHECK ("resources"."error_code" is null or char_length("resources"."error_code") <= 64),
	CONSTRAINT "resources_error_message_length_check" CHECK ("resources"."error_message" is null or char_length("resources"."error_message") <= 1000),
	CONSTRAINT "resources_metadata_check" CHECK (jsonb_typeof("resources"."metadata") = 'object'),
	CONSTRAINT "resources_note_shape" CHECK ("resources"."kind" <> 'note' or "resources"."deleted_at" is not null or ("resources"."content_text" is not null and char_length("resources"."content_text") <= 100000 and "resources"."storage_path" is null and "resources"."url" is null)),
	CONSTRAINT "resources_file_shape" CHECK ("resources"."kind" not in ('pdf', 'image', 'audio', 'video') or "resources"."storage_path" is not null),
	CONSTRAINT "resources_link_shape" CHECK ("resources"."kind" not in ('web', 'youtube') or "resources"."url" is not null),
	CONSTRAINT "resources_exam_guide_shape" CHECK ("resources"."kind" <> 'exam_guide' or "resources"."storage_path" is not null or "resources"."url" is not null),
	CONSTRAINT "resources_suggestion_shape" CHECK (("resources"."origin" = 'tutor_suggestion') = ("resources"."suggestion_status" is not null) and ("resources"."origin" = 'learner' or "resources"."url" is not null)),
	CONSTRAINT "resources_failed_has_error" CHECK ("resources"."status" <> 'failed' or "resources"."error_code" is not null),
	CONSTRAINT "resources_content_max" CHECK ("resources"."content_text" is null or char_length("resources"."content_text") <= 2000000),
	CONSTRAINT "resources_pdf_size" CHECK ("resources"."kind" <> 'pdf' or "resources"."size_bytes" is null or "resources"."size_bytes" <= 52428800),
	CONSTRAINT "resources_image_size" CHECK ("resources"."kind" <> 'image' or "resources"."size_bytes" is null or "resources"."size_bytes" <= 10485760),
	CONSTRAINT "resources_pdf_pages" CHECK ("resources"."kind" <> 'pdf' or coalesce(("resources"."metadata" ->> 'pages')::int, 0) <= 500)
);
--> statement-breakpoint
ALTER TABLE "resource_chunks" ADD CONSTRAINT "resource_chunks_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_chunks" ADD CONSTRAINT "resource_chunks_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_chunks" ADD CONSTRAINT "resource_chunks_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_chunks" ADD CONSTRAINT "resource_chunks_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resource_chunks_owner_resource_idx" ON "resource_chunks" USING btree ("owner_id","resource_id");--> statement-breakpoint
CREATE INDEX "resource_chunks_owner_formation_idx" ON "resource_chunks" USING btree ("owner_id","formation_id");--> statement-breakpoint
CREATE INDEX "resource_chunks_chapter_idx" ON "resource_chunks" USING btree ("chapter_id");--> statement-breakpoint
CREATE INDEX "resources_owner_chapter_idx" ON "resources" USING btree ("owner_id","chapter_id");--> statement-breakpoint
CREATE INDEX "resources_formation_id_idx" ON "resources" USING btree ("formation_id");--> statement-breakpoint
CREATE INDEX "resources_status_idx" ON "resources" USING btree ("status") WHERE "resources"."status" in ('queued', 'processing');