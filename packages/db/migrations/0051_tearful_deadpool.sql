CREATE TABLE "offline_sync_receipts" (
	"user_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"status" text NOT NULL,
	"answer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offline_sync_receipts_pkey" PRIMARY KEY("user_id","client_id"),
	CONSTRAINT "offline_sync_receipts_status_check" CHECK ("offline_sync_receipts"."status" in ('applied', 'conflict', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "offline_sync_receipts" ADD CONSTRAINT "offline_sync_receipts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_sync_receipts" ADD CONSTRAINT "offline_sync_receipts_answer_id_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."answers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "offline_sync_receipts_created_at_idx" ON "offline_sync_receipts" USING btree ("created_at");