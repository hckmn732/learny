// Module with a complete question bank (SPEC-611 §8.7). Creates a formation, one open module, its
// notions and `variantsPerFormat` bank bricks for each code-corrected format and the open format.
// The payloads are valid against the SPEC-501 schemas; every stem carries the notion and variant
// so the fingerprints are distinct and the draw never reports an accidental duplicate.
import { randomUUID } from 'node:crypto';

import { sql, type DbTx } from '@learny/db';
import { createTestProgramme } from '@learny/db/testing';

import { createBrick } from './brick';

export interface ModuleWithBankOptions {
  userId: string;
  /** Number of notions of the module (11 in the SPEC-611 acceptance fixture). */
  notions?: number;
  /** Variants per notion and format (4 by default, BR-MEM-07). */
  variantsPerFormat?: number;
  /** Existing formation and module, created by the caller when provided. */
  formationId?: string;
  moduleId?: string;
  title?: string;
  threshold?: number;
}

export interface ModuleWithBank {
  formationId: string;
  moduleId: string;
  chapterId: string;
  notionIds: string[];
  brickIds: string[];
}

interface NotionRow extends Record<string, unknown> {
  id: string;
  label: string;
}

function choicePayload(notionLabel: string, distractor: string, variant: number): unknown {
  return {
    stem: `${notionLabel} : quelle affirmation est exacte ? (variante ${String(variant)})`,
    mode: 'single',
    options: [
      { id: 'a', text: `La règle de ${notionLabel}`, correct: true, notionId: null },
      {
        id: 'b',
        text: `Une confusion avec ${distractor}`,
        correct: false,
        notionId: null,
        rationale: 'Confusion fréquente à éviter.',
      },
      {
        id: 'c',
        text: 'Une affirmation sans rapport',
        correct: false,
        notionId: null,
        rationale: 'Aucun lien avec la notion.',
      },
    ],
    explanation: `La règle de ${notionLabel} s’applique à toute la notion, pas à un seul poste.`,
    objective: `Vérifier la compréhension de ${notionLabel}`,
    sources: [],
  };
}

function clozePayload(notionLabel: string, variant: number): unknown {
  return {
    template: `${notionLabel} (variante ${String(variant)}) se comprend avec le mot {{1}} et s’applique au mot {{2}}.`,
    gaps: [
      { id: 1, answers: ['universel'], hint: 'journal unique' },
      { id: 2, answers: ['ACDOCA'], hint: 'table unique' },
    ],
    explanation: `Le journal universel réunit les écritures dans ${notionLabel}.`,
    sources: [],
  };
}

function matchingPayload(notionLabel: string, notionId: string, variant: number): unknown {
  return {
    instruction: `Associez chaque élément de ${notionLabel} à sa signification. (variante ${String(variant)})`,
    pairs: [
      { id: 'p1', left: 'Clé 40', right: 'Débit sur un compte général', notionId },
      { id: 'p2', left: 'Clé 50', right: 'Crédit sur un compte général', notionId },
    ],
    extraRights: [],
    explanation: 'La clé 40 débite, la clé 50 crédite.',
    sources: [],
  };
}

function openPayload(notionLabel: string, variant: number): unknown {
  return {
    stem: `Expliquez ${notionLabel} avec vos mots. (variante ${String(variant)})`,
    expectedElements: ['La règle essentielle', 'Un exemple concret'],
    criteria: [
      {
        key: 'comprehension',
        label: 'Compréhension',
        points: 1,
        description: 'La règle est exacte.',
      },
    ],
    answerMaxChars: 1500,
    modelAnswer: `${notionLabel} se définit par sa règle et s’illustre par un exemple de pièce comptable.`,
    explanation: `La réponse attendue reprend la règle de ${notionLabel}.`,
    objective: `Vérifier la compréhension de ${notionLabel}`,
    sources: [],
  };
}

export async function makeModuleWithBank(
  tx: DbTx,
  options: ModuleWithBankOptions,
): Promise<ModuleWithBank> {
  const notionCount = Math.max(1, Math.trunc(options.notions ?? 11));
  const variants = Math.max(1, Math.trunc(options.variantsPerFormat ?? 4));
  let formationId = options.formationId;
  let moduleId = options.moduleId;
  let chapterId = '';

  if (formationId === undefined || moduleId === undefined) {
    const programme = await createTestProgramme(tx, options.userId, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: notionCount,
      title: options.title ?? 'SAP S/4HANA Finance',
    });
    formationId = programme.formationId;
    moduleId = programme.moduleIds[0] ?? '';
    chapterId = programme.chapterIds[0] ?? '';
    await tx.execute(sql`
      update public.modules
      set title = 'Comptabilité générale',
          status = 'open',
          threshold = ${options.threshold ?? 80}
      where id = ${moduleId}::uuid
    `);
    await tx.execute(sql`
      insert into public.module_progress (user_id, module_id, status)
      values (${options.userId}::uuid, ${moduleId}::uuid, 'open')
      on conflict (user_id, module_id) do update set status = 'open'
    `);
    await tx.execute(sql`
      update public.profiles
      set onboarding_step = 'done', current_formation_id = ${formationId}::uuid
      where id = ${options.userId}::uuid
    `);
  }

  const notions = await tx.execute<NotionRow>(sql`
    select id::text as id, label
    from public.notions
    where module_id = ${moduleId}::uuid
    order by position asc, id asc
  `);
  if (chapterId === '') {
    const chapters = await tx.execute<{ id: string }>(sql`
      select id::text as id from public.chapters where module_id = ${moduleId}::uuid
      order by position asc limit 1
    `);
    chapterId = chapters[0]?.id ?? '';
  }

  const brickIds: string[] = [];
  for (const [index, notion] of notions.entries()) {
    const distractor = notions[(index + 1) % notions.length]?.label ?? notion.label;
    for (let variant = 1; variant <= variants; variant += 1) {
      const formats: Array<{ type: 'choice_question' | 'cloze' | 'matching' | 'open_question'; payload: unknown }> = [
        { type: 'choice_question', payload: choicePayload(notion.label, distractor, variant) },
        { type: 'cloze', payload: clozePayload(notion.label, variant) },
        { type: 'matching', payload: matchingPayload(notion.label, notion.id, variant) },
        { type: 'open_question', payload: openPayload(notion.label, variant) },
      ];
      for (const format of formats) {
        const created = await createBrick(tx, {
          ownerId: options.userId,
          formationId,
          type: format.type,
          purpose: 'bank',
          notionIds: [notion.id],
          payload: format.payload,
        });
        brickIds.push(created.id);
      }
    }
  }

  if (notions.length === 0) {
    const created = await createBrick(tx, {
      ownerId: options.userId,
      formationId,
      type: 'open_question',
      purpose: 'bank',
      notionIds: [],
      payload: openPayload(randomUUID(), 1),
    });
    brickIds.push(created.id);
  }

  return {
    formationId,
    moduleId,
    chapterId,
    notionIds: notions.map((notion) => notion.id),
    brickIds,
  };
}
