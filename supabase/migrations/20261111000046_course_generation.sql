ALTER TABLE "courses" ADD COLUMN "generation_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "courses_generation_key_idx" ON "courses" USING btree ("owner_id","module_id","generation_key");--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_generation_key_length_check" CHECK ("courses"."generation_key" is null or char_length("courses"."generation_key") between 1 and 200);