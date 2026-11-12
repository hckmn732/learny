CREATE TYPE "public"."group_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TABLE "group_members" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "group_role" DEFAULT 'member' NOT NULL,
	"member_status" "formation_status" DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "group_members_pkey" PRIMARY KEY("group_id","user_id"),
	CONSTRAINT "group_members_member_status_check" CHECK ("group_members"."member_status" in ('active', 'paused', 'completed')),
	CONSTRAINT "group_members_left_at_check" CHECK ("group_members"."left_at" is null or "group_members"."left_at" >= "group_members"."joined_at")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"formation_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"invite_code" text NOT NULL,
	"max_members" smallint DEFAULT 10 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code_rotated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_formation_id_unique" UNIQUE("formation_id"),
	CONSTRAINT "groups_invite_code_unique" UNIQUE("invite_code"),
	CONSTRAINT "groups_invite_code_format_check" CHECK ("groups"."invite_code" ~ '^LRN-[A-Z2-9]{4}$'),
	CONSTRAINT "groups_max_members_check" CHECK ("groups"."max_members" between 2 and 10),
	CONSTRAINT "groups_code_rotated_at_check" CHECK ("groups"."code_rotated_at" >= "groups"."created_at")
);
--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_members_user_id_idx" ON "group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "group_members_group_id_active_idx" ON "group_members" USING btree ("group_id") WHERE "group_members"."left_at" is null;--> statement-breakpoint
CREATE INDEX "groups_owner_id_idx" ON "groups" USING btree ("owner_id");