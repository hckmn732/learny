-- QA 2026-11-25: OpenCode (Zen) as a personal AI key provider, OpenAI-compatible API.
ALTER TYPE "public"."ai_provider" ADD VALUE IF NOT EXISTS 'opencode';
