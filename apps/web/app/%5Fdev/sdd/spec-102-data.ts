import 'server-only';

import type { Spec102Data } from '@learny/contracts';

import { serverApi } from '../../../lib/api/server-client';

export type { Spec102Data } from '@learny/contracts';

export async function loadSpec102Demo(): Promise<Spec102Data | null> {
  return (await serverApi()).api.devSddSpec102Demo({}) as Promise<Spec102Data | null>;
}
