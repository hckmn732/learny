import fs from 'node:fs';
import path from 'node:path';

import { readReferences } from '../../../../../lib/references';
import { sddPagesEnabled } from '../../../../../lib/sdd-pages';
import { findRepoRoot } from '../../../../../lib/sdd-status';

export const dynamic = 'force-dynamic';

const PNG_NAME = /^SCR-\d{2}-[a-z0-9-]+-(?:desktop|mobile)\.png$/;

/**
 * Serves a mockup reference for the SPEC-005 demo. Only files listed in the manifest are
 * served, so the page never loads anything that the reference inventory does not know.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
): Promise<Response> {
  if (!sddPagesEnabled()) return new Response('Not found', { status: 404 });
  const { file } = await params;
  if (!PNG_NAME.test(file)) return new Response('Not found', { status: 404 });

  const references = readReferences();
  const root = findRepoRoot();
  if (!references.ok || root === null) return new Response('Not found', { status: 404 });
  const listed = references.stateList.some(
    (state) => state.desktop.file.endsWith(`/${file}`) || state.mobile.file.endsWith(`/${file}`),
  );
  if (!listed) return new Response('Not found', { status: 404 });

  const body = fs.readFileSync(path.join(root, 'design', 'references', file));
  return new Response(new Uint8Array(body), {
    headers: { 'content-type': 'image/png', 'cache-control': 'no-store' },
  });
}
