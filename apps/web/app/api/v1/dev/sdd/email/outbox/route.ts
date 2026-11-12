import { devEmailOutbox } from '@learny/contracts';
import { listDemoOutbox } from '@learny/services';

import { devOnly } from '../../../../../../../lib/api/dev-guard';
import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// Demonstration route of SPEC-204: messages of the memory transport (empty with another transport).
export const GET = devOnly(handler(devEmailOutbox, () => Promise.resolve(listDemoOutbox())));
