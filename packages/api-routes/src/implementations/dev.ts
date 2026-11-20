import { devSddApiCoverage, devSddAuthProxy } from '@learny/contracts';
import { AppError } from '@learny/core';
import { devRoutesEnabled } from '@learny/http/dev-guard';
import type { HandlerArgs } from '@learny/http/route-handler';

import { routeCoverage } from '../coverage';

export const devImplementations = {
  devSddApiCoverage: (_args: HandlerArgs<typeof devSddApiCoverage>) => {
    if (!devRoutesEnabled()) {
      throw new AppError('NOT_FOUND', 'Ressource introuvable.');
    }
    return Promise.resolve(routeCoverage());
  },
  devSddAuthProxy: (_args: HandlerArgs<typeof devSddAuthProxy>) => {
    if (!devRoutesEnabled()) {
      throw new AppError('NOT_FOUND', 'Ressource introuvable.');
    }
    return Promise.resolve({ ok: true } as const);
  },
} as const;
