import type { CourseChapterDraft, TutorDocument, TutorProfile } from '@learny/contracts';

import { buildTutorPrompt, type BuiltTutorPrompt } from '../context';

// Prompt of the structured course task (SPEC-608 EF-1, EF-2, ET-3, ET-4; BR-COU-01 to BR-COU-06).
// It reuses the versioned `course.md` prompt and appends the JSON contract of one chapter, so the
// model answers with a typed `CourseChapterDraft` instead of free prose. Every contribution stays
// inside the `<document>` data blocks built by `buildTutorPrompt` (ADR-0023).

const STRUCTURE_INSTRUCTION = `## Structured course chapter mode

Return exactly one \`CourseChapterDraft\` object and nothing else:

- \`chapterId\`: the exact chapter identifier given in the task context.
- \`title\`: the chapter title.
- \`baseCourse\`: true only when the task context says no contribution is available.
- \`sections\`: one to forty ordered sections, discriminated by \`kind\`:
  - \`{ kind: "markdown", title?, contentMd, sourceChunkIds, notionIds }\`: a sourced passage.
    \`sourceChunkIds\` holds at least one exact \`chunkId\` from the context.
  - \`{ kind: "quick_question", question, answer, sourceChunkIds?, notionIds? }\`: one flash
    question before a section; the interface hides the answer.
  - \`{ kind: "comparison", left, right, sourceChunkIds?, notionIds? }\`: a "Ne pas confondre"
    block; each side is \`{ title, body, example }\`.
  - \`{ kind: "tutor_addition", contentMd, notionIds? }\`: a passage written from your own
    knowledge. It never carries a source and is displayed as "Complété par le tuteur".
  - \`{ kind: "takeaway", points, diagram?, mnemonic?, sourceChunkIds?, notionIds? }\`: exactly
    one per chapter, closing it with three to seven points. A simple block/arrow diagram is used
    when it helps; a mnemonic is required for a list, an order or a number.
  - \`{ kind: "summary_prompt", title?, prompt?, notionIds? }\`: optional invitation to write a
    summary. It may follow the takeaway but nothing may follow it.
- \`sourceChunkIds\`: exactly the union of the section source ids.
- \`notionIds\`: exactly the union of the section notion ids.
- \`links\`: optional \`{ fromNotionId, toNotionId, kind: "prerequisite" | "confusion" }\` links
  between notions of the formation.
- \`resourceSuggestions\`: only for a base course, one to five \`{ title, url, reason }\` public
  HTTPS resources.

Never invent a \`chunkId\`, a page, a minute, an anchor or a URL. A sentence taken from a
contribution cites the exact passage it comes from. Write the learner-facing text in the course
language of the profile; fixed interface labels stay in French.`;

export interface CoursePromptNotion {
  id: string;
  label: string;
  definition: string | null;
}

export interface CoursePromptInput {
  profile: TutorProfile;
  chapterId: string;
  chapterTitle: string;
  chapterPosition: number;
  moduleTitle: string;
  formationTitle: string;
  notions: readonly CoursePromptNotion[];
  /** Passages selected within the course context budget. */
  documents: readonly TutorDocument[];
  baseCourse: boolean;
}

function contextOf(input: CoursePromptInput): string {
  return JSON.stringify({
    formation: input.formationTitle,
    module: input.moduleTitle,
    chapter: {
      id: input.chapterId,
      title: input.chapterTitle,
      position: input.chapterPosition,
    },
    notions: input.notions.map((notion) => ({
      id: notion.id,
      label: notion.label,
      definition: notion.definition,
    })),
    baseCourse: input.baseCourse,
    allowedChunkIds: input.documents.flatMap((document) =>
      document.chunkId === undefined ? [] : [document.chunkId],
    ),
  });
}

export function buildCoursePrompt(input: CoursePromptInput): BuiltTutorPrompt {
  const base = buildTutorPrompt(
    'course',
    {
      message: input.baseCourse
        ? `Rédige le cours de base du chapitre « ${input.chapterTitle} ». Aucun apport n’est disponible : signale-le et propose des ressources.`
        : `Rédige le chapitre « ${input.chapterTitle} » à partir des apports fournis. Chaque passage sourcé cite son chunkId.`,
      context: contextOf(input),
      documents: [...input.documents],
    },
    input.profile,
  );
  return {
    ...base,
    system: [...base.system, { text: STRUCTURE_INSTRUCTION, cache: false }],
  };
}

export const COURSE_PROMPT_ID = 'course.course';
export const COURSE_MAX_CORRECTIONS = 2;

/** Shape returned to the pipeline; the chapter is aggregated with the other chapters. */
export type CourseChapterOutput = CourseChapterDraft;
