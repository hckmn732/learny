import 'server-only';

import type { SearchWebDemo } from '@learny/contracts';

import { serverApi } from '../../../lib/api/server-client';

export type { RouteDemo, SearchWebDemo } from '@learny/contracts';
export async function loadSearchWebDemo(): Promise<SearchWebDemo> {
  return (await serverApi()).api.devSddSpec512Demo({}) as Promise<SearchWebDemo>;
}
