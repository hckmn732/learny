// SPEC-2207 — cross-runtime oracle vectors of the course generation domain.
// Runs the real TypeScript pure helpers of `packages/tutor/src/course/generate.ts` and the real
// chapter validation of `@learny/contracts`, and writes the JSON the Python unit tests replay with
// strict equality: corepack pnpm exec tsx tools/oracles/course-vectors.mts [--check]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CourseChapterDraftSchema,
  CourseDraftSchema,
} from '../../packages/contracts/src/course-draft.ts';
import type { KnownChunk } from '../../packages/tutor/src/course/citations.ts';
import { replaceCoursePlaceholders } from '../../packages/tutor/src/course/run.ts';
import {
  MEDIA_KIND,
  SECTION_KIND,
  contentOf,
  dataOf,
  mediaOf,
  notionLinkEnds,
  scenarioFor,
  sectionAnchor,
  selectChapterDocuments,
  type CourseGenerationContext,
} from '../../packages/tutor/src/course/generate.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT = path.join(REPO_ROOT, 'api', 'oracles', 'vectors', 'course.json');
const FIXTURES = path.join(REPO_ROOT, 'packages', 'llm', 'fixtures', 'course');

const CHAPTER = '9f1d4c7b-2a3e-4d5f-8b6a-1c2d3e4f5a6b';
const CHAPTER_2 = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const NOTION = '6a9d2c4b-1e7f-4b3a-8c5d-9e0f1a2b3c03';
const NOTION_2 = '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f60';
const CHUNK = '4f5a6b7c-8d9e-4f0a-9b1c-2d3e4f5a6b80';

function fixture(scenario: string): unknown[] {
  const parsed = JSON.parse(fs.readFileSync(path.join(FIXTURES, `${scenario}.json`), 'utf8')) as {
    steps: { object?: unknown }[];
  };
  return parsed.steps.flatMap((step) => (step.object === undefined ? [] : [step.object]));
}

function chapterOf(overrides: Record<string, unknown>): Record<string, unknown> {
  const markdown = {
    kind: 'markdown',
    title: '  La pièce comptable  ',
    contentMd: 'Toute écriture est une pièce. ',
    sourceChunkIds: [CHUNK],
    notionIds: [NOTION],
  };
  const takeaway = {
    kind: 'takeaway',
    title: 'À retenir',
    points: ['Une pièce a un en-tête.', 'Chaque poste porte une clé.', 'Le débit égale le crédit.'],
    sourceChunkIds: [CHUNK],
    notionIds: [NOTION],
  };
  return {
    chapterId: CHAPTER,
    title: ' Saisie des pièces ',
    baseCourse: false,
    sections: [markdown, takeaway],
    sourceChunkIds: [CHUNK],
    notionIds: [NOTION],
    ...overrides,
  };
}

function baseChapter(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    chapterId: CHAPTER_2,
    title: 'Cours de base',
    baseCourse: true,
    sections: [
      { kind: 'tutor_addition', contentMd: 'Aucun apport.', notionIds: [NOTION_2] },
      { kind: 'takeaway', points: ['A', 'B', 'C'], notionIds: [NOTION_2] },
    ],
    sourceChunkIds: [],
    notionIds: [NOTION_2],
    resourceSuggestions: [
      { title: 'Guide', url: 'https://example.com/guide', reason: 'Les bases.' },
    ],
    ...overrides,
  };
}

const FIXTURE_VALUES = {
  chapterId: CHAPTER,
  chapterTitle: 'Saisie des pièces comptables',
  moduleTitle: 'Comptabilité générale',
  formationTitle: 'SAP S/4HANA Finance',
  notions: [{ id: NOTION }],
  documents: [{ chunkId: CHUNK }],
};

const DRAFTS: { name: string; input: unknown }[] = [
  {
    name: 'sourced',
    input: replaceCoursePlaceholders(fixture('course-sourced')[0], FIXTURE_VALUES),
  },
  { name: 'base', input: replaceCoursePlaceholders(fixture('course-base')[0], FIXTURE_VALUES) },
  ...fixture('course-invalid').map((input, index) => ({ name: `invalid-${String(index)}`, input })),
  { name: 'minimal', input: chapterOf({}) },
  { name: 'trimmed', input: chapterOf({ title: '  Titre  ' }) },
  { name: 'base-chapter', input: baseChapter({}) },
  {
    name: 'no-takeaway',
    input: chapterOf({
      sections: [
        { kind: 'markdown', contentMd: 'X', sourceChunkIds: [CHUNK], notionIds: [NOTION] },
      ],
    }),
  },
  {
    name: 'two-takeaways',
    input: chapterOf({
      sections: [
        { kind: 'takeaway', points: ['A', 'B', 'C'], notionIds: [NOTION] },
        { kind: 'takeaway', points: ['A', 'B', 'C'], notionIds: [NOTION] },
      ],
    }),
  },
  {
    name: 'after-takeaway',
    input: chapterOf({
      sections: [
        { kind: 'takeaway', points: ['A', 'B', 'C'], notionIds: [NOTION] },
        { kind: 'tutor_addition', contentMd: 'Trop tard.', notionIds: [NOTION] },
      ],
    }),
  },
  {
    name: 'two-quick-questions',
    input: chapterOf({
      sections: [
        { kind: 'quick_question', question: 'Q1 ?', answer: 'R1', notionIds: [NOTION] },
        { kind: 'quick_question', question: 'Q2 ?', answer: 'R2', notionIds: [NOTION] },
        { kind: 'takeaway', points: ['A', 'B', 'C'], notionIds: [NOTION] },
      ],
    }),
  },
  {
    name: 'source-union-mismatch',
    input: chapterOf({
      sections: [
        { kind: 'markdown', contentMd: 'X', sourceChunkIds: [CHUNK], notionIds: [NOTION] },
        { kind: 'takeaway', points: ['A', 'B', 'C'], notionIds: [NOTION] },
      ],
      sourceChunkIds: [],
    }),
  },
  {
    name: 'notion-union-mismatch',
    input: chapterOf({
      sections: [
        { kind: 'markdown', contentMd: 'X', sourceChunkIds: [CHUNK], notionIds: [NOTION] },
        { kind: 'takeaway', points: ['A', 'B', 'C'], notionIds: [NOTION] },
      ],
      notionIds: [NOTION, NOTION_2],
    }),
  },
  {
    name: 'base-with-sources',
    input: baseChapter({
      sourceChunkIds: [CHUNK],
      sections: [
        { kind: 'markdown', contentMd: 'X', sourceChunkIds: [CHUNK], notionIds: [NOTION_2] },
        {
          kind: 'takeaway',
          points: ['A', 'B', 'C'],
          sourceChunkIds: [CHUNK],
          notionIds: [NOTION_2],
        },
      ],
    }),
  },
  {
    name: 'sourced-without-source',
    input: chapterOf({
      sections: [
        { kind: 'tutor_addition', contentMd: 'X', notionIds: [NOTION] },
        { kind: 'takeaway', points: ['A', 'B', 'C'], notionIds: [NOTION] },
      ],
      sourceChunkIds: [],
    }),
  },
  { name: 'base-without-suggestion', input: baseChapter({ resourceSuggestions: [] }) },
  {
    name: 'sourced-with-suggestion',
    input: chapterOf({
      resourceSuggestions: [{ title: 'Guide', url: 'https://example.com/g', reason: 'r' }],
    }),
  },
  { name: 'unknown-field', input: chapterOf({ unexpected: true }) },
  { name: 'bad-uuid', input: chapterOf({ chapterId: 'not-a-uuid' }) },
  { name: 'missing-chapter-id', input: { ...chapterOf({}), chapterId: undefined } },
  { name: 'empty-sections', input: chapterOf({ sections: [], sourceChunkIds: [], notionIds: [] }) },
  {
    name: 'two-points',
    input: chapterOf({ sections: [{ kind: 'takeaway', points: ['A', 'B'], notionIds: [NOTION] }] }),
  },
  {
    name: 'eight-points',
    input: chapterOf({
      sections: [
        { kind: 'takeaway', points: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], notionIds: [NOTION] },
      ],
    }),
  },
  {
    name: 'diagram',
    input: chapterOf({
      sections: [
        {
          kind: 'takeaway',
          points: ['A', 'B', 'C'],
          diagram: {
            blocks: [
              { id: 'a', label: 'Pièce' },
              { id: 'b', label: 'Poste' },
            ],
            arrows: [{ from: 'a', to: 'b', label: 'contient' }],
          },
          mnemonic: 'Pièce, poste, clé.',
          sourceChunkIds: [CHUNK],
          notionIds: [NOTION],
        },
      ],
    }),
  },
  {
    name: 'diagram-unknown-block',
    input: chapterOf({
      sections: [
        {
          kind: 'takeaway',
          points: ['A', 'B', 'C'],
          diagram: { blocks: [{ id: 'a', label: 'Pièce' }], arrows: [{ from: 'a', to: 'b' }] },
          notionIds: [NOTION],
        },
      ],
    }),
  },
  {
    name: 'summary-prompt',
    input: chapterOf({
      sections: [
        { kind: 'markdown', contentMd: 'X', sourceChunkIds: [CHUNK], notionIds: [NOTION] },
        { kind: 'takeaway', points: ['A', 'B', 'C'], sourceChunkIds: [CHUNK], notionIds: [NOTION] },
        { kind: 'summary_prompt', title: 'Résumez', prompt: 'Trois phrases.', notionIds: [] },
      ],
    }),
  },
  {
    name: 'comparison',
    input: chapterOf({
      sections: [
        {
          kind: 'comparison',
          left: { title: 'Type', body: 'Classe la pièce.', example: 'SA' },
          right: { title: 'Clé', body: 'Agit poste par poste.', example: '40' },
          sourceChunkIds: [CHUNK],
          notionIds: [NOTION],
        },
        { kind: 'takeaway', points: ['A', 'B', 'C'], notionIds: [NOTION] },
      ],
    }),
  },
  {
    name: 'link',
    input: chapterOf({
      links: [{ fromNotionId: NOTION, toNotionId: NOTION_2, kind: 'confusion' }],
    }),
  },
  {
    name: 'unknown-link-kind',
    input: chapterOf({ links: [{ fromNotionId: NOTION, toNotionId: NOTION_2, kind: 'tutor' }] }),
  },
];

function chunkOf(overrides: Record<string, unknown>): KnownChunk {
  return {
    chunkId: CHUNK,
    ownerId: 'owner',
    chapterId: CHAPTER,
    resourceId: 'resource',
    resourceTitle: 'Guide utilisateur FI — saisie.pdf',
    resourceKind: 'pdf',
    resourceStatus: 'ready',
    resourceDeleted: false,
    resourceMime: 'application/pdf',
    text: 'Toute écriture comptable est une pièce.',
    location: { page: 2, charStart: 0, charEnd: 40 },
    ...overrides,
  } as KnownChunk;
}

function sizedChunks(count: number, chars: number): KnownChunk[] {
  return Array.from({ length: count }, (_unused, index) =>
    chunkOf({
      chunkId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      resourceTitle: 'Guide',
      text: 'a'.repeat(chars),
    }),
  );
}

const documentCases = [
  { name: 'single', chunks: [chunkOf({})] },
  {
    name: 'two',
    chunks: [
      chunkOf({}),
      chunkOf({ resourceTitle: 'Note', resourceKind: 'note', resourceMime: null }),
    ],
  },
  // The database bounds a title to 200 characters: the tag source is never truncated.
  { name: 'title-200', chunks: [chunkOf({ resourceTitle: 'T'.repeat(200) })] },
  { name: 'title-short', chunks: [chunkOf({ resourceTitle: 'Note' })] },
  { name: 'exam-guide', chunks: [chunkOf({ resourceKind: 'exam_guide' })] },
  { name: 'exam-guide-web', chunks: [chunkOf({ resourceKind: 'exam_guide', resourceMime: null })] },
  { name: 'empty', chunks: [] },
];

const anchorCases = [
  {
    chapterPosition: 1,
    sections: [
      { kind: 'markdown', title: 'L’en-tête de pièce' },
      { kind: 'takeaway' },
      { kind: 'quick_question' },
      { kind: 'comparison' },
      { kind: 'summary_prompt' },
      { kind: 'tutor_addition' },
    ],
  },
  { chapterPosition: 12, sections: [{ kind: 'markdown' }, { kind: 'markdown' }] },
  {
    chapterPosition: 2,
    sections: [
      { kind: 'markdown', title: 'Grille de saisie' },
      { kind: 'markdown', title: 'Grille de saisie' },
    ],
  },
  { chapterPosition: 3, sections: [{ kind: 'markdown', title: '  Écritures — débit/crédit  ' }] },
];

const linkCases = [
  { fromNotionId: NOTION, toNotionId: NOTION_2, kind: 'confusion' },
  { fromNotionId: NOTION_2, toNotionId: NOTION, kind: 'confusion' },
  { fromNotionId: NOTION, toNotionId: NOTION_2, kind: 'prerequisite' },
];

const PLACEHOLDER_CASES = [
  {
    name: 'chapter-and-notion',
    values: {
      chapterId: CHAPTER,
      chapterTitle: 'Saisie',
      moduleTitle: 'Comptabilité',
      formationTitle: 'SAP',
      notions: [{ id: NOTION }, { id: NOTION_2 }],
      documents: [{ chunkId: CHUNK }],
    },
    input: {
      chapterId: '{{chapterId}}',
      title: '{{chapterTitle}}',
      notions: ['{{notionId}}', '{{notionId:2}}', '{{notionId:9}}'],
      chunks: ['{{chunkId}}', '{{chunkId:2}}'],
      unknown: '{{unknownValue}}',
    },
  },
];

const SCENARIO_CASES = [
  { name: 'sourced', explicit: undefined, forced: undefined, passages: 1 },
  { name: 'base', explicit: undefined, forced: undefined, passages: 0 },
  { name: 'explicit', explicit: 'course-invalid', forced: undefined, passages: 1 },
  { name: 'forced-wins', explicit: 'course-invalid', forced: 'course-base', passages: 1 },
  { name: 'forced-absent', explicit: 'course-base', forced: undefined, passages: 1 },
];

const vectors = {
  version: 1,
  generatedAt: '2026-11-22',
  sectionKinds: SECTION_KIND,
  mediaKinds: MEDIA_KIND,
  anchors: anchorCases.map((entry) => {
    const used = new Set<string>();
    return {
      chapterPosition: entry.chapterPosition,
      sections: entry.sections,
      expected: entry.sections.map((section, index) =>
        sectionAnchor(
          { position: entry.chapterPosition } as never,
          { ...section, notionIds: [] } as never,
          index + 1,
          used,
        ),
      ),
    };
  }),
  sections: [
    {
      name: 'markdown',
      section: {
        kind: 'markdown',
        title: 'T',
        contentMd: '# Corps',
        sourceChunkIds: [CHUNK],
        notionIds: [NOTION],
      },
    },
    {
      name: 'quick-question',
      section: {
        kind: 'quick_question',
        question: 'Q ?',
        answer: 'R',
        sourceChunkIds: [],
        notionIds: [],
      },
    },
    {
      name: 'comparison',
      section: {
        kind: 'comparison',
        left: { title: 'L', body: 'B', example: 'E' },
        right: { title: 'R', body: 'B', example: 'E' },
        sourceChunkIds: [],
        notionIds: [],
      },
    },
    {
      name: 'tutor-addition',
      section: { kind: 'tutor_addition', contentMd: 'X', notionIds: [NOTION] },
    },
    {
      name: 'takeaway-with-diagram',
      section: {
        kind: 'takeaway',
        points: ['A', 'B', 'C'],
        diagram: { blocks: [{ id: 'a', label: 'A' }], arrows: [] },
        mnemonic: 'ABC',
        sourceChunkIds: [],
        notionIds: [NOTION],
      },
    },
    {
      name: 'takeaway-plain',
      section: { kind: 'takeaway', points: ['A', 'B', 'C'], sourceChunkIds: [], notionIds: [] },
    },
    {
      name: 'summary-prompt',
      section: { kind: 'summary_prompt', title: 'R', prompt: 'P', notionIds: [] },
    },
    { name: 'summary-prompt-empty', section: { kind: 'summary_prompt', notionIds: [] } },
  ].map((entry) => ({
    name: entry.name,
    section: entry.section,
    data: dataOf(entry.section as never),
    content: contentOf(entry.section as never),
  })),
  media: [
    { resourceKind: 'pdf', resourceMime: 'application/pdf', expected: mediaOf(chunkOf({})) },
    {
      resourceKind: 'audio',
      resourceMime: null,
      expected: mediaOf(chunkOf({ resourceKind: 'audio', resourceMime: null })),
    },
    {
      resourceKind: 'youtube',
      resourceMime: null,
      expected: mediaOf(chunkOf({ resourceKind: 'youtube', resourceMime: null })),
    },
    {
      resourceKind: 'note',
      resourceMime: null,
      expected: mediaOf(chunkOf({ resourceKind: 'note', resourceMime: null })),
    },
    {
      resourceKind: 'image',
      resourceMime: null,
      expected: mediaOf(chunkOf({ resourceKind: 'image', resourceMime: null })),
    },
    {
      resourceKind: 'web',
      resourceMime: null,
      expected: mediaOf(chunkOf({ resourceKind: 'web', resourceMime: null })),
    },
    {
      resourceKind: 'video',
      resourceMime: null,
      expected: mediaOf(chunkOf({ resourceKind: 'video', resourceMime: null })),
    },
    {
      resourceKind: 'exam_guide',
      resourceMime: 'application/pdf',
      expected: mediaOf(chunkOf({ resourceKind: 'exam_guide' })),
    },
    {
      resourceKind: 'exam_guide',
      resourceMime: null,
      expected: mediaOf(chunkOf({ resourceKind: 'exam_guide', resourceMime: null })),
    },
    {
      resourceKind: 'other',
      resourceMime: null,
      expected: mediaOf(chunkOf({ resourceKind: 'other', resourceMime: null })),
    },
  ],
  documents: documentCases.map((entry) => ({
    name: entry.name,
    chunks: entry.chunks,
    expected: selectChapterDocuments(entry.chunks),
  })),
  // The course budget holds five passages of 4 778 tokens; the sixth one no longer fits, so the
  // selection stops there. Only the selected identifiers are recorded: the input is reproducible.
  budgets: [
    { name: 'five-of-six', count: 6, chars: 19_000 },
    { name: 'two', count: 2, chars: 19_000 },
    { name: 'none', count: 0, chars: 19_000 },
  ].map((entry) => ({
    name: entry.name,
    count: entry.count,
    chars: entry.chars,
    expected: selectChapterDocuments(sizedChunks(entry.count, entry.chars)).map(
      (document) => document.chunkId,
    ),
  })),
  drafts: DRAFTS.map((entry) => {
    const parsed = CourseChapterDraftSchema.safeParse(entry.input);
    return {
      name: entry.name,
      input: entry.input,
      ok: parsed.success,
      value: parsed.success ? parsed.data : null,
    };
  }),
  courses: [
    { name: 'one', input: { chapters: [chapterOf({})] } },
    { name: 'two', input: { chapters: [chapterOf({}), baseChapter({})] } },
    { name: 'none', input: { chapters: [] } },
    { name: 'unknown-field', input: { chapters: [chapterOf({})], extra: 1 } },
  ].map((entry) => {
    const parsed = CourseDraftSchema.safeParse(entry.input);
    return {
      name: entry.name,
      input: entry.input,
      ok: parsed.success,
      value: parsed.success ? parsed.data : null,
    };
  }),
  links: linkCases.map((entry) => ({ ...entry, expected: notionLinkEnds(entry) })),
  slices: [
    { text: 'abcdef', limit: 3 },
    { text: 'abcdef', limit: 0 },
    { text: 'abcdef', limit: 99 },
    { text: 'L’en-tête de pièce, résumé', limit: 10 },
    { text: 'Résumé — débit/crédit', limit: 12 },
    // A limit inside an astral character is left out: TypeScript splits the surrogate pair.
    { text: 'A😀BC', limit: 1 },
    { text: 'A😀BC', limit: 3 },
    { text: '', limit: 4 },
  ].map((entry) => ({ ...entry, expected: entry.text.slice(0, entry.limit) })),
  placeholders: PLACEHOLDER_CASES.map((entry) => ({
    name: entry.name,
    input: entry.input,
    values: entry.values,
    expected: replaceCoursePlaceholders(entry.input, entry.values as never),
  })),
  scenarios: SCENARIO_CASES.map((entry) => ({
    name: entry.name,
    explicit: entry.explicit ?? null,
    forced: entry.forced ?? null,
    passages: entry.passages,
    expected: scenarioFor(
      {
        deps: {
          ...(entry.explicit === undefined ? {} : { scenario: entry.explicit }),
          ...(entry.forced === undefined ? {} : { scenarioForChapter: () => entry.forced }),
        },
      } as unknown as Pick<CourseGenerationContext, 'deps'>,
      {
        id: CHAPTER,
        passages: Array.from({ length: entry.passages }, () => chunkOf({})),
      } as never,
    ),
  })),
  identifiers: {
    generated: `course-generated:${CHAPTER}`,
    ready: `course-ready:${CHAPTER}`,
    failed: `course-failed:${CHAPTER_2}:3`,
  },
};

const serialized = `${JSON.stringify(vectors, null, 2)}\n`;
if (process.argv.includes('--check')) {
  const current = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : '';
  if (current !== serialized) {
    console.error('course.json is stale: run tools/oracles/course-vectors.mts');
    process.exitCode = 1;
  } else {
    console.log('course.json is up to date.');
  }
} else {
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, serialized);
  console.log(`Wrote ${path.relative(REPO_ROOT, OUTPUT)}`);
}
