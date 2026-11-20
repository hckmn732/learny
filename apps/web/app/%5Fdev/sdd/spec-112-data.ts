import 'server-only';

import type { Spec112Data } from '@learny/contracts';

import { serverApi } from '../../../lib/api/server-client';

export type { Spec112Data } from '@learny/contracts';
export async function loadSpec112Demo(): Promise<Spec112Data> {
  return (await serverApi()).api.devSddSpec112Demo({}) as Promise<Spec112Data>;
}
