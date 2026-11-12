import { devEmailSend } from '@learny/contracts';
import { sendDemoEmail } from '@learny/services';

import { devOnly } from '../../../../../../../lib/api/dev-guard';
import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// Demonstration route of SPEC-204: sends a template to the signed-in learner through the
// configured transport (Mailpit in local, memory in test).
export const POST = devOnly(handler(devEmailSend, ({ ctx, body }) => sendDemoEmail(ctx, body)));
