CREATE TABLE "job_deliveries" (
	"event_id" text NOT NULL,
	"consumer" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"run_after" timestamp with time zone NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_deliveries_event_id_consumer_pk" PRIMARY KEY("event_id","consumer"),
	CONSTRAINT "job_deliveries_consumer_check" CHECK ("job_deliveries"."consumer" ~ '^[a-z]+(.[a-z0-9_]+)+$'),
	CONSTRAINT "job_deliveries_status_check" CHECK ("job_deliveries"."status" in ('pending', 'running', 'done', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "event_outbox" ADD COLUMN "dispatched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_deliveries" ADD CONSTRAINT "job_deliveries_event_id_event_outbox_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event_outbox"("event_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_deliveries_ready" ON "job_deliveries" USING btree ("run_after") WHERE "job_deliveries"."status" in ('pending', 'running');--> statement-breakpoint
CREATE INDEX "event_outbox_undispatched" ON "event_outbox" USING btree ("created_at") WHERE "event_outbox"."dispatched_at" is null;