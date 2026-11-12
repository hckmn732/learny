import { describe, expect, it } from 'vitest';

import { resolveJobsMode } from './mode';

describe('[SPEC-203] mode d’exécution des jobs', () => {
  it('résout inngest par défaut et inline quand JOBS_MODE=inline hors production', () => {
    expect(resolveJobsMode({ APP_ENV: 'local' })).toBe('inngest');
    expect(resolveJobsMode({ APP_ENV: 'test' })).toBe('inline');
    expect(resolveJobsMode({ APP_ENV: 'local', JOBS_MODE: 'inline' })).toBe('inline');
    expect(resolveJobsMode({ APP_ENV: 'preview', JOBS_MODE: 'inngest' })).toBe('inngest');
  });

  it('refuse inline en production, à l’émission comme à la configuration', () => {
    expect(() => resolveJobsMode({ APP_ENV: 'production', JOBS_MODE: 'inline' })).toThrow();
  });
});
