import { groupRotateCode } from '@learny/contracts';
import { rotateGroupCode } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-724 ET-3, BR-GRP-05 — only the owner rotates the invitation code; the previous code stops
// working immediately and no member loses their personal data.
export const POST = handler(groupRotateCode, ({ ctx, params }) => rotateGroupCode(ctx, params.gid));
