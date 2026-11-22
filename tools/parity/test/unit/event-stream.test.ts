// [SPEC-2204] SSE answers are compared as the ordered list of their `data:` payloads (§11).
import { describe, expect, it } from 'vitest';

import { normalizeBody, parseEventStream } from '../../run';

const BODY = [
  'data: {"type":"start","messageId":"11111111-1111-4111-8111-111111111111"}',
  '',
  ': keep-alive',
  '',
  'data: {"type":"text-delta","id":"tutor","delta":"Bonjour"}',
  '',
  'data: [DONE]',
  '',
].join('\n');

describe('[SPEC-2204] parity SSE parsing', () => {
  it('keeps the ordered payloads and the DONE sentinel', () => {
    expect(parseEventStream(BODY)).toEqual([
      { type: 'start', messageId: '11111111-1111-4111-8111-111111111111' },
      { type: 'text-delta', id: 'tutor', delta: 'Bonjour' },
      '[DONE]',
    ]);
  });

  it('ignores comments, ids and blank payloads', () => {
    expect(parseEventStream('id: 1\nevent: message\ndata:  \n\n')).toEqual([]);
  });

  it('keeps a non-JSON payload verbatim', () => {
    expect(parseEventStream('data: pas du json\n\n')).toEqual(['pas du json']);
  });

  it('normalises the non-deterministic identifiers of a payload', () => {
    const parsed = parseEventStream(BODY) as Record<string, unknown>[];
    const normalised = normalizeBody(parsed) as Record<string, unknown>[];
    expect(normalised[0]?.messageId).toBe('<uuid>');
    expect(normalised[1]).toEqual({ type: 'text-delta', id: 'tutor', delta: 'Bonjour' });
  });
});
