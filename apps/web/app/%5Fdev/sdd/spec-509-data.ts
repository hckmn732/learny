import 'server-only';

import type { Spec509Data } from '@learny/contracts';

import { serverApi } from '../../../lib/api/server-client';

export type { Spec509Chunk, Spec509Data, Spec509Snapshot } from '@learny/contracts';
export async function loadSpec509Demo(): Promise<Spec509Data> {
  return (await serverApi()).api.devSddSpec509Demo({}) as Promise<Spec509Data>;
}
