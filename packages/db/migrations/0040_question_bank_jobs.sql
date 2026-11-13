CREATE TABLE "question_bank_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"formation_id" uuid NOT NULL,
	"notion_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"format" "brick_type" NOT NULL,
	"reason" text NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"requested_count" smallint DEFAULT 4 NOT NULL,
	"available_count" integer DEFAULT 0 NOT NULL,
	"inserted_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"complete" boolean DEFAULT false NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_bank_jobs_key_unique" UNIQUE("user_id","notion_id","format","course_id"),
	CONSTRAINT "question_bank_jobs_reason_check" CHECK ("question_bank_jobs"."reason" in ('course_generated', 'exhaustion', 'nightly', 'manual')),
	CONSTRAINT "question_bank_jobs_format_check" CHECK ("question_bank_jobs"."format" in ('choice_question', 'open_question', 'cloze', 'matching')),
	CONSTRAINT "question_bank_jobs_requested_count_check" CHECK ("question_bank_jobs"."requested_count" between 4 and 20),
	CONSTRAINT "question_bank_jobs_counts_check" CHECK ("question_bank_jobs"."available_count" >= 0 and "question_bank_jobs"."inserted_count" >= 0 and "question_bank_jobs"."duplicate_count" >= 0),
	CONSTRAINT "question_bank_jobs_error_code_check" CHECK ("question_bank_jobs"."error_code" is null or char_length("question_bank_jobs"."error_code") <= 80)
);
--> statement-breakpoint
ALTER TABLE "question_bank_jobs" ADD CONSTRAINT "question_bank_jobs_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_bank_jobs" ADD CONSTRAINT "question_bank_jobs_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_bank_jobs" ADD CONSTRAINT "question_bank_jobs_notion_id_notions_id_fk" FOREIGN KEY ("notion_id") REFERENCES "public"."notions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_bank_jobs" ADD CONSTRAINT "question_bank_jobs_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "question_bank_jobs_pending_idx" ON "question_bank_jobs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "question_bank_jobs_user_idx" ON "question_bank_jobs" USING btree ("user_id","created_at");