CREATE TYPE "public"."legal_document" AS ENUM('cgu', 'privacy');--> statement-breakpoint
CREATE TABLE "data_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"storage_path" text,
	"expires_at" timestamp with time zone,
	"size_bytes" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_exports_storage_path_check" CHECK ("data_exports"."storage_path" is null or char_length("data_exports"."storage_path") between 1 and 1024),
	CONSTRAINT "data_exports_size_bytes_check" CHECK ("data_exports"."size_bytes" is null or "data_exports"."size_bytes" >= 0),
	CONSTRAINT "data_exports_expires_at_check" CHECK ("data_exports"."expires_at" is null or "data_exports"."expires_at" > "data_exports"."created_at")
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"route" text NOT NULL,
	"request_hash" text NOT NULL,
	"response" jsonb,
	"status_code" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY("user_id","key"),
	CONSTRAINT "idempotency_keys_key_check" CHECK ("idempotency_keys"."key" ~ '^[A-Za-z0-9_-]{8,128}$'),
	CONSTRAINT "idempotency_keys_route_check" CHECK (char_length("idempotency_keys"."route") between 1 and 300),
	CONSTRAINT "idempotency_keys_request_hash_check" CHECK ("idempotency_keys"."request_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "idempotency_keys_status_code_check" CHECK ("idempotency_keys"."status_code" between 0 and 599),
	CONSTRAINT "idempotency_keys_completed_at_check" CHECK (("idempotency_keys"."status_code" = 0) = ("idempotency_keys"."completed_at" is null))
);
--> statement-breakpoint
CREATE TABLE "legal_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"document" "legal_document" NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_acceptances_user_id_document_version_unique" UNIQUE("user_id","document","version"),
	CONSTRAINT "legal_acceptances_version_check" CHECK (char_length("legal_acceptances"."version") between 1 and 40)
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"bucket" text PRIMARY KEY NOT NULL,
	"tokens" numeric(12, 4) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_limits_bucket_check" CHECK (char_length("rate_limits"."bucket") between 1 and 300),
	CONSTRAINT "rate_limits_tokens_check" CHECK ("rate_limits"."tokens" >= 0)
);
--> statement-breakpoint
ALTER TABLE "data_exports" ADD CONSTRAINT "data_exports_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_exports_user_id_created_at_idx" ON "data_exports" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "data_exports_expires_at_idx" ON "data_exports" USING btree ("expires_at") WHERE "data_exports"."expires_at" is not null;--> statement-breakpoint
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "legal_acceptances_user_id_accepted_at_idx" ON "legal_acceptances" USING btree ("user_id","accepted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "rate_limits_updated_at_idx" ON "rate_limits" USING btree ("updated_at");