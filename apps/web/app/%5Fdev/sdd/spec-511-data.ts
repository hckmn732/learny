import 'server-only';

import type { Spec511Data } from '@learny/contracts';

import { serverApi } from '../../../lib/api/server-client';

export type { Spec511BudgetRow, Spec511Data, Spec511ResultRow } from '@learny/contracts';
export async function loadSpec511Demo(): Promise<Spec511Data> {
  return (await serverApi()).api.devSddSpec511Demo({}) as Promise<Spec511Data>;
}
