import 'server-only';

import type { Spec108Data } from '@learny/contracts';

import { serverApi } from '../../../lib/api/server-client';

export type { Spec108Data } from '@learny/contracts';
export async function loadSpec108Demo(): Promise<Spec108Data> {
  return (await serverApi()).api.devSddSpec108Demo({}) as Promise<Spec108Data>;
}
