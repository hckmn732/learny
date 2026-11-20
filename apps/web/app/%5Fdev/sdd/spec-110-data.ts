import 'server-only';

import type { Spec110Data } from '@learny/contracts';

import { serverApi } from '../../../lib/api/server-client';

export type { Spec110Data } from '@learny/contracts';
export async function loadSpec110Demo(): Promise<Spec110Data> {
  return (await serverApi()).api.devSddSpec110Demo({}) as Promise<Spec110Data>;
}
