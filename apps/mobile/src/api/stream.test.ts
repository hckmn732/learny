// Vitest [SPEC-3003] — SSE of the tutor and of the demonstration relay (EF-8, CA-3, CL-3).
import { describe, expect, it, vi } from 'vitest';

import type { TutorReplyPart } from '@learny/api-client';

import { openTutorStream, readSseData, streamDemoFragments } from './stream';

const encoder = new TextEncoder();

function streamOf(chunks: readonly string[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[index] ?? ''));
      index += 1;
    },
  });
}

describe('[SPEC-3003] flux SSE (EF-8, CA-3)', () => {
  it('transmet les parties du tuteur une par une (EF-8)', async () => {
    const parts: TutorReplyPart[] = [
      { type: 'text-delta', id: 't1', delta: 'Bonjour' },
      { type: 'data-sources', data: { sources: [] } },
      { type: 'data-follow-ups', data: { followUps: [] } },
      { type: 'data-self-test', data: { status: 'pending' } },
    ];
    const source = {
      streamTutorReply: vi.fn(() => {
        const lines = parts;
        return (async function* generate() {
          await Promise.resolve();
          for (const part of lines) yield part;
        })();
      }),
    };

    const received: TutorReplyPart[] = [];
    for await (const part of openTutorStream(source, 'conv-1', {} as never)) received.push(part);

    expect(source.streamTutorReply).toHaveBeenCalledWith('conv-1', {}, {});
    expect(received).toHaveLength(4);
    expect(received[0]).toEqual({ type: 'text-delta', id: 't1', delta: 'Bonjour' });
  });

  it('transmet le signal d’annulation au client (CL-3)', async () => {
    const parts: TutorReplyPart[] = [{ type: 'text-delta', id: 't1', delta: 'partiel' }];
    const source = {
      streamTutorReply: vi.fn(() =>
        (async function* one() {
          await Promise.resolve();
          yield* parts;
        })(),
      ),
    };
    const controller = new AbortController();

    const received: TutorReplyPart[] = [];
    for await (const part of openTutorStream(source, 'conv-2', {} as never, {
      signal: controller.signal,
    })) {
      received.push(part);
    }

    expect(received).toHaveLength(1);
    expect(source.streamTutorReply).toHaveBeenCalledWith('conv-2', {}, {
      signal: controller.signal,
    });
  });

  it('lit les événements d’un corps text/event-stream, y compris coupés entre deux lectures', async () => {
    const body = streamOf(['data: fragment-1\n', '\ndata: fragment-2\n\ndata: ', 'fragment-3\n\n']);

    const received: string[] = [];
    for await (const data of readSseData(body)) received.push(data);

    expect(received).toEqual(['fragment-1', 'fragment-2', 'fragment-3']);
  });

  it('ignore les commentaires, les lignes vides et le marqueur [DONE]', async () => {
    const body = streamOf([': keep-alive\n\n', 'data: a\n\n', 'data: [DONE]\n\n', 'data: b\n\n']);

    const received: string[] = [];
    for await (const data of readSseData(body)) received.push(data);

    expect(received).toEqual(['a', 'b']);
  });

  it('reconstruit les trois fragments du relais de démonstration (CA-3)', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        new Response(streamOf(['data: fragment-1\n\n', 'data: fragment-2\n\n', 'data: fragment-3\n\n']), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
      ),
    ) as unknown as typeof fetch;

    const fragments: string[] = [];
    for await (const fragment of streamDemoFragments(
      fetchImpl,
      'https://api.test/api/v1/dev/sdd/relay-stream',
    )) {
      fragments.push(fragment);
    }

    expect(fragments).toEqual(['fragment-1', 'fragment-2', 'fragment-3']);
    expect(fragments.join('')).toBe('fragment-1fragment-2fragment-3');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.test/api/v1/dev/sdd/relay-stream',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('échoue proprement quand le flux est refusé (CL-3)', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response('nope', { status: 503 })),
    ) as unknown as typeof fetch;

    await expect(async () => {
      for await (const fragment of streamDemoFragments(fetchImpl, 'https://api.test/x')) {
        expect(fragment).toBeDefined();
      }
    }).rejects.toThrow(/indisponible \(HTTP 503\)/);
  });
});
