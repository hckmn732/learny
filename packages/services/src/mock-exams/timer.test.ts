import { describe, expect, it } from 'vitest';

import { defaultExamFormat } from './format';
import {
  EXAM_WARNING_SECONDS,
  examAcceptsAnswer,
  examDeadline,
  examExpired,
  examRemainingMs,
  examTimer,
} from './timer';

const START = new Date('2026-11-11T12:20:00Z');

describe('[SPEC-614] chronomètre et format de l’examen blanc', () => {
  it('CA-1 — sans guide, l’examen dure 40 minutes avec 20 questions et un seuil de 70 %', () => {
    const format = defaultExamFormat();
    expect(format).toMatchObject({
      questionCount: 20,
      secondsPerQuestion: 120,
      durationMin: 40,
      threshold: 70,
      source: 'default',
      confirmed: true,
    });
    const deadline = examDeadline(START, format.durationMin * 60);
    expect(examTimer(deadline, START).display).toBe('40:00');
    expect(examTimer(deadline, START).remainingSeconds).toBe(2_400);
  });

  it('CA-2 — le compteur devient orange strictement sous 5 minutes', () => {
    const deadline = examDeadline(START, 2_400);
    const atFiveMinutes = new Date(deadline.getTime() - EXAM_WARNING_SECONDS * 1_000);
    expect(examTimer(deadline, atFiveMinutes).warning).toBe(false);
    const under = new Date(atFiveMinutes.getTime() + 1_000);
    expect(examTimer(deadline, under).warning).toBe(true);
    expect(examTimer(deadline, new Date(deadline.getTime() - 61_000)).display).toBe('01:01');
    expect(examTimer(deadline, deadline).expired).toBe(true);
    expect(examTimer(deadline, new Date(deadline.getTime() + 30_000)).remainingSeconds).toBe(0);
  });

  it('CL-3 — rouvrir la page reprend la même échéance, jamais un nouveau délai', () => {
    const deadline = examDeadline(START, 2_400);
    const tenMinutesLeft = new Date(deadline.getTime() - 10 * 60_000);
    const firstRead = examTimer(deadline, tenMinutesLeft);
    const secondRead = examTimer(deadline, tenMinutesLeft);
    expect(firstRead.remainingSeconds).toBe(600);
    expect(secondRead.remainingSeconds).toBe(firstRead.remainingSeconds);
    expect(examRemainingMs(deadline, tenMinutesLeft)).toBe(firstRead.remainingMs);
    const later = new Date(tenMinutesLeft.getTime() + 60_000);
    expect(examTimer(deadline, later).remainingSeconds).toBe(540);
  });

  it('ET-4 — un changement de fuseau ne change pas l’échéance absolue', () => {
    const deadline = examDeadline(START, 2_400);
    const now = new Date('2026-11-11T12:50:00Z');
    const paris = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris',
      hour: '2-digit',
      minute: '2-digit',
    }).format(now);
    const newYork = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
    }).format(now);
    expect(paris).not.toBe(newYork);
    expect(examTimer(deadline, now).remainingSeconds).toBe(600);
    expect(examTimer(deadline.toISOString(), now).remainingSeconds).toBe(600);
  });

  it('ADR-0172 — une réponse est acceptée jusqu’à cinq secondes après l’échéance', () => {
    const deadline = examDeadline(START, 2_400);
    expect(examAcceptsAnswer(deadline, new Date(deadline.getTime() + 5_000))).toBe(true);
    expect(examAcceptsAnswer(deadline, new Date(deadline.getTime() + 5_001))).toBe(false);
    expect(examExpired(deadline, new Date(deadline.getTime() + 4_999))).toBe(false);
    expect(examExpired(deadline, new Date(deadline.getTime() + 6_000))).toBe(true);
  });
});
