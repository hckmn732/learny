CREATE TYPE "public"."formation_accent" AS ENUM('indigo', 'green', 'orange', 'violet', 'teal');--> statement-breakpoint
ALTER TABLE "formations" ADD COLUMN "monogram" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "formations" ADD COLUMN "accent_color" "formation_accent" DEFAULT 'indigo' NOT NULL;--> statement-breakpoint
ALTER TABLE "formations" ADD CONSTRAINT "formations_monogram_length_check" CHECK (char_length("formations"."monogram") <= 3);