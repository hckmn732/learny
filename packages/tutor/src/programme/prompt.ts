import type { TutorDocument, TutorProfile } from '@learny/contracts';

import { buildTutorPrompt, type BuiltTutorPrompt } from '../context';

// Prompt of the structured programme task (SPEC-605 ET-3; SPEC-512 for web search). It reuses the
// versioned `programme.md` prompt and appends the JSON contract of one proposal version, so the
// model cannot answer with free prose. Learner and imported content always stays inside the data
// message built by `buildTutorPrompt` (ADR-0023).

const STRUCTURE_INSTRUCTION = `## Structured proposal mode

Return exactly one \`ProgrammeDraft\` object and nothing else:

- \`description\`: one short presentation of the formation, or null.
- \`volumeHours\`: total volume in hours, or null.
- \`summary\`: two or three sentences explaining the main trade-offs, or null.
- \`modules\`: one to twenty ordered modules. A module is \`{ title, objectives, plannedStart,
  plannedEnd, threshold, chapters }\`:
  - \`objectives\`: one to eight measurable objectives;
  - \`plannedStart\` and \`plannedEnd\`: civil dates \`YYYY-MM-DD\`, start before or equal to end;
  - \`threshold\`: integer from 60 to 95, 80 when the objective does not justify another value;
  - \`chapters\`: one to forty ordered chapters \`{ title, notions }\`;
  - \`notions\`: one to thirty \`{ label, definition }\`, unique inside a chapter.
- Modules are ordered by start date. Never invent a date, a notion or a source that the data does
  not support. An adjustment returns the complete new version, not a patch.`;

export interface ProgrammePromptInput {
  title: string;
  profile: TutorProfile;
  /** Operation-specific data (cadrage, previous version, imported text). */
  message: string;
  context?: string;
  documents?: readonly TutorDocument[];
  history?: readonly { role: 'learner' | 'tutor'; content: string }[];
}

export function buildProgrammePrompt(input: ProgrammePromptInput): BuiltTutorPrompt {
  const base = buildTutorPrompt(
    'programme',
    {
      message: input.message,
      ...(input.context === undefined ? {} : { context: input.context }),
      ...(input.documents === undefined ? {} : { documents: [...input.documents] }),
      ...(input.history === undefined ? {} : { history: [...input.history] }),
    },
    input.profile,
  );
  return {
    ...base,
    system: [...base.system, { text: STRUCTURE_INSTRUCTION, cache: false }],
  };
}

export const PROGRAMME_PROMPT_ID = 'programme.programme';
