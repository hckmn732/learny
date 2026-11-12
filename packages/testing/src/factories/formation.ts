// Formation factory (SPEC-115 EF-6, ET-5). Creates an active formation owned by the given user.
import { sql, type DbTx } from '@learny/db';

import { insert, type IdRow } from './helpers';

export interface FormationFactoryOverrides {
  id?: string;
  ownerId: string;
  title?: string;
  description?: string;
  status?: 'cadrage' | 'programme_proposed' | 'active' | 'paused' | 'completed' | 'archived';
  objectives?: readonly ('operational' | 'exam' | 'dialogue' | 'project')[];
  volumeHours?: number | null;
  startDate?: string | null;
  endDate?: string | null;
}

export async function createFormation(
  tx: DbTx,
  overrides: FormationFactoryOverrides,
): Promise<{ id: string }> {
  const objectives = overrides.objectives ?? ['operational'];
  const values = `{${objectives.join(',')}}`;
  const rows = await insert<IdRow>(
    tx,
    'formation',
    sql`
      insert into public.formations (
        id, owner_id, title, description, objectives, status, cadrage_profile,
        volume_hours, start_date, end_date
      )
      values (
        ${overrides.id ?? sql`gen_random_uuid()`}::uuid,
        ${overrides.ownerId}::uuid,
        ${overrides.title ?? 'Formation de fabrique'},
        ${overrides.description ?? null},
        ${values}::public.formation_objective[],
        ${overrides.status ?? 'active'},
        '{}'::jsonb,
        ${overrides.volumeHours ?? null},
        ${overrides.startDate ?? null},
        ${overrides.endDate ?? null}
      )
      returning id::text as id
    `,
  );
  const row = rows[0];
  if (row === undefined) throw new Error('Fabrique formation : aucune ligne insérée.');
  return row;
}
