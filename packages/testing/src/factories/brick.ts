// Brick factory (SPEC-115 EF-6). Creates a personal brick and its immutable version 1.
import { createHash, randomUUID } from 'node:crypto';

import { sql, type DbTx } from '@learny/db';

import { assertFormationAccess, assertNotionsBelongTo, insert, type IdRow } from './helpers';

export interface BrickFactoryOverrides {
  id?: string;
  ownerId: string;
  formationId: string;
  type?:
    | 'text'
    | 'resource_excerpt'
    | 'choice_question'
    | 'open_question'
    | 'cloze'
    | 'matching'
    | 'ordering'
    | 'categorization'
    | 'recall_card'
    | 'instruction'
    | 'scripted_dialogue'
    | 'timer'
    | 'scoring';
  purpose?:
    'course' | 'validation' | 'bank' | 'remediation' | 'exercise' | 'exam' | 'warmup' | 'review';
  notionIds?: readonly string[];
  payload?: unknown;
}

export interface FactoryBrick {
  id: string;
  versionId: string;
}

export async function createBrick(
  tx: DbTx,
  overrides: BrickFactoryOverrides,
): Promise<FactoryBrick> {
  await assertFormationAccess(tx, overrides.formationId, overrides.ownerId);
  const notionIds = overrides.notionIds ?? [];
  await assertNotionsBelongTo(tx, notionIds, overrides.formationId);

  const id = overrides.id ?? randomUUID();
  const notionValues = `{${notionIds.join(',')}}`;
  const rows = await insert<IdRow>(
    tx,
    'brick',
    sql`
      insert into public.bricks (
        id, owner_id, formation_id, type, notion_ids, purpose, status, current_version
      )
      values (
        ${id}::uuid,
        ${overrides.ownerId}::uuid,
        ${overrides.formationId}::uuid,
        ${overrides.type ?? 'choice_question'},
        ${notionValues}::uuid[],
        ${overrides.purpose ?? 'bank'},
        'active',
        1
      )
      returning id::text as id
    `,
  );
  const brick = rows[0];
  if (brick === undefined) throw new Error('Fabrique brique : aucune ligne insérée.');

  const payload = overrides.payload ?? {
    question: 'Question de fabrique ?',
    choices: ['Oui', 'Non'],
    answer: 'Oui',
  };
  const versionRows = await insert<IdRow>(
    tx,
    'brick version',
    sql`
      insert into public.brick_versions (
        id, brick_id, version, payload, fingerprint, origin, created_by
      )
      values (
        ${randomUUID()}::uuid,
        ${brick.id}::uuid,
        1,
        ${JSON.stringify(payload)}::jsonb,
        ${createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex')},
        'tutor',
        'tutor'
      )
      returning id::text as id
    `,
  );
  const version = versionRows[0];
  if (version === undefined) throw new Error('Fabrique brique : version non créée.');
  return { id: brick.id, versionId: version.id };
}
