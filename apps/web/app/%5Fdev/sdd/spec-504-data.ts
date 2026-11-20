import 'server-only';

import type { AiTask } from '@learny/config';
import type { ResolutionRow } from '@learny/contracts';

import { serverApi } from '../../../lib/api/server-client';

export type { MockCallState, ResolutionRow } from '@learny/contracts';

export async function loadResolutionDemo(): Promise<ResolutionRow[]> {
  return (await loadSpec504Demo()).resolution;
}

export async function loadSpec504Demo(): Promise<{
  resolution: ResolutionRow[];
  previews: Record<AiTask, unknown>;
}> {
  return (await (await serverApi()).api.devSddSpec504Demo({})) as {
    resolution: ResolutionRow[];
    previews: Record<AiTask, unknown>;
  };
}
