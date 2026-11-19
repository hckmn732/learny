import { emailUnsubscribeGet, emailUnsubscribePost } from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import { readUnsubscribeToken, unsubscribeByToken } from '@learny/services';

import {
  htmlResponse,
  requestCspNonce,
  unsubscribeDonePage,
  unsubscribeFormPage,
  unsubscribeInvalidPage,
  wantsJson,
} from '../special/unsubscribe-page';

// SPEC-1004 ET-1 - implementations of the `email` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const emailImplementations = {
  emailUnsubscribeGet: ({ query, request }: HandlerArgs<typeof emailUnsubscribeGet>) => {
    const nonce = requestCspNonce(request);
    if (readUnsubscribeToken(query.token) === null) {
      return Promise.resolve(htmlResponse(unsubscribeInvalidPage(nonce), 400));
    }
    return Promise.resolve(
      htmlResponse(unsubscribeFormPage(query.token, emailUnsubscribePost.path, nonce), 200),
    );
  },
  emailUnsubscribePost: async ({
    ctx,
    query,
    request,
  }: HandlerArgs<typeof emailUnsubscribePost>) => {
    const result = await unsubscribeByToken(ctx, query.token);
    if (wantsJson(request)) return result;
    const nonce = requestCspNonce(request);
    if (!result.ok) return htmlResponse(unsubscribeInvalidPage(nonce), 400);
    return htmlResponse(unsubscribeDonePage(nonce), 200);
  },
};
