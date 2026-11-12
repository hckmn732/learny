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
