import { devOnly } from '@learny/http/dev-guard';

import type { SpecialHandler } from './types';

function streamResponse(): Promise<Response> {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let fragment = 0;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = () => {
        fragment += 1;
        controller.enqueue(encoder.encode(`data: fragment-${String(fragment)}\n\n`));
        if (fragment < 3) timer = setTimeout(send, 25);
        else controller.close();
      };
      send();
    },
    cancel() {
      if (timer !== undefined) clearTimeout(timer);
    },
  });
  return Promise.resolve(
    new Response(stream, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
      },
    }),
  );
}

const guarded = devOnly(() => streamResponse());

export const relayStreamSpecial: SpecialHandler = {
  method: 'GET',
  path: '/api/v1/dev/sdd/relay-stream',
  handle: (request, params) => guarded(request, { params: Promise.resolve(params) }),
};
