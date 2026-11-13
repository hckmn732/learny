import {
  ProgrammeDraftSchema,
  ProgrammeProposalPayloadSchema,
  type ProgrammeDraft,
  type ProgrammeProposalPayload,
} from '@learny/contracts';
import { AppError } from '@learny/core';

// Pure rules of the proposed programme (SPEC-605 ET-3, ET-4, CA-2). A draft has no positions: the
// service numbers it once, then the stored payload is validated again with the ordered schema so a
// duplicate position, a duplicate notion or an inconsistent date can never reach the database.

export function normalizeDraft(raw: unknown): ProgrammeProposalPayload {
  const parsed = ProgrammeDraftSchema.safeParse(raw);
  if (!parsed.success) throw incomplete(parsed.error.issues);
  const draft: ProgrammeDraft = parsed.data;
  const payload: ProgrammeProposalPayload = {
    description: draft.description,
    volumeHours: draft.volumeHours,
    summary: draft.summary,
    modules: draft.modules.map((module, moduleIndex) => ({
      position: moduleIndex + 1,
      title: module.title,
      objectives: module.objectives,
      plannedStart: module.plannedStart,
      plannedEnd: module.plannedEnd,
      threshold: module.threshold,
      chapters: module.chapters.map((chapter, chapterIndex) => ({
        position: chapterIndex + 1,
        title: chapter.title,
        notions: chapter.notions,
      })),
    })),
  };
  const checked = ProgrammeProposalPayloadSchema.safeParse(payload);
  if (!checked.success) throw incomplete(checked.error.issues);
  return checked.data;
}

export function parseProposalPayload(value: unknown): ProgrammeProposalPayload {
  const parsed = ProgrammeProposalPayloadSchema.safeParse(value);
  if (!parsed.success) throw incomplete(parsed.error.issues);
  return parsed.data;
}

export function incomplete(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): AppError {
  return new AppError(
    'PROGRAMME_INCOMPLETE',
    'Le programme est incomplet ou incohérent. Ajustez-le avec le tuteur avant de le valider.',
    {
      status: 422,
      errors: issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    },
  );
}

export function totalChapters(payload: ProgrammeProposalPayload): number {
  return payload.modules.reduce((count, module) => count + module.chapters.length, 0);
}

export function totalNotions(payload: ProgrammeProposalPayload): number {
  return payload.modules.reduce(
    (count, module) =>
      count +
      module.chapters.reduce((chapterCount, chapter) => chapterCount + chapter.notions.length, 0),
    0,
  );
}
