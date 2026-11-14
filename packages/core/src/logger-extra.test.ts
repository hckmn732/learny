import { describe, expect, it } from 'vitest';

import type { Clock } from './clock';
import { createLogCapture, createLogger } from './logger';

const FIXED: Clock = { now: () => new Date('2026-11-11T12:20:00.000Z') };

describe('[SPEC-010] logger — dérivation et capture', () => {
  it('child ajoute le contexte, fatal est émis, clear vide la capture', () => {
    const capture = createLogCapture();
    const logger = createLogger({
      clock: FIXED,
      destination: capture.destination,
      level: 'debug',
      spec: 'SPEC-010',
    });
    const child = logger.child({ jobId: 'job-1' });
    child.fatal('arrêt');
    expect(capture.records()).toEqual([
      expect.objectContaining({
        level: 'fatal',
        message: 'arrêt',
        spec: 'SPEC-010',
        jobId: 'job-1',
      }),
    ]);
    capture.clear();
    expect(capture.text()).toBe('');
    expect(capture.records()).toEqual([]);
  });
});
