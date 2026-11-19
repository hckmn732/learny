import {
  conversationGet,
  conversationMessage,
  conversationSelfTestAnswer,
  courseConversationCreate,
  courseConversationList,
} from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import {
  answerSelfTest,
  conversationById,
  createConversation,
  listConversations,
  streamReply,
} from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `tutor-chat` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const tutorChatImplementations = {
  conversationMessage: async ({ ctx, params, body }: HandlerArgs<typeof conversationMessage>) => {
    const stream = await streamReply(ctx, params.id, body);
    return new Response(stream.pipeThrough(new TextEncoderStream()), {
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        'x-vercel-ai-ui-message-stream': 'v1',
      },
    });
  },
  conversationGet: async ({ ctx, params }: HandlerArgs<typeof conversationGet>) =>
    conversationById(ctx, params.id),
  conversationSelfTestAnswer: ({
    ctx,
    params,
    body,
  }: HandlerArgs<typeof conversationSelfTestAnswer>) => answerSelfTest(ctx, params.id, body.text),
  courseConversationList: ({ ctx, params }: HandlerArgs<typeof courseConversationList>) =>
    listConversations(ctx, params.cid),
  courseConversationCreate: ({ ctx, params, body }: HandlerArgs<typeof courseConversationCreate>) =>
    createConversation(ctx, params.cid, body.chapterId),
};
