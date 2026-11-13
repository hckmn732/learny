import { describe, expect, it } from 'vitest';

import { retryAvailability } from './retry-gate';

const NOW = new Date('2026-11-11T12:20:00Z');
const latest = { attemptId: 'attempt', passed: false, submittedAt: NOW.toISOString() };

describe('[SPEC-612] garde de nouvelle tentative', () => {
  it('CA-5 — refuse avant le délai et expose availableAt', () => {
    const gate = retryAvailability({
      now: NOW,
      latest,
      settings: { enabled: true, delayHours: 24, mode: 'advised' },
      remediationCompleted: false,
      inProgress: false,
    });
    expect(gate).toEqual({
      allowed: false,
      availableAt: '2026-11-12T12:20:00.000Z',
      reason: 'delay',
    });
  });

  it('CA-5 — les délais 0, 12, 24 et 48 heures sont admis', () => {
    for (const delayHours of [0, 12, 24, 48]) {
      const at = new Date(NOW.getTime() + delayHours * 3_600_000);
      const gate = retryAvailability({
        now: at,
        latest,
        settings: { enabled: true, delayHours, mode: 'advised' },
        remediationCompleted: false,
        inProgress: false,
      });
      expect(gate.allowed).toBe(true);
    }
  });

  it('CA-5, CL-7 — un automatisme désactivé rend la tentative immédiate', () => {
    const gate = retryAvailability({
      now: NOW,
      latest,
      settings: { enabled: false, delayHours: 48, mode: 'required' },
      remediationCompleted: false,
      inProgress: false,
    });
    expect(gate.allowed).toBe(true);
  });

  it('CA-5, CL-8 — le mode obligatoire exige une remédiation terminée', () => {
    const later = new Date('2026-11-13T12:20:00Z');
    const blocked = retryAvailability({
      now: later,
      latest,
      settings: { enabled: true, delayHours: 24, mode: 'required' },
      remediationCompleted: false,
      inProgress: false,
    });
    expect(blocked.reason).toBe('remediation_required');
    expect(
      retryAvailability({
        now: later,
        latest,
        settings: { enabled: true, delayHours: 24, mode: 'required' },
        remediationCompleted: true,
        inProgress: false,
      }).allowed,
    ).toBe(true);
  });

  it('CL-1 — une tentative en cours ou une réussite ne bloque jamais', () => {
    expect(
      retryAvailability({
        now: NOW,
        latest,
        settings: { enabled: true, delayHours: 24, mode: 'advised' },
        remediationCompleted: false,
        inProgress: true,
      }).allowed,
    ).toBe(true);
    expect(
      retryAvailability({
        now: NOW,
        latest: { ...latest, passed: true },
        settings: { enabled: true, delayHours: 24, mode: 'required' },
        remediationCompleted: false,
        inProgress: false,
      }).allowed,
    ).toBe(true);
  });
});
