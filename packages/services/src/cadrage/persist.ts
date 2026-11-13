import type { AppliedTutorTurn, CadrageObjective } from '@learny/tutor';
import type { Clock } from '@learny/core';
import { sql, type DbTx } from '@learny/db';

import type { FormationRow } from './state';
import { nextPosition, suggestionsJson } from './state';

// Persistence of one applied tutor turn (SPEC-604 ET-2). The profile is written only through
// `applyTutorTurn`; this module maps the pure result to `formations.cadrage_profile` and one
// `cadrage_messages` row. The tutor call itself never runs inside a transaction.

function objectivesSql(objectives: readonly CadrageObjective[]) {
  return sql`ARRAY[${sql.join(
    objectives.map((objective) => sql`${objective}`),
    sql`, `,
  )}]::public.formation_objective[]`;
}

export interface PersistedTurn {
  content: string;
  questionKey: string | null;
  suggestions: string | null;
  messageId: string;
}

export async function persistTutorTurn(
  tx: DbTx,
  formation: FormationRow,
  userId: string,
  applied: AppliedTutorTurn,
  clock: Clock,
): Promise<PersistedTurn> {
  const mergedObjectives = [
    ...new Set<CadrageObjective>([
      ...(formation.objectives as CadrageObjective[]),
      ...applied.objectives,
    ]),
  ];
  const objectiveUpdate =
    mergedObjectives.length === 0
      ? sql`objectives`
      : sql`${objectivesSql(mergedObjectives)}`;

  await tx.execute(sql`
    update public.formations
    set cadrage_profile = ${JSON.stringify(applied.profile)}::jsonb,
        objectives = ${objectiveUpdate},
        updated_at = ${clock.now()}::timestamptz
    where id = ${formation.id}::uuid
  `);

  const position = await nextPosition(tx, formation.id);
  const questionKey = applied.questionKey;
  const suggestions =
    applied.suggestions === null
      ? null
      : suggestionsJson(applied.suggestions, applied.multi);
  const rows = await tx.execute<{ id: string }>(sql`
    insert into public.cadrage_messages (
      formation_id, user_id, role, content, question_key, suggestions, position, created_at
    )
    values (
      ${formation.id}::uuid,
      ${userId}::uuid,
      'tutor',
      ${applied.content},
      ${questionKey}::public.cadrage_key,
      ${suggestions}::jsonb,
      ${position},
      ${clock.now()}::timestamptz
    )
    returning id::text as id
  `);
  return {
    content: applied.content,
    questionKey,
    suggestions,
    messageId: rows[0]?.id ?? '',
  };
}
