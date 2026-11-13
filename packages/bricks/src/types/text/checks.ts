// Internal rules of the `text` brick: only a `<` followed by a letter is refused as raw HTML
// (CL-10 keeps injected instructions as ordinary data).
import { brickIssue, type BrickIssue } from '../../issues';

import type { TextPayload } from './schema';

const RAW_HTML_TAG = /<[a-z]/iu;

export function textChecks(payload: TextPayload): BrickIssue[] {
  const match = RAW_HTML_TAG.exec(payload.bodyMd);
  if (match === null) return [];
  return [
    brickIssue(
      'HTML_NOT_ALLOWED',
      'payload.bodyMd',
      `Raw HTML is not allowed in bodyMd (found "${match[0]}").`,
    ),
  ];
}
