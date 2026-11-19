import { describe, expect, it } from 'vitest';

import { createOnboardingTicket, readOnboardingTicket } from './onboarding-ticket';

const KEY = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=';
const USER = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-11-11T12:20:00Z');

describe('[SPEC-602] ticket d’onboarding', () => {
  it('relit le même utilisateur et la même étape pendant moins de 60 s', () => {
    const ticket = createOnboardingTicket({ userId: USER, step: 'rappels', now: NOW }, KEY);
    expect(ticket).not.toBeNull();
    expect(
      readOnboardingTicket(
        ticket ?? '',
        { userId: USER, now: new Date(NOW.getTime() + 59_000) },
        KEY,
      ),
    ).toMatchObject({ userId: USER, step: 'rappels' });
  });

  it('refuse un ticket expiré, un autre utilisateur ou une signature modifiée', () => {
    const ticket = createOnboardingTicket({ userId: USER, step: 'done', now: NOW }, KEY) ?? '';
    expect(
      readOnboardingTicket(ticket, { userId: USER, now: new Date(NOW.getTime() + 61_000) }, KEY),
    ).toBeNull();
    expect(readOnboardingTicket(ticket, { userId: 'other', now: NOW }, KEY)).toBeNull();
    expect(readOnboardingTicket(`${ticket}x`, { userId: USER, now: NOW }, KEY)).toBeNull();
  });
});
