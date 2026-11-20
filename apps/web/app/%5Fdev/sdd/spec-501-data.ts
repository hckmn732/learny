import 'server-only';

import { serverApi } from '../../../lib/api/server-client';

import type { Spec501DemoData } from './spec-501-types';

export async function loadSpec501Demo(): Promise<Spec501DemoData> {
  return (await serverApi()).api.devSddSpec501Demo({}) as Promise<Spec501DemoData>;
}
