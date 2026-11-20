import 'server-only';

import type { Spec111Data } from '@learny/contracts';

import { serverApi } from '../../../lib/api/server-client';

export type { Spec111Data } from '@learny/contracts';
export async function loadSpec111Demo(): Promise<Spec111Data> {
  return (await serverApi()).api.devSddSpec111Demo({}) as Promise<Spec111Data>;
}
