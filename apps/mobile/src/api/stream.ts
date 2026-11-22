// Streaming of the tutor reply (SPEC-3003 EF-8, CL-3).
//
// `sse.ts` of `@learny/api-client` reads the AI SDK UI message stream; this module adds the two
// things the application needs: a client-agnostic entry point (testable in Node) and the generic
// SSE reader used by the demonstration relay (`GET /dev/sdd/relay-stream`), whose events are plain
// `data: fragment-N` payloads and not tutor parts.
//
// Cancellation: the `AbortSignal` given by the screen is handed to `expo/fetch`; aborting it cuts
// the connection, the reader then raises `StreamInterruptedError` and the partial text stays on
// screen (CL-3, SPEC-3303).
import type { TutorReplyPart } from '@learny/api-client';
import type { SendMessageInput } from '@learny/contracts';

import { requireApiClient } from './registry';

/** Minimal surface of the client used here: the SSE of the tutor (EF-8). */
export interface TutorStreamSource {
  streamTutorReply: (
    conversationId: string,
    body: SendMessageInput,
    options?: { signal?: AbortSignal; fetch?: typeof fetch },
  ) => AsyncGenerator<TutorReplyPart>;
}

export interface StreamOptions {
  readonly signal?: AbortSignal;
}

/**
 * Yields the parts of the tutor reply (`text-delta`, `data-sources`, `data-follow-ups`,
 * `data-self-test`) for one message (EF-8).
 */
export function openTutorStream(
  source: TutorStreamSource,
  conversationId: string,
  body: SendMessageInput,
  options: StreamOptions = {},
): AsyncGenerator<TutorReplyPart> {
  return source.streamTutorReply(
    conversationId,
    body,
    options.signal === undefined ? {} : { signal: options.signal },
  );
}

/** Same stream, bound to the client of the application (the entry point of the screens). */
export function streamTutorReply(
  conversationId: string,
  body: SendMessageInput,
  options: StreamOptions = {},
): AsyncGenerator<TutorReplyPart> {
  return openTutorStream(requireApiClient(), conversationId, body, options);
}

/** Payloads of a `text/event-stream` body, one string per event (blank line separated). */
export async function* readSseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const read = await reader.read();
      if (read.done) break;
      buffer += decoder.decode(read.value, { stream: true }).replace(/\r\n/g, '\n');
      for (;;) {
        const end = buffer.indexOf('\n\n');
        if (end === -1) break;
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = block
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).replace(/^ /, ''))
          .join('\n');
        if (data !== '' && data !== '[DONE]') yield data;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Fragments of the demonstration relay (`GET /api/v1/dev/sdd/relay-stream`, three `data:`
 * events), read through the same `expo/fetch` transport as the tutor (EF-9).
 */
export async function* streamDemoFragments(
  fetchImpl: typeof fetch,
  url: string,
  options: StreamOptions = {},
): AsyncGenerator<string> {
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: { Accept: 'text/event-stream' },
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  if (!response.ok) {
    throw new Error(`Flux de démonstration indisponible (HTTP ${String(response.status)}).`);
  }
  if (response.body === null) {
    throw new Error('Flux de démonstration sans corps lisible.');
  }
  yield* readSseData(response.body);
}
