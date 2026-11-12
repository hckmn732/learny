CREATE TYPE "public"."ai_call_status" AS ENUM('ok', 'error', 'refused', 'capped', 'invalid_output');--> statement-breakpoint
CREATE TYPE "public"."ai_provider" AS ENUM('anthropic', 'openai', 'mistral', 'deepseek', 'openai_compatible', 'local');--> statement-breakpoint
CREATE TYPE "public"."ai_task" AS ENUM('programme', 'course', 'gaps', 'tutor', 'light');--> statement-breakpoint
CREATE TYPE "public"."credential_status" AS ENUM('untested', 'qualified', 'failed');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('none', 'active', 'past_due', 'canceled', 'incomplete');--> statement-breakpoint
CREATE TABLE "ai_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"formation_id" uuid,
	"task" "ai_task" NOT NULL,
	"provider" "ai_provider" NOT NULL,
	"model" text NOT NULL,
	"managed" boolean DEFAULT false NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"status" "ai_call_status" NOT NULL,
	"error_code" text,
	"batch" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_calls_model_check" CHECK (char_length("ai_calls"."model") between 1 and 200),
	CONSTRAINT "ai_calls_input_tokens_check" CHECK ("ai_calls"."input_tokens" >= 0),
	CONSTRAINT "ai_calls_output_tokens_check" CHECK ("ai_calls"."output_tokens" >= 0),
	CONSTRAINT "ai_calls_cache_read_tokens_check" CHECK ("ai_calls"."cache_read_tokens" >= 0),
	CONSTRAINT "ai_calls_cache_write_tokens_check" CHECK ("ai_calls"."cache_write_tokens" >= 0),
	CONSTRAINT "ai_calls_cost_usd_check" CHECK ("ai_calls"."cost_usd" >= 0),
	CONSTRAINT "ai_calls_latency_ms_check" CHECK ("ai_calls"."latency_ms" >= 0),
	CONSTRAINT "ai_calls_error_code_check" CHECK ("ai_calls"."error_code" is null or char_length("ai_calls"."error_code") between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "ai_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "ai_provider" NOT NULL,
	"label" text NOT NULL,
	"base_url" text,
	"model_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"encrypted_key" "bytea",
	"key_last4" text,
	"status" "credential_status" DEFAULT 'untested' NOT NULL,
	"qualification" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"outside_eu" boolean DEFAULT false NOT NULL,
	"qualified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_credentials_label_check" CHECK (char_length("ai_credentials"."label") between 1 and 80),
	CONSTRAINT "ai_credentials_base_url_check" CHECK ("ai_credentials"."base_url" is null or char_length("ai_credentials"."base_url") between 1 and 2048),
	CONSTRAINT "ai_credentials_key_required_check" CHECK ("ai_credentials"."provider" = 'local' or "ai_credentials"."encrypted_key" is not null),
	CONSTRAINT "ai_credentials_encrypted_key_check" CHECK ("ai_credentials"."encrypted_key" is null or octet_length("ai_credentials"."encrypted_key") >= 29),
	CONSTRAINT "ai_credentials_key_last4_check" CHECK (("ai_credentials"."encrypted_key" is null and "ai_credentials"."key_last4" is null) or ("ai_credentials"."encrypted_key" is not null and char_length("ai_credentials"."key_last4") = 4)),
	CONSTRAINT "ai_credentials_qualification_check" CHECK (jsonb_typeof("ai_credentials"."qualification") = 'object')
);
--> statement-breakpoint
CREATE TABLE "ai_task_models" (
	"user_id" uuid NOT NULL,
	"task" "ai_task" NOT NULL,
	"credential_id" uuid,
	"model_id" text NOT NULL,
	CONSTRAINT "ai_task_models_pkey" PRIMARY KEY("user_id","task"),
	CONSTRAINT "ai_task_models_model_id_check" CHECK (char_length("ai_task_models"."model_id") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" "subscription_status" DEFAULT 'none' NOT NULL,
	"current_period_end" timestamp with time zone,
	"daily_cap_usd" numeric(12, 6) DEFAULT '1.5' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id"),
	CONSTRAINT "subscriptions_stripe_customer_id_check" CHECK ("subscriptions"."stripe_customer_id" is null or char_length("subscriptions"."stripe_customer_id") between 1 and 255),
	CONSTRAINT "subscriptions_stripe_subscription_id_check" CHECK ("subscriptions"."stripe_subscription_id" is null or char_length("subscriptions"."stripe_subscription_id") between 1 and 255),
	CONSTRAINT "subscriptions_daily_cap_usd_check" CHECK ("subscriptions"."daily_cap_usd" > 0)
);
--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credentials" ADD CONSTRAINT "ai_credentials_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_task_models" ADD CONSTRAINT "ai_task_models_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_task_models" ADD CONSTRAINT "ai_task_models_credential_id_ai_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."ai_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_calls_user_id_created_at_idx" ON "ai_calls" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_calls_formation_id_idx" ON "ai_calls" USING btree ("formation_id");--> statement-breakpoint
CREATE INDEX "ai_credentials_user_id_created_at_idx" ON "ai_credentials" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_task_models_credential_id_idx" ON "ai_task_models" USING btree ("credential_id");