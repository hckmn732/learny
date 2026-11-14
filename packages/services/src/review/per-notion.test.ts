// Pure tests of the per-notion split (SPEC-702 ET-4, ET-5; CA-2, CL-5, CL-6).
import { describe, expect, it } from 'vitest';

import type { BrickPayload } from '@learny/bricks';

import { splitResultByNotion } from './per-notion';

const NOTION_A = '0b6f2a7e-9a3c-4c1c-8a55-3d1f6f1d2a01';
const NOTION_B = '0b6f2a7e-9a3c-4c1c-8a55-3d1f6f1d2a02';
const NOTION_C = '0b6f2a7e-9a3c-4c1c-8a55-3d1f6f1d2a03';

function matchingPayload(pairs: Array<{ id: string; notionId: string }>): BrickPayload<'matching'> {
  return {
    instruction: 'Touchez une notion, puis la définition qui lui correspond.',
    pairs: pairs.map((pair, index) => ({
      id: pair.id,
      left: `Terme ${String(index + 1)}`,
      right: `Définition ${String(index + 1)}`,
      notionId: pair.notionId,
    })),
    extraRights: [],
    explanation: 'Chaque terme a une seule définition.',
    sources: [],
  };
}

describe('[SPEC-702] splitResultByNotion', () => {
  it('association : une erreur A↔B donne une confusion sur la notion A', () => {
    const payload = matchingPayload([
      { id: 'p1', notionId: NOTION_A },
      { id: 'p2', notionId: NOTION_B },
    ]);
    const result = splitResultByNotion(
      'matching',
      payload,
      {
        kind: 'matching',
        pairs: [
          {
            leftId: 'p1',
            rightId: 'r2',
            ok: false,
            expectedRightId: 'r1',
            expectedLeftLabel: 'Terme 1',
          },
          {
            leftId: 'p2',
            rightId: 'r2',
            ok: true,
            expectedRightId: 'r2',
            expectedLeftLabel: 'Terme 2',
          },
        ],
      },
      {
        notionIds: [NOTION_A, NOTION_B],
        isCorrect: false,
        confusions: [{ notionId: NOTION_A, confusedWithNotionId: NOTION_B }],
      },
    );
    expect(result).toEqual([
      { notionId: NOTION_A, correct: false, confusedWithNotionId: NOTION_B },
      { notionId: NOTION_B, correct: true },
    ]);
  });

  it('association : une erreur entre deux paires d’une même notion n’est pas une confusion (CL-5)', () => {
    const payload = matchingPayload([
      { id: 'p1', notionId: NOTION_A },
      { id: 'p2', notionId: NOTION_A },
    ]);
    const result = splitResultByNotion(
      'matching',
      payload,
      {
        kind: 'matching',
        pairs: [
          {
            leftId: 'p1',
            rightId: 'r2',
            ok: false,
            expectedRightId: 'r1',
            expectedLeftLabel: 'Terme 1',
          },
          {
            leftId: 'p2',
            rightId: 'r2',
            ok: true,
            expectedRightId: 'r2',
            expectedLeftLabel: 'Terme 2',
          },
        ],
      },
      { notionIds: [NOTION_A], isCorrect: false, confusions: [] },
    );
    expect(result).toEqual([{ notionId: NOTION_A, correct: false }]);
  });

  it('classement : une catégorie portant une notion produit une confusion A↔B', () => {
    const payload: BrickPayload<'categorization'> = {
      instruction: 'Classez chaque élément : donnée de base ou opération ?',
      categories: [
        { id: 'c1', label: 'Donnée de base', notionId: NOTION_A },
        { id: 'c2', label: 'Opération', notionId: NOTION_B },
      ],
      items: [
        { id: 'i1', text: 'Compte général', categoryId: 'c1' },
        { id: 'i2', text: 'Fournisseur', categoryId: 'c1' },
        { id: 'i3', text: 'Facture d’achat', categoryId: 'c2' },
        { id: 'i4', text: 'Paiement', categoryId: 'c2' },
      ],
      explanation: 'Les données de base décrivent, les opérations mettent en mouvement.',
      sources: [],
    };
    const result = splitResultByNotion(
      'categorization',
      payload,
      {
        kind: 'categorization',
        rows: [
          {
            itemId: 'i1',
            categoryId: 'c1',
            ok: true,
            expectedCategoryId: 'c1',
            expectedCategoryLabel: 'Donnée de base',
          },
          {
            itemId: 'i2',
            categoryId: 'c2',
            ok: false,
            expectedCategoryId: 'c1',
            expectedCategoryLabel: 'Donnée de base',
          },
          {
            itemId: 'i3',
            categoryId: 'c2',
            ok: true,
            expectedCategoryId: 'c2',
            expectedCategoryLabel: 'Opération',
          },
          {
            itemId: 'i4',
            categoryId: 'c2',
            ok: true,
            expectedCategoryId: 'c2',
            expectedCategoryLabel: 'Opération',
          },
        ],
      },
      { notionIds: [NOTION_A, NOTION_B], isCorrect: false },
    );
    expect(result).toEqual([
      { notionId: NOTION_A, correct: false, confusedWithNotionId: NOTION_B },
      { notionId: NOTION_B, correct: true },
    ]);
  });

  it('classement : sans notion de catégorie, aucune confusion n’est enregistrée (CL-6)', () => {
    const payload: BrickPayload<'categorization'> = {
      instruction: 'Classez chaque élément : donnée de base ou opération ?',
      categories: [
        { id: 'c1', label: 'Donnée de base', notionId: null },
        { id: 'c2', label: 'Opération', notionId: null },
      ],
      items: [
        { id: 'i1', text: 'Compte général', categoryId: 'c1' },
        { id: 'i2', text: 'Fournisseur', categoryId: 'c1' },
        { id: 'i3', text: 'Facture d’achat', categoryId: 'c2' },
        { id: 'i4', text: 'Paiement', categoryId: 'c2' },
      ],
      explanation: 'Les données de base décrivent, les opérations mettent en mouvement.',
      sources: [],
    };
    const result = splitResultByNotion(
      'categorization',
      payload,
      {
        kind: 'categorization',
        rows: [
          {
            itemId: 'i1',
            categoryId: 'c2',
            ok: false,
            expectedCategoryId: 'c1',
            expectedCategoryLabel: 'Donnée de base',
          },
        ],
      },
      { notionIds: [NOTION_C], isCorrect: false, confusions: [] },
    );
    expect(result).toEqual([{ notionId: NOTION_C, correct: false }]);
  });

  it('remise en ordre et texte à trous : une seule décision pour la notion de l’item', () => {
    expect(
      splitResultByNotion(
        'ordering',
        {},
        { kind: 'ordering', rows: [] },
        {
          notionIds: [NOTION_A],
          isCorrect: false,
        },
      ),
    ).toEqual([{ notionId: NOTION_A, correct: false }]);
    expect(
      splitResultByNotion(
        'cloze',
        {},
        { kind: 'cloze', gaps: [] },
        {
          notionIds: [NOTION_B],
          isCorrect: true,
        },
      ),
    ).toEqual([{ notionId: NOTION_B, correct: true }]);
  });
});
