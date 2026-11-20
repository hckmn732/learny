import 'server-only';

import type { Spec109Data } from '@learny/contracts';

import { serverApi } from '../../../lib/api/server-client';

export type { Spec109Data, Spec109Delivery } from '@learny/contracts';
export async function loadSpec109Demo(): Promise<Spec109Data> {
  return (await serverApi()).api.devSddSpec109Demo({}) as Promise<Spec109Data>;
}
