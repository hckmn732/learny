import 'server-only';

import type { Spec104Data } from '@learny/contracts';

import { serverApi } from '../../../lib/api/server-client';

export type { Spec104Data } from '@learny/contracts';
export async function loadSpec104Demo(): Promise<Spec104Data> {
  return (await serverApi()).api.devSddSpec104Demo({}) as Promise<Spec104Data>;
}
