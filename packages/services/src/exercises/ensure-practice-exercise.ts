// Idempotent creation of the practice exercise of one notion (SPEC-613 ET-4; BR-PRA-01, BR-LAC-04).
//
// `ensurePracticeExercise` is reused by SPEC-716: it reads the notion and the current course
// version, then creates one `instruction` brick and one ready `exercise` activity per
// `(notion, course version)`. The tutor generation is a committed deterministic fixture: in
// `LLM_MODE=mock` no provider is called and the same notion always produces the same payload.
import { sql } from 'drizzle-orm';
import { z } from 'zod';

import { ExerciseInstructionSchema, type ExerciseInstruction } from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import type { DbTx } from '@learny/db';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

export interface EnsuredPracticeExercise {
  exerciseId: string;
  formationId: string;
  moduleId: string;
  notionId: string;
  courseVersion: number;
  created: boolean;
}

interface NotionRow {
  [key: string]: unknown;
  id: string;
  label: string;
  short_definition: string | null;
  module_id: string;
  formation_id: string;
  module_position: number;
}

interface ExistingRow {
  [key: string]: unknown;
  id: string;
}

const criteriaTotal = (criteria: readonly { points: number }[]): number =>
  criteria.reduce((sum, criterion) => sum + criterion.points, 0);

function tableInstruction(): ExerciseInstruction {
  return ExerciseInstructionSchema.parse({
    title: 'Saisir une pièce équilibrée',
    taskMd:
      'Le 12 novembre 2026, la société **FR01** achète des fournitures de bureau pour **120 €**, payées immédiatement par virement bancaire. Saisissez la pièce comptable correspondante (montants hors taxes, sans TVA pour simplifier).',
    data: ['Société FR01', 'Date de pièce : 12/11/2026', 'Devise : EUR'],
    deliverable:
      'Un tableau équilibré avec le type de pièce, la clé et le compte de chaque poste, et une explication de la partie double.',
    production: {
      kind: 'table',
      fields: [
        {
          key: 'type',
          label: 'Type de pièce',
          type: 'select',
          options: [
            { value: 'SA', label: 'SA · écriture générale' },
            { value: 'KR', label: 'KR · facture fournisseur' },
            { value: 'DR', label: 'DR · facture client' },
          ],
        },
        { key: 'date', label: 'Date comptable', type: 'text' },
      ],
      columns: [
        {
          key: 'cle',
          label: 'Clé de comptabilisation',
          type: 'select',
          options: [
            { value: '40', label: '40 · débit, compte général' },
            { value: '50', label: '50 · crédit, compte général' },
            { value: '31', label: '31 · crédit, fournisseur' },
            { value: '01', label: '01 · débit, client' },
          ],
        },
        {
          key: 'compte',
          label: 'Compte',
          type: 'select',
          options: [
            { value: '606400', label: '606400 · Fournitures administratives' },
            { value: '512000', label: '512000 · Banque' },
            { value: '401000', label: '401000 · Fournisseurs' },
            { value: '411000', label: '411000 · Clients' },
          ],
        },
        { key: 'montant', label: 'Montant (€)', type: 'number' },
      ],
      minRows: 2,
      maxRows: 4,
      initialRows: 2,
      checks: [
        {
          type: 'sum_equal',
          numberColumn: 'montant',
          groupColumn: 'cle',
          left: ['40', '01'],
          right: ['50', '31'],
          leftLabel: 'Débit',
          rightLabel: 'Crédit',
          sideColumnLabel: 'Sens',
        },
      ],
    },
    explanationPrompt:
      'Pourquoi SAP refuse-t-il d’enregistrer une pièce déséquilibrée ? Une ou deux phrases.',
    hints: [
      'Il n’y a ni fournisseur ni client à suivre : le paiement est immédiat. Quel type de pièce pour une écriture de comptabilité générale ?',
      'La charge augmente : elle va au débit. La banque diminue : elle va au crédit. Sur un compte général, 40 débite et 50 crédite.',
    ],
    criteria: [
      {
        key: 'piece-type',
        label: 'Type de pièce',
        points: 2,
        description: 'Le type attendu est SA, une écriture de comptabilité générale.',
      },
      {
        key: 'charge',
        label: 'Poste de charge',
        points: 2,
        description: 'Le compte 606400 Fournitures administratives est débité de 120 €.',
      },
      {
        key: 'banque',
        label: 'Poste de banque',
        points: 2,
        description: 'Le compte 512000 Banque est crédité de 120 €.',
      },
      {
        key: 'equilibre',
        label: 'Pièce équilibrée',
        points: 2,
        description: 'Le total du débit égale le total du crédit.',
      },
      {
        key: 'explication',
        label: 'Explication',
        points: 2,
        description:
          'L’explication relie la production à la règle de la partie double et à l’équilibre de la pièce.',
      },
    ],
    estimatedMinutes: 15,
    passPoints: 8,
    sources: [],
  });
}

function genericInstruction(label: string, shortDefinition: string | null): ExerciseInstruction {
  const definition = shortDefinition ?? 'la définition du cours';
  return ExerciseInstructionSchema.parse({
    title: `Mettre en pratique : ${label}`.slice(0, 120),
    taskMd: `Appliquez **${label}** à partir de ${definition}. Décrivez la démarche, l’étape décisive et le résultat attendu.`,
    data: [`Notion : ${label}`],
    deliverable: 'Une réponse structurée en une dizaine de lignes.',
    production: { kind: 'text', minChars: 80, maxChars: 2000 },
    explanationPrompt: 'Expliquez avec vos mots pourquoi votre démarche répond à la consigne.',
    hints: [
      `Reformulez la consigne avec « ${label} » : que doit-on produire exactement ?`,
      'Appuyez-vous sur la définition du cours puis vérifiez chaque étape de votre réponse.',
    ],
    criteria: [
      {
        key: 'application',
        label: 'Application',
        points: 3,
        description: `La production applique ${label} au cas proposé.`,
      },
      {
        key: 'exactitude',
        label: 'Exactitude',
        points: 3,
        description: 'Les étapes et le résultat sont exacts.',
      },
      {
        key: 'explication',
        label: 'Explication',
        points: 2,
        description: 'La démarche est expliquée avec les mots de l’apprenant.',
      },
      {
        key: 'completude',
        label: 'Complétude',
        points: 2,
        description: 'La réponse couvre toutes les parties de la consigne.',
      },
    ],
    estimatedMinutes: 10,
    passPoints: 8,
    sources: [],
  });
}

function instructionFor(label: string, shortDefinition: string | null): ExerciseInstruction {
  if (/équilibre.*pièce|equilibre.*piece/iu.test(label)) return tableInstruction();
  return genericInstruction(label, shortDefinition);
}

async function readNotion(tx: DbTx, notionId: string): Promise<NotionRow> {
  const rows = await tx.execute<NotionRow>(sql`
    select
      n.id::text as id,
      n.label,
      n.short_definition,
      n.module_id::text as module_id,
      n.formation_id::text as formation_id,
      m.position as module_position
    from public.notions n
    join public.modules m on m.id = n.module_id
    where n.id = ${notionId}::uuid
  `);
  const notion = rows[0];
  if (notion === undefined) throw new AppError('NOT_FOUND', 'Notion introuvable.');
  return notion;
}

async function currentCourseVersion(tx: DbTx, userId: string, moduleId: string): Promise<number> {
  const rows = await tx.execute<{ version: number }>(sql`
    select coalesce(max(version), 0)::int as version
    from public.courses
    where owner_id = ${userId}::uuid
      and module_id = ${moduleId}::uuid
      and status = 'ready'
  `);
  return rows[0]?.version ?? 0;
}

async function existingExercise(
  tx: DbTx,
  userId: string,
  notionId: string,
  courseVersion: number,
): Promise<string | null> {
  const rows = await tx.execute<ExistingRow>(sql`
    select id::text as id
    from public.activities
    where owner_id = ${userId}::uuid
      and kind = 'exercise'
      and status in ('draft', 'ready')
      and config->>'notionId' = ${notionId}
      and coalesce((config->>'courseVersion')::int, 0) = ${courseVersion}
    order by created_at asc
    limit 1
  `);
  return rows[0]?.id ?? null;
}

/**
 * ET-4 — creates or returns the exercise of the notion for the current course version. Two
 * concurrent calls serialise on an advisory lock and observe the first committed row.
 */
export async function ensurePracticeExercise(
  ctx: ServiceContext,
  notionId: string,
): Promise<Result<EnsuredPracticeExercise>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    if (!z.uuid().safeParse(notionId).success) {
      throw new AppError('VALIDATION_FAILED', 'Identifiant de notion invalide.');
    }

    return db.run(async (tx) => {
      const notion = await readNotion(tx, notionId);
      const courseVersion = await currentCourseVersion(tx, userId, notion.module_id);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`practice:${notionId}:${String(courseVersion)}`}, 0))`,
      );
      const existing = await existingExercise(tx, userId, notionId, courseVersion);
      if (existing !== null) {
        return {
          exerciseId: existing,
          formationId: notion.formation_id,
          moduleId: notion.module_id,
          notionId,
          courseVersion,
          created: false,
        };
      }

      const instruction = instructionFor(notion.label, notion.short_definition);
      const now = ctx.clock.now().toISOString();
      const brickRows = await tx.execute<{ id: string }>(sql`
        insert into public.bricks (
          owner_id, formation_id, type, notion_ids, purpose, status, current_version, created_at
        ) values (
          ${userId}::uuid,
          ${notion.formation_id}::uuid,
          'instruction',
          ${`{${notionId}}`}::uuid[],
          'exercise',
          'active',
          1,
          ${now}::timestamptz
        )
        returning id::text as id
      `);
      const brick = brickRows[0];
      if (brick === undefined) throw new AppError('INTERNAL_ERROR', 'Brique non créée.');

      const versionRows = await tx.execute<{ id: string }>(sql`
        insert into public.brick_versions (
          brick_id, version, payload, fingerprint, origin, created_by, created_at
        ) values (
          ${brick.id}::uuid,
          1,
          ${JSON.stringify(instruction)}::jsonb,
          null,
          'tutor',
          'tutor',
          ${now}::timestamptz
        )
        returning id::text as id
      `);
      const version = versionRows[0];
      if (version === undefined) throw new AppError('INTERNAL_ERROR', 'Version non créée.');

      const activityRows = await tx.execute<{ id: string }>(sql`
        insert into public.activities (
          owner_id, formation_id, module_id, kind, config, items, status, created_at
        ) values (
          ${userId}::uuid,
          ${notion.formation_id}::uuid,
          ${notion.module_id}::uuid,
          'exercise',
          ${JSON.stringify({
            notionId,
            courseVersion,
            hintsMax: 2,
            threshold: instruction.passPoints,
            scoring: { total: criteriaTotal(instruction.criteria) },
          })}::jsonb,
          ${JSON.stringify([{ brickId: brick.id, brickVersionId: version.id }])}::jsonb,
          'ready',
          ${now}::timestamptz
        )
        returning id::text as id
      `);
      const activity = activityRows[0];
      if (activity === undefined) throw new AppError('INTERNAL_ERROR', 'Activité non créée.');

      return {
        exerciseId: activity.id,
        formationId: notion.formation_id,
        moduleId: notion.module_id,
        notionId,
        courseVersion,
        created: true,
      };
    });
  });
}
