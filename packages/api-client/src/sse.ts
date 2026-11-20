import type { FollowUpDto, SelfTestDto, TutorSourceDto } from '@learny/contracts';
import { AppError } from '@learny/core';

export type TutorReplyPart =
  | { type: 'text-delta'; id: string; delta: string }
  | { type: 'data-sources'; data: { sources: TutorSourceDto[] } }
  | { type: 'data-follow-ups'; data: { followUps: FollowUpDto[] } }
  | { type: 'data-self-test'; data: SelfTestDto };

function partOf(value: unknown): TutorReplyPart | null {
  if (typeof value !== 'object' || value === null) return null;
  const part = value as Record<string, unknown>;
  if (part.type === 'text-delta') {
    return typeof part.id === 'string' && typeof part.delta === 'string'
      ? { type: 'text-delta', id: part.id, delta: part.delta }
      : null;
  }
  if (part.type === 'data-sources') {
    const data = part.data;
    if (
      typeof data === 'object' &&
      data !== null &&
      Array.isArray((data as { sources?: unknown }).sources)
    ) {
      return { type: 'data-sources', data: data as { sources: TutorSourceDto[] } };
    }
  }
  if (part.type === 'data-follow-ups') {
    const data = part.data;
    if (
      typeof data === 'object' &&
      data !== null &&
      Array.isArray((data as { followUps?: unknown }).followUps)
    ) {
      return { type: 'data-follow-ups', data: data as { followUps: FollowUpDto[] } };
    }
  }
  if (part.type === 'data-self-test') {
    const data = part.data;
    if (typeof data === 'object' && data !== null && 'status' in data) {
      return { type: 'data-self-test', data: data as SelfTestDto };
    }
  }
  return null;
}

export class StreamInterruptedError extends AppError {
  override readonly name = 'StreamInterruptedError';

  constructor(cause?: unknown) {
    super('STREAM_INTERRUPTED', 'Le flux du tuteur a été interrompu.', {
      ...(cause === undefined ? {} : { cause }),
    });
  }
}

function linesToPart(lines: string[]): { done: boolean; part: TutorReplyPart | null } {
  const data = lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''))
    .join('\n');
  if (data === '') return { done: false, part: null };
  if (data === '[DONE]') return { done: true, part: null };
  let value: unknown;
  try {
    value = JSON.parse(data) as unknown;
  } catch (cause) {
    throw new StreamInterruptedError(cause);
  }
  return { done: false, part: partOf(value) };
}

/** Reads the AI SDK UI message stream v1 without depending on React or an SSE implementation. */
export async function* readTutorReplyStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<TutorReplyPart> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let pendingLines: string[] = [];

  try {
    for (;;) {
      const read = await reader.read();
      if (read.done) break;
      buffer += decoder.decode(read.value, { stream: true });
      for (;;) {
        const lineEnd = buffer.indexOf('\n');
        if (lineEnd === -1) break;
        const line = buffer.slice(0, lineEnd).replace(/\r$/, '');
        buffer = buffer.slice(lineEnd + 1);
        if (line === '') {
          const event = linesToPart(pendingLines);
          pendingLines = [];
          if (event.done) {
            await reader.cancel();
            return;
          }
          if (event.part !== null) yield event.part;
        } else if (line.startsWith('data:')) {
          pendingLines.push(line);
        }
      }
    }
    buffer += decoder.decode();
    throw new StreamInterruptedError();
  } catch (cause) {
    if (cause instanceof StreamInterruptedError) throw cause;
    throw new StreamInterruptedError(cause);
  } finally {
    reader.releaseLock();
  }
}
