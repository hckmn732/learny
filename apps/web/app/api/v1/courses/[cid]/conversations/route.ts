import { courseConversationCreate, courseConversationList } from '@learny/contracts';
import { createConversation, listConversations } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-610 ET-2 — open and list the private discussions of one course version.
export const GET = handler(courseConversationList, ({ ctx, params }) =>
  listConversations(ctx, params.cid),
);

export const POST = handler(courseConversationCreate, ({ ctx, params, body }) =>
  createConversation(ctx, params.cid, body.chapterId),
);
