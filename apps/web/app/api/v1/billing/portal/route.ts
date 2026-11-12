import { billingPortal } from '@learny/contracts';
import { openPortal } from '@learny/services/billing';

import { handler } from '../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// SPEC-210 EF-2: customer portal, back to /parametres#ia.
export const POST = handler(billingPortal, ({ ctx }) => openPortal(ctx));
