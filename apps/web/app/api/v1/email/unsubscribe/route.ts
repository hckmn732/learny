import { emailUnsubscribeGet, emailUnsubscribePost } from '@learny/contracts';
import { readUnsubscribeToken, unsubscribeByToken } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';
import {
  htmlResponse,
  requestCspNonce,
  unsubscribeDonePage,
  unsubscribeFormPage,
  unsubscribeInvalidPage,
  wantsJson,
} from '../../../../../lib/email/unsubscribe-page';

export const dynamic = 'force-dynamic';

// One-click unsubscribe (SPEC-204 EF-5, RFC 8058). GET shows the form and changes nothing (CL-6);
// POST (mail client with `List-Unsubscribe=One-Click`, or the form) sets channel_email = false.
// The HTML pages carry the response CSP nonce so their <style> is admitted by `style-src-elem`.
export const GET = handler(emailUnsubscribeGet, ({ query, request }) => {
  const nonce = requestCspNonce(request);
  if (readUnsubscribeToken(query.token) === null) {
    return Promise.resolve(htmlResponse(unsubscribeInvalidPage(nonce), 400));
  }
  return Promise.resolve(
    htmlResponse(unsubscribeFormPage(query.token, emailUnsubscribePost.path, nonce), 200),
  );
});

export const POST = handler(emailUnsubscribePost, async ({ ctx, query, request }) => {
  const result = await unsubscribeByToken(ctx, query.token);
  if (wantsJson(request)) return result;
  const nonce = requestCspNonce(request);
  if (!result.ok) return htmlResponse(unsubscribeInvalidPage(nonce), 400);
  return htmlResponse(unsubscribeDonePage(nonce), 200);
});
