import { describe, expect, it } from 'vitest';

import type { CourseDraft } from '@learny/contracts';

import { validateCourseCitations, type KnownChunk } from './validate-citations';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '22222222-2222-4222-8222-222222222222';
const CHAPTER = '33333333-3333-4333-8333-333333333333';
const OTHER_CHAPTER = '44444444-4444-4444-8444-444444444444';
const CHUNK = '55555555-5555-4555-8555-555555555555';
const NOTION = '66666666-6666-4666-8666-666666666666';

function chunk(overrides: Partial<KnownChunk> = {}): KnownChunk {
  return {
    chunkId: CHUNK,
    ownerId: USER,
    chapterId: CHAPTER,
    resourceId: '77777777-7777-4777-8777-777777777777',
    resourceTitle: 'Guide utilisateur FI',
    resourceKind: 'pdf',
    resourceStatus: 'ready',
    resourceDeleted: false,
    resourceMime: 'application/pdf',
    text: 'Une pièce réunit un en-tête et des postes.',
    location: { page: 4, charStart: 0, charEnd: 42 },
    ...overrides,
  };
}

function draftWithSource(kind: 'markdown' | 'tutor_addition' = 'markdown'): CourseDraft {
  return {
    chapters: [
      {
        chapterId: CHAPTER,
        title: 'Saisie des pièces comptables',
        baseCourse: kind === 'tutor_addition',
        sections:
          kind === 'markdown'
            ? [
                {
                  kind: 'markdown',
                  title: 'Introduction',
                  contentMd: 'Une pièce réunit un en-tête et des postes.',
                  sourceChunkIds: [CHUNK],
                  notionIds: [NOTION],
                },
                {
                  kind: 'takeaway',
                  points: ['Un', 'Deux', 'Trois'],
                  sourceChunkIds: [],
                  notionIds: [],
                },
              ]
            : [
                {
                  kind: 'tutor_addition',
                  title: 'Bases',
                  contentMd: 'Le tuteur présente la notion.',
                  notionIds: [],
                },
                {
                  kind: 'takeaway',
                  points: ['Un', 'Deux', 'Trois'],
                  sourceChunkIds: [],
                  notionIds: [],
                },
              ],
        sourceChunkIds: kind === 'markdown' ? [CHUNK] : [],
        notionIds: kind === 'markdown' ? [NOTION] : [],
        links: [],
        resourceSuggestions:
          kind === 'tutor_addition'
            ? [
                {
                  title: 'Guide officiel',
                  url: 'https://example.com/guide',
                  reason: 'Pour démarrer.',
                },
              ]
            : [],
      },
    ],
  };
}

function verify(known: KnownChunk, allowed: readonly string[] = [CHUNK]) {
  return validateCourseCitations(draftWithSource(), {
    userId: USER,
    chunks: new Map([[known.chunkId, known]]),
    allowedChunkIds: new Set(allowed),
  });
}

describe('[SPEC-608] citations du cours', () => {
  it('résout un passage prêt du propriétaire et de son chapitre (EF-2)', () => {
    const result = verify(chunk());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]?.chunk.chunkId).toBe(CHUNK);
    expect(result.citations[0]?.chunk.location).toMatchObject({ page: 4 });
  });

  it('refuse un passage absent (CL-4)', () => {
    const result = verify(chunk({ chunkId: '88888888-8888-4888-8888-888888888888' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.code).toBe('missing');
  });

  it('refuse un passage supprimé (BR-COU-10, CL-4)', () => {
    const result = verify(chunk({ resourceDeleted: true }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.code).toBe('deleted');
  });

  it('refuse le passage d’un autre utilisateur (ET-1)', () => {
    const result = verify(chunk({ ownerId: OTHER_USER }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.code).toBe('foreign');
  });

  it('refuse un passage d’un autre chapitre (EF-2)', () => {
    const result = verify(chunk({ chapterId: OTHER_CHAPTER }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.code).toBe('other_chapter');
  });

  it('refuse un passage hors du contexte envoyé au tuteur', () => {
    const result = verify(chunk(), []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.code).toBe('outside_context');
  });

  it('accepte un complément tuteur sans citation et le signale comme non sourcé (BR-COU-02)', () => {
    const result = validateCourseCitations(draftWithSource('tutor_addition'), {
      userId: USER,
      chunks: new Map(),
      allowedChunkIds: new Set(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.citations).toHaveLength(0);
  });
});
