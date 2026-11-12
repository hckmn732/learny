import { devPersonalDataExport } from '@learny/contracts';
import { runExportDemo } from '@learny/services';

import { devOnly } from '../../../../../../../lib/api/dev-guard';
import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// SPEC-211 EF-9: full export of the demonstration dataset, with its ZIP tree and size.
export const POST = devOnly(handler(devPersonalDataExport, ({ ctx }) => runExportDemo(ctx)));
