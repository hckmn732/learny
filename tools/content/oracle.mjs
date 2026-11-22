// Oracle vectors of the content domain (SPEC-2203).
//
// Runs the TypeScript implementation on the same inputs the pytest suite replays, so the Python
// port is compared to the source of truth instead of to a hand-written expectation.
//
//   corepack pnpm exec tsx tools/content/oracle.mjs
//
// Character offsets are JavaScript UTF-16 units in the recordings; the Python port reports code
// point offsets, so inputs with astral characters are left out and the divergence is recorded in
// ADR-2025.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import {
  chunkText,
  excerptOf,
  fakeEmbedding,
  toVectorLiteral,
  TARGET_TOKENS,
  OVERLAP_TOKENS,
} from '@learny/ingestion';
import {
  compareRetrievalChunks,
  deduplicateChunks,
  formatChunkLocation,
  formatDocumentChunk,
  normalizeDocumentText,
  selectContext,
  textOverlapRatio,
} from '@learny/ingestion';

import { estimateTokens } from '../../packages/llm/src/types.ts';

const PARAGRAPHS = [
  'The first paragraph covers photosynthesis and light.',
  'The second paragraph explains cellular respiration.',
  'A third, longer paragraph returns to chloroplasts and chlorophyll.',
].join('\n\n');

const LONG = `${'phrase courte. '.repeat(60)}\n\n${'mot '.repeat(900)}`;

const ACCENTS =
  'L\u2019\u00e9l\u00e8ve r\u00e9vise l\u2019histoire g\u00e9n\u00e9rale.\n\nDeuxi\u00e8me paragraphe : \u00e7a compte.';

function chunksOf(text, locations, targetTokens, overlapTokens) {
  return chunkText({
    text,
    ...(locations === undefined ? {} : { locations }),
    ...(targetTokens === undefined ? {} : { targetTokens }),
    ...(overlapTokens === undefined ? {} : { overlapTokens }),
  });
}

const chunkCases = [
  { name: 'paragraphs-default', text: PARAGRAPHS },
  { name: 'long-paragraphs', text: LONG },
  { name: 'small-target', text: PARAGRAPHS, targetTokens: 20, overlapTokens: 5 },
  { name: 'no-overlap', text: PARAGRAPHS, targetTokens: 40, overlapTokens: 0 },
  { name: 'accents', text: ACCENTS },
  {
    name: 'pdf-pages',
    text: 'Page une.\n\nToujours page une.\n\nPage deux.',
    locations: [
      { page: 1, charStart: 0, charEnd: 29 },
      { page: 2, charStart: 31, charEnd: 41 },
    ],
  },
  {
    name: 'anchors',
    text: 'Intro.\n\nSection A.\n\nSection B.',
    locations: [
      { anchor: 'intro', charStart: 0, charEnd: 6 },
      { anchor: 'section-a', charStart: 8, charEnd: 18 },
      { anchor: 'section-b', charStart: 20, charEnd: 30 },
    ],
  },
];

const chunks = chunkCases.map((item) => ({
  name: item.name,
  chunks: chunksOf(item.text, item.locations, item.targetTokens, item.overlapTokens),
}));

const retrievalChunks = [
  {
    chunkId: '00000000-0000-4000-8000-000000000001',
    resourceId: '00000000-0000-4000-8000-0000000000aa',
    source: 'Cours de biologie',
    position: 0,
    score: 0.91,
    text: 'La photosynthese transforme la lumiere en energie chimique.',
    location: { page: 3, charStart: 12, charEnd: 74 },
    tokenCount: 16,
  },
  {
    chunkId: '00000000-0000-4000-8000-000000000002',
    resourceId: '00000000-0000-4000-8000-0000000000aa',
    source: 'Cours de biologie',
    position: 1,
    score: 0.91,
    text: 'La photosynthese transforme la lumiere en energie chimique.  ',
    location: { page: 4, charStart: 0, charEnd: 62 },
    tokenCount: 16,
  },
  {
    chunkId: '00000000-0000-4000-8000-000000000003',
    resourceId: '00000000-0000-4000-8000-0000000000bb',
    source: 'Anatomie',
    position: 2,
    score: 0.5,
    text: 'Le coeur, muscle creux.',
    location: { startSec: 12.5, endSec: 18, charStart: 0, charEnd: 28 },
    tokenCount: 8,
  },
  {
    chunkId: '00000000-0000-4000-8000-000000000004',
    resourceId: '00000000-0000-4000-8000-0000000000bb',
    source: 'Anatomie',
    position: 3,
    score: 0.7,
    text: 'Les <document> balises & guillemets " sont echappes.',
    location: { anchor: 'note-1', charStart: 0, charEnd: 48 },
    tokenCount: 13,
  },
];

const deduplicated = deduplicateChunks(retrievalChunks);

const selectionCases = [
  { name: 'task-budget', task: 'tutor' },
  { name: 'explicit-budget', task: 'course', tokenBudget: 60 },
  { name: 'empty', task: 'gaps', chunks: [] },
  { name: 'tiny-budget', task: 'tutor', tokenBudget: 1 },
].map((item) => ({
  name: item.name,
  result: selectContext(item.chunks ?? retrievalChunks, item.task, item.tokenBudget),
}));

const embeddings = [
  'La photosynthese.',
  '',
  'Un texte plus long avec des accents \u00e9\u00e8\u00e0.',
  'x',
].map((text) => ({ text, vector: fakeEmbedding(text) }));

const tokens = [
  'bonjour',
  'le monde entier',
  'a'.repeat(7),
  'L\u2019\u00e9l\u00e8ve',
  '\u{1f600}\u{1f600}',
  'mot '.repeat(100),
].map((text) => ({ text, tokens: estimateTokens(text) }));

const payload = {
  generatedBy: 'tools/content/oracle.mjs',
  targetTokens: TARGET_TOKENS,
  overlapTokens: OVERLAP_TOKENS,
  tokens,
  chunks,
  excerpt: excerptOf('Le contenu, page 3.', { charStart: 3, charEnd: 10 }),
  normalize: [
    '  L\u2019\u00c9l\u00e8ve   r\u00e9vise.  ',
    'l\u2019\u00e9l\u00e8ve r\u00e9vise.',
    'Ligne\n\nsuivante\ttabulee',
  ].map((text) => ({ text, normalized: normalizeDocumentText(text) })),
  overlaps: [
    ['abcde', 'abcde'],
    ['abcde', 'abcdef'],
    ['Le chat dort.', 'le   CHAT dort.'],
    ['', 'texte'],
    ['abcdefghij', 'abcdefghij'],
  ].map(([left, right]) => ({ left, right, ratio: textOverlapRatio(left, right) })),
  order: [...retrievalChunks].sort(compareRetrievalChunks).map((chunk) => chunk.chunkId),
  deduplicated: {
    duplicates: deduplicated.duplicates,
    kept: deduplicated.kept.map((c) => c.chunkId),
  },
  documents: retrievalChunks.map((chunk) => ({
    chunkId: chunk.chunkId,
    document: formatDocumentChunk(chunk),
    location: formatChunkLocation(chunk.location),
  })),
  selections: selectionCases,
  embeddings: embeddings.map((entry) => ({
    text: entry.text,
    dim: entry.vector.length,
    head: entry.vector.slice(0, 4),
    digest: createHash('sha256').update(entry.vector.map(String).join(',')).digest('hex'),
  })),
  vectorLiteral: toVectorLiteral([0.5, -0.25, 1, 0]),
  overlapThreshold: 0.8,
};

writeFileSync(
  'packages-py/learny/tests/fixtures/content_domain.json',
  `${JSON.stringify(payload, null, 1)}\n`,
);
console.log('wrote', chunks.map((entry) => `${entry.name}:${entry.chunks.length}`).join(' '));
