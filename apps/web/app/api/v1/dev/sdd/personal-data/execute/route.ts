import { devPersonalDataExecute } from '@learny/contracts';
import { runExecutionDemo } from '@learny/services';

import { devOnly } from '../../../../../../../lib/api/dev-guard';
import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// SPEC-211 EF-9: advances a throwaway account to J+30, runs the real account deletion and returns
// the remaining-row table (all zero) and the Auth status.
export const POST = devOnly(handler(devPersonalDataExecute, ({ ctx }) => runExecutionDemo(ctx)));
