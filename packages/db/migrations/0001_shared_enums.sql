CREATE TYPE "public"."actor" AS ENUM('tutor', 'learner', 'import');--> statement-breakpoint
CREATE TYPE "public"."content_origin" AS ENUM('resource', 'tutor');--> statement-breakpoint
CREATE TYPE "public"."course_language" AS ENUM('fr', 'en', 'es', 'de');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'done', 'failed');