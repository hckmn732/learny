import { devSddApiCoverage } from '@learny/contracts';
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
} as const;
