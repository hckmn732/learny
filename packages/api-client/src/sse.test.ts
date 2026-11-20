import { describe, expect, it } from 'vitest';

import { readTutorReplyStream } from './sse';

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const parts: unknown[] = [];
  for await (const part of readTutorReplyStream(stream)) parts.push(part);
  return parts;
}

describe('[SPEC-1301] tutor stream reader', () => {
  it('restitue le texte, les sources puis les suites malgré des fragments découpés (CA-4)', async () => {
    const parts = await collect(
      streamOf([
        'data: {"type":"text-delta","id":"tutor","delta":"Bon',
        'jour"}\n\ndata: {"type":"data-sources","data":{"sources":[{"label":"Guide"}]}}\n\n',
        'data: {"type":"data-follow-ups","data":{"followUps":[{"key":"rephrase","label":"Autrement"}]}}\n\n',
        'data: [DONE]\n\n',
      ]),
    );

    expect(parts).toEqual([
      { type: 'text-delta', id: 'tutor', delta: 'Bonjour' },
      { type: 'data-sources', data: { sources: [{ label: 'Guide' }] } },
      {
        type: 'data-follow-ups',
        data: { followUps: [{ key: 'rephrase', label: 'Autrement' }] },
      },
    ]);
  });

  it('lève STREAM_INTERRUPTED après avoir livré les parties reçues (CL-3)', async () => {
    const encoder = new TextEncoder();
    const received: unknown[] = [];
    let sent = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sent) {
          sent = true;
          controller.enqueue(
            encoder.encode('data: {"type":"text-delta","id":"tutor","delta":"Début"}\n\n'),
          );
          return;
        }
        controller.error(new Error('connexion perdue'));
      },
    });

    const reading = (async () => {
      for await (const part of readTutorReplyStream(body)) received.push(part);
    })();
    await expect(reading).rejects.toMatchObject({ code: 'STREAM_INTERRUPTED' });
    expect(received).toEqual([{ type: 'text-delta', id: 'tutor', delta: 'Début' }]);
  });
});
