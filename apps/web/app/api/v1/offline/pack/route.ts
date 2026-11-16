import { offlinePack } from '@learny/contracts';
import { buildPack } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-801 ET-5 — the daily offline pack of the active formations (session + extra recall cards).
export const GET = handler(offlinePack, ({ ctx }) => buildPack(ctx));
