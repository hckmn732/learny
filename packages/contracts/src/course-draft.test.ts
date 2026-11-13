import { describe, expect, it } from 'vitest';

import {
  CourseChapterDraftSchema,
  CourseDraftSchema,
  type CourseChapterDraft,
} from './course-draft';

const CHAPTER = '6f1d0f2a-0000-4000-8000-000000000001';
const CHUNK = '6f1d0f2a-0000-4000-8000-000000000002';
const NOTION = '6f1d0f2a-0000-4000-8000-000000000003';
const OTHER = '6f1d0f2a-0000-4000-8000-000000000004';

const markdown = {
  kind: 'markdown' as const,
  title: 'L’en-tête de pièce',
  contentMd: 'Une pièce réunit un en-tête et des postes.',
  sourceChunkIds: [CHUNK],
  notionIds: [NOTION],
};

function takeaway(points: string[], extra: Record<string, unknown> = {}) {
  return {
    kind: 'takeaway' as const,
    points,
    notionIds: [],
    sourceChunkIds: [],
    ...extra,
  };
}

function chapter(overrides: Partial<CourseChapterDraft> = {}) {
  return {
    chapterId: CHAPTER,
    title: 'Saisie des pièces comptables',
    baseCourse: false,
    sections: [markdown, takeaway(['Un', 'Deux', 'Trois'])],
    sourceChunkIds: [CHUNK],
    notionIds: [NOTION],
    links: [],
    resourceSuggestions: [],
    ...overrides,
  };
}

function baseChapter(overrides: Record<string, unknown> = {}) {
  return {
    chapterId: CHAPTER,
    title: 'Cours de base',
    baseCourse: true,
    sections: [
      {
        kind: 'tutor_addition',
        title: 'Bases',
        contentMd: 'Le tuteur présente la notion faute d’apport.',
        notionIds: [],
      },
      takeaway(['Un', 'Deux', 'Trois']),
    ],
    sourceChunkIds: [],
    notionIds: [],
    links: [],
    resourceSuggestions: [
      {
        title: 'Guide officiel',
        url: 'https://example.test/guide',
        reason: 'Une référence courte pour démarrer.',
      },
    ],
    ...overrides,
  };
}

describe('[SPEC-608] contrats du cours', () => {
  it('exige de 3 à 7 points dans la fiche À retenir (BR-COU-04)', () => {
    expect(
      CourseChapterDraftSchema.safeParse(
        chapter({ sections: [markdown, takeaway(['Un', 'Deux'])] }),
      ).success,
    ).toBe(false);
    expect(
      CourseChapterDraftSchema.safeParse(
        chapter({ sections: [markdown, takeaway(['Un', 'Deux', 'Trois'])] }),
      ).success,
    ).toBe(true);
    expect(
      CourseChapterDraftSchema.safeParse(
        chapter({ sections: [markdown, takeaway(Array<string>(7).fill('Point'))] }),
      ).success,
    ).toBe(true);
    expect(
      CourseChapterDraftSchema.safeParse(
        chapter({ sections: [markdown, takeaway(Array<string>(8).fill('Point'))] }),
      ).success,
    ).toBe(false);
  });

  it('valide la question éclair et le bloc « Ne pas confondre » (BR-COU-05, BR-COU-06)', () => {
    const side = { title: 'Type de pièce', body: 'Classe toute la pièce.', example: 'SA' };
    const question = {
      kind: 'quick_question' as const,
      question: 'Où le sens débit ou crédit est-il indiqué ?',
      answer: 'Dans chaque poste, grâce à la clé de comptabilisation.',
      sourceChunkIds: [],
      notionIds: [],
    };
    const comparison = {
      kind: 'comparison' as const,
      left: side,
      right: { ...side, title: 'Clé de comptabilisation', example: '40, 50' },
      sourceChunkIds: [],
      notionIds: [],
    };
    expect(
      CourseChapterDraftSchema.safeParse(
        chapter({ sections: [markdown, question, comparison, takeaway(['Un', 'Deux', 'Trois'])] }),
      ).success,
    ).toBe(true);
    expect(
      CourseChapterDraftSchema.safeParse(
        chapter({
          sections: [markdown, { ...question, answer: '' }, takeaway(['Un', 'Deux', 'Trois'])],
        }),
      ).success,
    ).toBe(false);
    expect(
      CourseChapterDraftSchema.safeParse(
        chapter({
          sections: [markdown, question, question, takeaway(['Un', 'Deux', 'Trois'])],
        }),
      ).success,
    ).toBe(false);
  });

  it('borne le schéma blocs/flèches et le moyen mnémotechnique (BR-COU-04)', () => {
    const valid = takeaway(['Un', 'Deux', 'Trois'], {
      diagram: {
        blocks: [
          { id: 'piece', label: 'Pièce comptable' },
          { id: 'entete', label: 'En-tête' },
        ],
        arrows: [{ from: 'piece', to: 'entete', label: 'contient' }],
      },
      mnemonic: '4 avant 5, comme le débit avant le crédit.',
    });
    expect(
      CourseChapterDraftSchema.safeParse(chapter({ sections: [markdown, valid] })).success,
    ).toBe(true);
    expect(
      CourseChapterDraftSchema.safeParse(
        chapter({
          sections: [
            markdown,
            takeaway(['Un', 'Deux', 'Trois'], {
              diagram: {
                blocks: [{ id: 'piece', label: 'Pièce comptable' }],
                arrows: [{ from: 'piece', to: 'inconnu' }],
              },
            }),
          ],
        }),
      ).success,
    ).toBe(false);
    expect(
      CourseChapterDraftSchema.safeParse(
        chapter({
          sections: [markdown, takeaway(['Un', 'Deux', 'Trois'], { mnemonic: 'a'.repeat(301) })],
        }),
      ).success,
    ).toBe(false);
  });

  it('exige une source pour un passage tiré des apports et signale le complément tuteur (BR-COU-02)', () => {
    expect(
      CourseChapterDraftSchema.safeParse(
        chapter({
          sections: [{ ...markdown, sourceChunkIds: [] }, takeaway(['Un', 'Deux', 'Trois'])],
          sourceChunkIds: [],
        }),
      ).success,
    ).toBe(false);

    const tutor = {
      kind: 'tutor_addition' as const,
      contentMd: 'Une pièce n’est enregistrée que si elle est équilibrée.',
      notionIds: [],
    };
    expect(
      CourseChapterDraftSchema.safeParse(
        chapter({
          sections: [markdown, tutor, takeaway(['Un', 'Deux', 'Trois'])],
        }),
      ).success,
    ).toBe(true);
    expect(
      CourseChapterDraftSchema.safeParse(
        chapter({
          sections: [
            markdown,
            { ...tutor, sourceChunkIds: [CHUNK] },
            takeaway(['Un', 'Deux', 'Trois']),
          ],
        }),
      ).success,
    ).toBe(false);
  });

  it('marque un cours de base sans citation et avec des suggestions (BR-COU-03)', () => {
    expect(CourseChapterDraftSchema.safeParse(baseChapter()).success).toBe(true);
    expect(
      CourseChapterDraftSchema.safeParse(baseChapter({ resourceSuggestions: [] })).success,
    ).toBe(false);
    expect(
      CourseChapterDraftSchema.safeParse(
        baseChapter({
          sourceChunkIds: [CHUNK],
          sections: [markdown, takeaway(['Un', 'Deux', 'Trois'])],
        }),
      ).success,
    ).toBe(false);
    expect(
      CourseChapterDraftSchema.safeParse(
        chapter({
          resourceSuggestions: [
            { title: 'Guide', url: 'https://example.test', reason: 'Pour démarrer.' },
          ],
        }),
      ).success,
    ).toBe(false);
  });

  it('ferme le chapitre par une seule fiche À retenir, suivie au plus du résumé (BR-COU-04)', () => {
    const summary = { kind: 'summary_prompt' as const, title: 'Résumez ce chapitre' };
    expect(
      CourseChapterDraftSchema.safeParse(
        chapter({
          sections: [markdown, takeaway(['Un', 'Deux', 'Trois']), summary],
        }),
      ).success,
    ).toBe(true);
    expect(
      CourseChapterDraftSchema.safeParse(
        chapter({
          sections: [markdown, takeaway(['Un', 'Deux', 'Trois']), { ...markdown }],
        }),
      ).success,
    ).toBe(false);
    expect(
      CourseChapterDraftSchema.safeParse(
        chapter({
          sections: [
            markdown,
            takeaway(['Un', 'Deux', 'Trois']),
            takeaway(['Quatre', 'Cinq', 'Six']),
          ],
        }),
      ).success,
    ).toBe(false);
  });

  it('reprend exactement les sources et notions de ses sections (ET-3)', () => {
    expect(
      CourseChapterDraftSchema.safeParse(chapter({ sourceChunkIds: [CHUNK, OTHER] })).success,
    ).toBe(false);
    expect(
      CourseChapterDraftSchema.safeParse(chapter({ notionIds: [NOTION, OTHER] })).success,
    ).toBe(false);
    const draft = CourseDraftSchema.safeParse({ chapters: [chapter()] });
    expect(draft.success).toBe(true);
    expect(CourseDraftSchema.safeParse({ chapters: [] }).success).toBe(false);
  });
});
