// Shared fakes of the unit tests of `@learny/services` (SPEC-206, SPEC-210, SPEC-211).
// Everything here is in memory: no database, no network, no clock from the machine (ADR-0047).
import type { Clock, LearnyLogger } from '@learny/core';
import { createLogCapture, createLogger } from '@learny/core/server';

export class TestClock implements Clock {
  private current: Date;

  constructor(at: string = '2026-11-11T12:20:00Z') {
    this.current = new Date(at);
  }

  now(): Date {
    return new Date(this.current);
  }

  set(at: string): void {
    this.current = new Date(at);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

/** A logger that records nothing but is a real `LearnyLogger` (no console noise). */
export function silentLogger(): LearnyLogger {
  return createLogger({ destination: createLogCapture().destination, level: 'silent' });
}

/**
 * Text of a Drizzle `sql` template, for a fake transaction that dispatches on the query. Bound
 * parameters are replaced by `?`; whitespace is normalised, so a test can match a stable
 * fragment such as « from public.profiles ».
 */
export function sqlText(query: unknown): string {
  const chunks = (query as { queryChunks?: unknown[] }).queryChunks;
  if (!Array.isArray(chunks)) return String(query);
  return chunks
    .map((chunk) => chunkText(chunk))
    .join('')
    .replace(/\s+/gu, ' ')
    .trim();
}

function chunkText(chunk: unknown): string {
  if (typeof chunk === 'string') return chunk;
  if (typeof chunk !== 'object' || chunk === null) return ' ? ';
  const value = (chunk as { value?: unknown }).value;
  if (Array.isArray(value)) return value.join('');
  const nested = (chunk as { queryChunks?: unknown[] }).queryChunks;
  if (Array.isArray(nested)) return nested.map((entry) => chunkText(entry)).join('');
  return ' ? ';
}
