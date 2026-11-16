import { describe, expect, it } from 'vitest';

import { retryAvailability, retryAvailabilityFromAction } from './retry-gate';

const NOW = new Date('2026-11-11T12:20:00Z');
const AVAILABLE_AT = '2026-11-11T13:00:00.000Z';

describe('[SPEC-715] garde de nouvelle tentative', () => {
  it('EF-5, CA-2 — un délai en cours refuse et expose retryAvailableAt', () => {
    const gate = retryAvailabilityFromAction({
      now: NOW,
      action: {
        status: 'applied',
        retryAvailableAt: AVAILABLE_AT,
        mode: 'advised',
        remediationActivityId: '11111111-1111-4111-8111-111111111111',
        remediationDone: false,
      },
    });
    expect(gate).toEqual({
      allowed: false,
      availableAt: AVAILABLE_AT,
      reason: 'delay',
      remediationRequired: false,
      remediationDone: false,
    });
  });

  it('EF-5, CA-3 — le mode obligatoire exige la remédiation terminée', () => {
    const blocked = retryAvailabilityFromAction({
      now: new Date('2026-11-11T13:00:01Z'),
      action: {
        status: 'applied',
        retryAvailableAt: AVAILABLE_AT,
        mode: 'mandatory',
        remediationActivityId: '11111111-1111-4111-8111-111111111111',
        remediationDone: false,
      },
    });
    expect(blocked.reason).toBe('remediation_required');
    expect(blocked.remediationRequired).toBe(true);
    const allowed = retryAvailabilityFromAction({
      now: new Date('2026-11-11T13:00:01Z'),
      action: {
        status: 'applied',
        retryAvailableAt: AVAILABLE_AT,
        mode: 'mandatory',
        remediationActivityId: '11111111-1111-4111-8111-111111111111',
        remediationDone: true,
      },
    });
    expect(allowed.allowed).toBe(true);
  });

  it('CL-9 — sans remédiation disponible, l’obligation est levée', () => {
    const gate = retryAvailabilityFromAction({
      now: new Date('2026-11-11T13:00:01Z'),
      action: {
        status: 'applied',
        retryAvailableAt: AVAILABLE_AT,
        mode: 'mandatory',
        remediationActivityId: null,
        remediationDone: false,
      },
    });
    expect(gate.allowed).toBe(true);
  });

  it('CA-5, EF-9 — une action annulée ou consommée lève le délai', () => {
    for (const status of ['undone', 'consumed'] as const) {
      const gate = retryAvailabilityFromAction({
        now: NOW,
        action: {
          status,
          retryAvailableAt: AVAILABLE_AT,
          mode: 'mandatory',
          remediationActivityId: '11111111-1111-4111-8111-111111111111',
          remediationDone: false,
        },
      });
      expect(gate.allowed).toBe(true);
    }
  });

  it('CL-1, ET-6 — un automatisme désactivé rend la tentative immédiate', () => {
    const gate = retryAvailability({
      now: NOW,
      latest: { attemptId: 'attempt', passed: false, submittedAt: NOW.toISOString() },
      settings: { enabled: false, delayHours: 48, mode: 'mandatory' },
      remediationCompleted: false,
      inProgress: false,
    });
    expect(gate.allowed).toBe(true);
    expect(gate.remediationRequired).toBe(false);
  });

  it('CL-8 — le délai reste une durée de 24 h au changement d’heure', () => {
    const gate = retryAvailability({
      now: new Date('2026-10-25T12:00:00Z'),
      latest: { attemptId: 'attempt', passed: false, submittedAt: '2026-10-24T12:30:00Z' },
      settings: { enabled: true, delayHours: 24, mode: 'advised' },
      remediationCompleted: false,
      inProgress: false,
    });
    expect(gate.availableAt).toBe('2026-10-25T12:30:00.000Z');
    expect(gate.allowed).toBe(false);
  });
});
