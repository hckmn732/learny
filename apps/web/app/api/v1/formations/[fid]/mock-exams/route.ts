import { getExamIntro } from '@learny/contracts';
import { getExamIntro as getExamIntroService } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-614 EF-1, EF-5 — proposed format, studied/diagnostic modules and the two planned exams.
export const GET = handler(getExamIntro, ({ ctx, params }) => getExamIntroService(ctx, params.fid));
