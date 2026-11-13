-- SPEC-610 ET-1, ET-3, ADR-0040 — a discussion is opened on one chapter of the course version.
-- The column stays nullable for the conversations created before this specification; the service
-- fills it on every new conversation and falls back to the course's first chapter when it is null.
alter table public.tutor_conversations
  add column if not exists chapter_id uuid references public.chapters(id) on delete cascade;

create index if not exists tutor_conversations_chapter_idx
  on public.tutor_conversations (chapter_id);
