CREATE TYPE "public"."programme_source" AS ENUM('generated', 'imported');--> statement-breakpoint
CREATE TABLE "programme_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"formation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"source" "programme_source" NOT NULL,
	"description" text,
	"volume_hours" smallint,
	"summary" text,
	"payload" jsonb NOT NULL,
	"import_id" uuid,
	"change_request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "programme_proposals_formation_version_unique" UNIQUE("formation_id","version"),
	CONSTRAINT "programme_proposals_version_check" CHECK ("programme_proposals"."version" >= 1),
	CONSTRAINT "programme_proposals_payload_check" CHECK (jsonb_typeof("programme_proposals"."payload") = 'object'),
	CONSTRAINT "programme_proposals_description_length_check" CHECK ("programme_proposals"."description" is null or char_length("programme_proposals"."description") <= 2000),
	CONSTRAINT "programme_proposals_volume_hours_check" CHECK ("programme_proposals"."volume_hours" is null or "programme_proposals"."volume_hours" between 1 and 2000),
	CONSTRAINT "programme_proposals_summary_length_check" CHECK ("programme_proposals"."summary" is null or char_length("programme_proposals"."summary") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "programme_imports" ADD COLUMN "original_filename" text;--> statement-breakpoint
ALTER TABLE "programme_imports" ADD COLUMN "original_size" integer;--> statement-breakpoint
ALTER TABLE "programme_imports" ADD COLUMN "original_content" text;--> statement-breakpoint
ALTER TABLE "programme_proposals" ADD CONSTRAINT "programme_proposals_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programme_proposals" ADD CONSTRAINT "programme_proposals_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programme_proposals" ADD CONSTRAINT "programme_proposals_import_id_programme_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."programme_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programme_proposals" ADD CONSTRAINT "programme_proposals_change_request_id_programme_change_requests_id_fk" FOREIGN KEY ("change_request_id") REFERENCES "public"."programme_change_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "programme_proposals_formation_idx" ON "programme_proposals" USING btree ("formation_id");--> statement-breakpoint
CREATE INDEX "programme_proposals_user_id_idx" ON "programme_proposals" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "programme_imports" ADD CONSTRAINT "programme_imports_original_check" CHECK (("programme_imports"."source_kind" = 'file') = ("programme_imports"."original_content" is not null));--> statement-breakpoint
ALTER TABLE "programme_imports" ADD CONSTRAINT "programme_imports_original_filename_length_check" CHECK ("programme_imports"."original_filename" is null or char_length("programme_imports"."original_filename") <= 200);--> statement-breakpoint
ALTER TABLE "programme_imports" ADD CONSTRAINT "programme_imports_original_content_length_check" CHECK ("programme_imports"."original_content" is null or char_length("programme_imports"."original_content") <= 950000);--> statement-breakpoint
ALTER TABLE "programme_imports" ADD CONSTRAINT "programme_imports_original_size_check" CHECK ("programme_imports"."original_size" is null or "programme_imports"."original_size" between 1 and 1000000);