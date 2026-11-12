ALTER TABLE "ai_calls" DROP CONSTRAINT "ai_calls_user_id_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_calls" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "data_exports" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "data_exports" ADD COLUMN "requested_on" date;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_exports_user_id_requested_on_idx" ON "data_exports" USING btree ("user_id","requested_on") WHERE "data_exports"."requested_on" is not null;--> statement-breakpoint
ALTER TABLE "data_exports" ADD CONSTRAINT "data_exports_error_length_check" CHECK ("data_exports"."error" is null or char_length("data_exports"."error") <= 2000);