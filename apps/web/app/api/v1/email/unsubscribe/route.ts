import { emailUnsubscribeGet, emailUnsubscribePost } from '@learny/contracts';
import { readUnsubscribeToken, unsubscribeByToken } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';
import {
  htmlResponse,
  unsubscribeDonePage,
  unsubscribeFormPage,
  unsubscribeInvalidPage,
  wantsJson,
} from '../../../../../lib/email/unsubscribe-page';

export const dynamic = 'force-dynamic';

// One-click unsubscribe (SPEC-204 EF-5, RFC 8058). GET shows the form and changes nothing (CL-6);
// POST (mail client with `List-Unsubscribe=One-Click`, or the form) sets channel_email = false.
export const GET = handler(emailUnsubscribeGet, ({ query }) => {
  if (readUnsubscribeToken(query.token) === null) {
    return Promise.resolve(htmlResponse(unsubscribeInvalidPage(), 400));
  }
  return Promise.resolve(
    htmlResponse(unsubscribeFormPage(query.token, emailUnsubscribePost.path), 200),
  );
});

export const POST = handler(emailUnsubscribePost, async ({ ctx, query, request }) => {
  const result = await unsubscribeByToken(ctx, query.token);
  if (wantsJson(request)) return result;
  if (!result.ok) return htmlResponse(unsubscribeInvalidPage(), 400);
  return htmlResponse(unsubscribeDonePage(), 200);
});
