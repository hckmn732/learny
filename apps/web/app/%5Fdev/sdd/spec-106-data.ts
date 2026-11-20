import 'server-only';

import type { Spec106Data } from '@learny/contracts';

import { serverApi } from '../../../lib/api/server-client';

export type { Spec106Data } from '@learny/contracts';
export async function loadSpec106Demo(): Promise<Spec106Data> {
  return (await serverApi()).api.devSddSpec106Demo({}) as Promise<Spec106Data>;
}
