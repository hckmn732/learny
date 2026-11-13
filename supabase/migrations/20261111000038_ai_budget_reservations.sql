CREATE TYPE "public"."ai_reservation_status" AS ENUM('reserved', 'consumed', 'released');--> statement-breakpoint
CREATE TABLE "ai_budget_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"local_day" date NOT NULL,
	"estimated_usd" numeric(12, 6) NOT NULL,
	"status" "ai_reservation_status" DEFAULT 'reserved' NOT NULL,
	"call_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "ai_budget_reservations_estimated_usd_check" CHECK ("ai_budget_reservations"."estimated_usd" > 0)
);
--> statement-breakpoint
ALTER TABLE "ai_budget_reservations" ADD CONSTRAINT "ai_budget_reservations_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_budget_reservations" ADD CONSTRAINT "ai_budget_reservations_call_id_ai_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."ai_calls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_budget_reservations_user_day_idx" ON "ai_budget_reservations" USING btree ("user_id","local_day","status","expires_at");--> statement-breakpoint
CREATE INDEX "ai_budget_reservations_call_id_idx" ON "ai_budget_reservations" USING btree ("call_id");