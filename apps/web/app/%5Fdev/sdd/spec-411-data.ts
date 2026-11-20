import 'server-only';

import type { Spec411Data } from '@learny/contracts';

import { serverApi } from '../../../lib/api/server-client';

export type { Spec411Data, Spec411State } from '@learny/contracts';
export async function loadSpec411Demo(): Promise<Spec411Data> {
  return (await serverApi()).api.devSddSpec411Demo({}) as Promise<Spec411Data>;
}
