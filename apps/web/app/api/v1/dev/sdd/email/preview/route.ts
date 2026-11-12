import { devEmailPreview } from '@learny/contracts';
import { previewEmail } from '@learny/services';

import { devOnly } from '../../../../../../../lib/api/dev-guard';
import { handler } from '../../../../../../../lib/api/handler';
import { htmlResponse, wantsJson } from '../../../../../../../lib/email/unsubscribe-page';

export const dynamic = 'force-dynamic';

// Demonstration route of SPEC-204: a template rendered with the sample data. JSON (subject, html,
// text, headers) for the page; the raw HTML document when opened directly in a browser.
export const GET = devOnly(
  handler(devEmailPreview, async ({ ctx, query, request }) => {
    const preview = await previewEmail(ctx, query);
    return wantsJson(request) ? preview : htmlResponse(preview.html, 200);
  }),
);
