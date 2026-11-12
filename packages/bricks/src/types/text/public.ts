// Public payload of a `text` brick: everything is safe to send to the browser.
import type { SourceRef } from '../../common';

import type { TextPayload } from './schema';

export type TextPublic = Omit<TextPayload, 'sources'> & { sources: SourceRef[] };

export function textPublic(payload: TextPayload): TextPublic {
  return { ...payload, sources: payload.sources.map((source) => ({ ...source })) };
}
