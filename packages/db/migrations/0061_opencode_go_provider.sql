-- QA 2026-11-25: OpenCode Go (subscription endpoint), distinct from OpenCode Zen credits.
ALTER TYPE "public"."ai_provider" ADD VALUE IF NOT EXISTS 'opencode_go';
