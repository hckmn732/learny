import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { noopOriginGuard, noopRateLimiter, setOriginGuard, setRateLimiter } from '@learny/http';
import { setSessionResolver } from '@learny/http/session';

import { createApp } from '../../src/app';
import { startServer } from '../../src/server';

const secondGate = vi.hoisted(() => {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
});

const streamReply = vi.hoisted(() =>
  vi.fn(
    () =>
      new ReadableStream<string>({
        start(controller) {
          controller.enqueue('data: premier\n\n');
          void secondGate.promise.then(() => {
            controller.enqueue('data: second\n\n');
            controller.close();
          });
        },
      }),
  ),
);

vi.mock('@learny/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@learny/services')>()),
  enforceLegalAcceptance: vi.fn(() => Promise.resolve()),
  streamReply,
}));

let restoreSession: () => void = () => undefined;

beforeEach(() => {
  streamReply.mockClear();
  setOriginGuard(noopOriginGuard);
  setRateLimiter(noopRateLimiter);
  restoreSession = setSessionResolver(() =>
    Promise.resolve({
      userId: '00000000-0000-4000-8000-000000000001',
      email: 'user@example.test',
      emailConfirmed: true,
    }),
  );
});

afterEach(() => {
  restoreSession();
  vi.restoreAllMocks();
});

describe('[SPEC-1101] tutor stream', () => {
  it('transmet le SSE par fragments avant la fin (CA-3)', async () => {
    const server = await startServer(createApp(), 0, '127.0.0.1');
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('adresse API absente');
    const startedAt = performance.now();
    try {
      const response = await fetch(
        `http://127.0.0.1:${String(address.port)}/api/v1/conversations/00000000-0000-4000-8000-000000000001/messages`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: 'Bonjour', context: { include: {} } }),
        },
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
      expect(response.headers.get('x-vercel-ai-ui-message-stream')).toBe('v1');
      const reader = response.body?.getReader();
      expect(reader).toBeDefined();
      const received: { at: number; text: string }[] = [];
      const firstChunk = await reader?.read();
      if (firstChunk?.done === true || firstChunk?.value === undefined) {
        throw new Error('premier fragment SSE absent');
      }
      received.push({
        at: performance.now() - startedAt,
        text: new TextDecoder().decode(firstChunk.value),
      });
      secondGate.release();
      const secondChunk = await reader?.read();
      if (secondChunk?.done === true || secondChunk?.value === undefined) {
        throw new Error('second fragment SSE absent');
      }
      received.push({
        at: performance.now() - startedAt,
        text: new TextDecoder().decode(secondChunk.value),
      });
      expect(received).toHaveLength(2);
      const first = received[0];
      const second = received[1];
      if (first === undefined || second === undefined) throw new Error('fragments SSE absents');
      expect(first.text).toContain('premier');
      expect(second.text).toContain('second');
      expect(second.at).toBeGreaterThanOrEqual(first.at);
      expect(streamReply).toHaveBeenCalledOnce();
    } finally {
      server.closeIdleConnections();
      server.closeAllConnections();
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    }
  });
});
