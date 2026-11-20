import 'server-only';

import type { Spec510Data } from '@learny/contracts';

import { serverApi } from '../../../lib/api/server-client';

export type { Spec510Chunk, Spec510Data, Spec510Snapshot } from '@learny/contracts';
export async function loadSpec510Demo(): Promise<Spec510Data> {
  return (await serverApi()).api.devSddSpec510Demo({}) as Promise<Spec510Data>;
}
