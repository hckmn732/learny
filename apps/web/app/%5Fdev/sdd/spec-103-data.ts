import 'server-only';

import type { Spec103Data } from '@learny/contracts';

import { serverApi } from '../../../lib/api/server-client';

export type { Spec103Data } from '@learny/contracts';
export async function loadSpec103Demo(): Promise<Spec103Data> {
  return (await serverApi()).api.devSddSpec103Demo({}) as Promise<Spec103Data>;
}
