import 'server-only';

import type { Spec105Data } from '@learny/contracts';

import { serverApi } from '../../../lib/api/server-client';

export type { Spec105Data } from '@learny/contracts';
export async function loadSpec105Demo(): Promise<Spec105Data> {
  return (await serverApi()).api.devSddSpec105Demo({}) as Promise<Spec105Data>;
}
