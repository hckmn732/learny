// Adapter of the typed client for the tutor sheet (SPEC-3303 ET-1).
//
// `ConversationController` depends on `TutorClient`, a surface of seven calls; this module binds it
// to `@learny/api-client` of the running application. Pure: the client is injected, so the unit
// tests of the controller never touch the network.
import type { ApiClient } from '@learny/api-client';
import type { AutomationActionItem } from '@learny/contracts';

import type { TutorClient } from './conversation-controller';

/** Journal filter of the card proposals of one conversation (BR-AUT-06, SPEC-717). */
export const CARD_KIND = 'card_created';

export function apiTutorClient(client: ApiClient): TutorClient {
  return {
    listConversations: (courseId) =>
      client.api.courseConversationList({ params: { cid: courseId } }),
    getConversation: (id) => client.api.conversationGet({ params: { id } }),
    createConversation: (courseId, chapterId, idempotencyKey) =>
      client.api.courseConversationCreate(
        { params: { cid: courseId }, body: { chapterId } },
        { idempotencyKey },
      ),
    streamReply: (conversationId, body, options) =>
      client.streamTutorReply(conversationId, body, options),
    answerSelfTest: (conversationId, text) =>
      client.api.conversationSelfTestAnswer({ params: { id: conversationId }, body: { text } }),
    listCardProposals: async (conversationId): Promise<readonly AutomationActionItem[]> => {
      const page = await client.api.meAutomationActionsList({
        query: { kind: CARD_KIND, status: 'pending_consent', limit: 100 },
      });
      return page.items.filter((item) => {
        const payload = item.payload as { conversationId?: unknown };
        return (
          item.kind === CARD_KIND &&
          item.status === 'pending_consent' &&
          payload.conversationId === conversationId
        );
      });
    },
    acceptCard: (id, idempotencyKey) =>
      client.api.meAutomationActionAccept({ params: { id }, body: {} }, { idempotencyKey }),
  };
}
