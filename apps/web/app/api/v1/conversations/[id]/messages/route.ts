import { conversationMessage } from '@learny/contracts';
import { streamReply } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-610 ET-2, ADR-0066 — UI message stream: text parts, then data-sources, data-follow-ups and
// data-self-test. Errors before the first byte stay typed problem+json responses.
export const POST = handler(conversationMessage, async ({ ctx, params, body }) => {
  const stream = await streamReply(ctx, params.id, body);
  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      'x-vercel-ai-ui-message-stream': 'v1',
    },
  });
});
