import 'server-only';

import type { Spec115Data } from '@learny/contracts';

import { serverApi } from '../../../lib/api/server-client';

export type { Spec115Data } from '@learny/contracts';
export async function loadSpec115Demo(): Promise<Spec115Data> {
  return (await serverApi()).api.devSddSpec115Demo({}) as Promise<Spec115Data>;
}
