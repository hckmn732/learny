import 'server-only';

import { serverApi } from '../../../lib/api/server-client';

import type { Spec505DemoData } from './spec-505-types';

export async function loadSpec505Demo(): Promise<Spec505DemoData> {
  return (await serverApi()).api.devSddSpec505Demo({}) as Promise<Spec505DemoData>;
}
