import 'server-only';

import type { Spec113Data } from '@learny/contracts';

import { serverApi } from '../../../lib/api/server-client';

export type { Spec113Data } from '@learny/contracts';
export async function loadSpec113Demo(): Promise<Spec113Data> {
  return (await serverApi()).api.devSddSpec113Demo({}) as Promise<Spec113Data>;
}
