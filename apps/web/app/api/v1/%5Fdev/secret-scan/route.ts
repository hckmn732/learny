import { z } from 'zod';

import { scanText } from '@learny/config';

import { sddPagesEnabled } from '../../../../../lib/sdd-pages';

export const dynamic = 'force-dynamic';

const Body = z.object({ text: z.string().max(20000) });

function invalidRequest(): Response {
  return Response.json(
    { type: 'about:blank', title: 'Requête invalide', status: 400, code: 'VALIDATION_FAILED' },
    { status: 400, headers: { 'content-type': 'application/problem+json' } },
  );
}

export async function POST(request: Request): Promise<Response> {
  if (!sddPagesEnabled()) return new Response(null, { status: 404 });

  // The scanned text may hold a secret: it is never logged (ET-7).
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidRequest();

  return Response.json({ findings: scanText(parsed.data.text, 'saisie') });
}
