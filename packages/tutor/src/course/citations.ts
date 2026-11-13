import type { CourseDraft, CourseSectionDraft } from '@learny/contracts';

// Verification of every citation of a generated course (SPEC-608 EF-2, ET-4, CL-4; BR-COU-02,
// BR-COU-10). The pure function works on a snapshot of the owner's passages: a citation is valid
// only when the chunk exists, belongs to the learner and to the chapter, and its resource is still
// ready and not deleted. The pipeline calls it twice: after generation and just before publishing,
// so a passage deleted between the two reads can never be published (ADR-0039).

export type CitationIssueCode =
  'missing' | 'foreign' | 'other_chapter' | 'deleted' | 'not_ready' | 'outside_context';

export interface KnownChunk {
  chunkId: string;
  ownerId: string;
  chapterId: string | null;
  resourceId: string;
  resourceTitle: string;
  resourceKind: string;
  resourceStatus: string;
  resourceDeleted: boolean;
  resourceMime: string | null;
  /** Text of the passage, used to build the model context inside its data tag. */
  text: string;
  location: Record<string, unknown>;
}

export interface CitationIssue {
  code: CitationIssueCode;
  chapterId: string;
  sectionIndex: number;
  chunkId: string;
  message: string;
}

export interface ResolvedCitation {
  chapterId: string;
  sectionIndex: number;
  sectionKind: CourseSectionDraft['kind'];
  chunk: KnownChunk;
}

export interface CitationValidationInput {
  userId: string;
  chunks: ReadonlyMap<string, KnownChunk>;
  /** Chunk ids selected inside the course context budget; the model cannot cite anything else. */
  allowedChunkIds: ReadonlySet<string>;
}

export type CitationValidation =
  { ok: true; citations: ResolvedCitation[] } | { ok: false; issues: CitationIssue[] };

function sourcesOf(section: CourseSectionDraft): readonly string[] {
  return 'sourceChunkIds' in section ? section.sourceChunkIds : [];
}

function messageOf(code: CitationIssueCode): string {
  switch (code) {
    case 'missing':
      return 'Le passage cité est introuvable.';
    case 'foreign':
      return 'Le passage cité appartient à un autre apprenant.';
    case 'other_chapter':
      return 'Le passage cité appartient à un autre chapitre.';
    case 'deleted':
      return 'Le passage cité a été supprimé.';
    case 'not_ready':
      return 'Le passage cité n’est plus prêt.';
    case 'outside_context':
      return 'Le passage cité ne fait pas partie du contexte envoyé au tuteur.';
  }
}

/**
 * EF-2, CL-4 — resolves every `chunkId` of the draft against the owner's ready passages. A chapter
 * without contribution has no source at all; a `tutor_addition` never carries one (schema rule).
 */
export function validateCourseCitations(
  draft: CourseDraft,
  input: CitationValidationInput,
): CitationValidation {
  const issues: CitationIssue[] = [];
  const citations: ResolvedCitation[] = [];

  for (const chapter of draft.chapters) {
    for (const [sectionIndex, section] of chapter.sections.entries()) {
      for (const chunkId of sourcesOf(section)) {
        const chunk = input.chunks.get(chunkId);
        let code: CitationIssueCode | null = null;
        if (chunk === undefined) code = 'missing';
        else if (chunk.ownerId !== input.userId) code = 'foreign';
        else if (chunk.chapterId !== chapter.chapterId) code = 'other_chapter';
        else if (chunk.resourceDeleted) code = 'deleted';
        else if (chunk.resourceStatus !== 'ready') code = 'not_ready';
        else if (!input.allowedChunkIds.has(chunkId)) code = 'outside_context';

        if (code !== null) {
          issues.push({
            code,
            chapterId: chapter.chapterId,
            sectionIndex,
            chunkId,
            message: messageOf(code),
          });
          continue;
        }
        if (chunk === undefined) continue;
        citations.push({
          chapterId: chapter.chapterId,
          sectionIndex,
          sectionKind: section.kind,
          chunk,
        });
      }
    }
  }

  return issues.length === 0 ? { ok: true, citations } : { ok: false, issues };
}

/** A failed verification is an invalid model output: no version is published. */
export function citationFailureSummary(issues: readonly CitationIssue[]): string {
  return issues
    .slice(0, 8)
    .map((issue) => `${issue.code}: ${issue.chunkId}`)
    .join('; ');
}
