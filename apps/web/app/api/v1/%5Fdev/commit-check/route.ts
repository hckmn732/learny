import conventional from '@commitlint/config-conventional';
import lint from '@commitlint/lint';
import { z } from 'zod';

import { commitlintPlugin, commitlintRules } from '@learny/config';

import { sddPagesEnabled } from '../../../../../lib/sdd-pages';

export const dynamic = 'force-dynamic';

const Body = z.object({ message: z.string().min(1).max(2000) });

const RULES = { ...conventional.rules, ...commitlintRules };

function invalidRequest(): Response {
  return Response.json(
    { type: 'about:blank', title: 'Requête invalide', status: 400, code: 'VALIDATION_FAILED' },
    { status: 400, headers: { 'content-type': 'application/problem+json' } },
  );
}

export async function POST(request: Request): Promise<Response> {
  if (!sddPagesEnabled()) return new Response(null, { status: 404 });

  // The message is never logged (ET-7).
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidRequest();

  const report = await lint(parsed.data.message, RULES, {
    plugins: { learny: commitlintPlugin },
    defaultIgnores: true,
  });
  const pick = ({ name, message }: { name: string; message: string }) => ({ name, message });
  return Response.json({
    valid: report.valid,
    errors: report.errors.map(pick),
    warnings: report.warnings.map(pick),
  });
}
