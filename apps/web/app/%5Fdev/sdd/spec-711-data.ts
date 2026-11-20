import 'server-only';

import type { Spec711Data } from '@learny/contracts';

import { serverApi } from '../../../lib/api/server-client';

export type { Spec711Data, Spec711JournalRow, Spec711KeyRow, Spec711Step } from '@learny/contracts';
export async function loadSpec711Demo(): Promise<Spec711Data> {
  return (await serverApi()).api.devSddSpec711Demo({}) as Promise<Spec711Data>;
}
