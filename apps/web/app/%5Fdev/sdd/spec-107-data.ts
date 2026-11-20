import 'server-only';

import type { Spec107Data } from '@learny/contracts';

import { serverApi } from '../../../lib/api/server-client';

export type { Spec107Data, Spec107History } from '@learny/contracts';
export async function loadSpec107Demo(): Promise<Spec107Data> {
  return (await serverApi()).api.devSddSpec107Demo({}) as Promise<Spec107Data>;
}
