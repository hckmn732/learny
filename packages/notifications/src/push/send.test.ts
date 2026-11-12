// Unit tests of the push channel (SPEC-205 §12): answers of the push service, the five-failure
// rule and its reset, the minimal payload and the safe URL of a notification click. The database
// path (counters, removals, journal) is covered by `test/integration/push.test.ts`.
import { describe, expect, it } from 'vitest';

import { AppError } from '@learny/core';

import { PUSH_PAYLOAD_MAX_BYTES, buildPushPayload, safeNotificationUrl } from './payload';
import {
  PUSH_ERROR_CODES,
  PUSH_MAX_FAILURES,
  decideAttempt,
  summarizeRound,
  type PushAttempt,
} from './send';
import {
  MOCK_STATUS,
  MockPushTransport,
  classifyPushStatus,
  createPushTransport,
  mockOutcomeOf,
  mockPushEndpoint,
  type PushSendResult,
} from './transport';

const NOTIFICATION = {
  id: '6f1d3c3e-9d5a-4e1c-8f1b-2a7d8e9f0a11',
  title: 'Votre quiz global du jour est prêt',
  body: 'Dix questions pour entretenir vos acquis.',
  icon: 'calendar',
  href: '/quiz/global',
};

const TARGET = { p256dh: 'BDummyP256dh', auth: 'dummyAuth' };
const fixedNow = () => new Date('2026-11-11T12:20:00Z');

function result(statusCode: number): PushSendResult {
  return classifyPushStatus(statusCode);
}

describe('[SPEC-205] push delivery', () => {
  describe('push service answers', () => {
    it('treats 2xx as sent, 404 and 410 as gone, anything else as transient (CA-2)', () => {
      expect(result(200)).toEqual({ ok: true, statusCode: 200 });
      expect(result(201)).toEqual({ ok: true, statusCode: 201 });
      expect(result(404)).toEqual({ ok: false, statusCode: 404, reason: 'gone' });
      expect(result(410)).toEqual({ ok: false, statusCode: 410, reason: 'gone' });
      for (const status of [400, 401, 413, 429, 500, 503]) {
        expect(result(status)).toEqual({ ok: false, statusCode: status, reason: 'transient' });
      }
    });

    it('removes the subscription at the first 404 or 410, whatever the counter (CL-4)', () => {
      expect(decideAttempt(0, result(404))).toEqual({ removed: true, failureCount: 0 });
      expect(decideAttempt(3, result(410))).toEqual({ removed: true, failureCount: 0 });
    });

    it('counts transient failures 1 to 4 and removes at the fifth (CL-5)', () => {
      let count = 0;
      const history: number[] = [];
      for (let attempt = 1; attempt < PUSH_MAX_FAILURES; attempt += 1) {
        const decision = decideAttempt(count, result(503));
        expect(decision.removed).toBe(false);
        count = decision.failureCount;
        history.push(count);
      }
      expect(history).toEqual([1, 2, 3, 4]);
      expect(decideAttempt(count, result(503))).toEqual({ removed: true, failureCount: 0 });
      expect(PUSH_MAX_FAILURES).toBe(5);
    });

    it('resets the counter to zero after an intermediate success (CL-5)', () => {
      const afterFailures = decideAttempt(decideAttempt(2, result(500)).failureCount, result(429));
      expect(afterFailures).toEqual({ removed: false, failureCount: 4 });
      expect(decideAttempt(afterFailures.failureCount, result(201))).toEqual({
        removed: false,
        failureCount: 0,
      });
      // Four more failures are needed again before the removal.
      expect(decideAttempt(0, result(503))).toEqual({ removed: false, failureCount: 1 });
    });

    it('summarises a round: sent wins, gone when every subscription left, else transient', () => {
      const attempt = (
        statusCode: number,
        removed: boolean,
      ): Pick<PushAttempt, 'result' | 'removed'> => ({
        result: result(statusCode),
        removed,
      });
      expect(summarizeRound([attempt(503, false), attempt(201, false)])).toEqual({
        status: 'sent',
        error: null,
        retryable: false,
      });
      expect(summarizeRound([attempt(410, true), attempt(404, true)])).toEqual({
        status: 'failed',
        error: PUSH_ERROR_CODES.gone,
        retryable: false,
      });
      expect(summarizeRound([attempt(410, true), attempt(503, false)])).toEqual({
        status: 'failed',
        error: PUSH_ERROR_CODES.transient,
        retryable: true,
      });
      // A fifth failure is a removal: definitive, like a 410.
      expect(summarizeRound([attempt(503, true)])).toEqual({
        status: 'failed',
        error: PUSH_ERROR_CODES.gone,
        retryable: false,
      });
    });
  });

  describe('mock transport (EF-6)', () => {
    it('answers 201, 404, 410 or 503 from the endpoint path, without any network', async () => {
      const transport = new MockPushTransport(fixedNow);
      const payload = JSON.stringify(buildPushPayload(NOTIFICATION));
      const seen: Array<[string, number]> = [];
      for (const outcome of ['success', 'missing', 'gone', 'transient'] as const) {
        const endpoint = mockPushEndpoint('user-1', outcome);
        expect(mockOutcomeOf(endpoint)).toBe(outcome);
        const answer = await transport.send({ endpoint, ...TARGET }, payload, { ttl: 60 });
        seen.push([outcome, answer.statusCode ?? 0]);
      }
      expect(seen).toEqual([
        ['success', 201],
        ['missing', 404],
        ['gone', 410],
        ['transient', 503],
      ]);
      expect(MOCK_STATUS).toEqual({ success: 201, missing: 404, gone: 410, transient: 503 });
      const records = transport.records();
      expect(records.map((record) => record.statusCode)).toEqual([201, 404, 410, 503]);
      expect(records.every((record) => record.host === 'push.mock.learny.test')).toBe(true);
      expect(records.every((record) => record.at === '2026-11-11T12:20:00.000Z')).toBe(true);
      expect(records[0]?.payload).toBe(payload);
      transport.reset();
      expect(transport.records()).toEqual([]);
    });

    it('defaults to a success for an unknown path or an unparsable endpoint', () => {
      expect(mockOutcomeOf('https://push.mock.learny.test/abc')).toBe('success');
      expect(mockOutcomeOf('not a url')).toBe('success');
    });

    it('is the only mode allowed without VAPID keys; live needs them and is refused in CI (CL-8)', () => {
      expect(createPushTransport({ mode: 'mock', now: fixedNow }).mode).toBe('mock');
      expect(() => createPushTransport({ mode: 'live' })).toThrow(AppError);
      expect(() =>
        createPushTransport({ mode: 'live', vapid: { subject: 'mailto:a@b.fr', publicKey: 'p' } }),
      ).toThrow(/VAPID/);
      const keys = { subject: 'mailto:a@b.fr', publicKey: 'public', privateKey: 'private' };
      expect(() => createPushTransport({ mode: 'live', vapid: keys, ci: 'true' })).toThrow(
        /intégration continue/,
      );
      expect(createPushTransport({ mode: 'live', vapid: keys, ci: '' }).mode).toBe('live');
    });
  });

  describe('payload (EF-4, ET-3)', () => {
    it('carries title, body, icon, internal url and tag only', () => {
      const payload = buildPushPayload(NOTIFICATION);
      expect(payload).toEqual({
        title: NOTIFICATION.title,
        body: NOTIFICATION.body,
        icon: 'calendar',
        url: '/quiz/global',
        tag: NOTIFICATION.id,
      });
      expect(Object.keys(payload).sort()).toEqual(['body', 'icon', 'tag', 'title', 'url']);
    });

    it('refuses an external, protocol-relative or javascript: href before any send', () => {
      for (const href of ['https://evil.example/x', '//evil.example', 'javascript:alert(1)', '']) {
        expect(() => buildPushPayload({ ...NOTIFICATION, href })).toThrow(AppError);
      }
    });

    it('refuses a payload beyond the 4 KB bound of the push services', () => {
      const transport = new MockPushTransport(fixedNow);
      const oversized = 'x'.repeat(PUSH_PAYLOAD_MAX_BYTES + 1);
      expect(() =>
        transport.send({ endpoint: mockPushEndpoint('u', 'success'), ...TARGET }, oversized, {
          ttl: 1,
        }),
      ).toThrow(/volumineuse/);
    });
  });

  describe('safe click URL (CL-6, CA-3)', () => {
    const origin = 'https://app.learny.test';

    it('opens an internal path only', () => {
      expect(safeNotificationUrl(origin, '/quiz/global')).toBe(
        'https://app.learny.test/quiz/global',
      );
      expect(safeNotificationUrl(origin, '/agenda?from=2026-11-11')).toBe(
        'https://app.learny.test/agenda?from=2026-11-11',
      );
    });

    it('ignores external, protocol-relative, javascript:, backslash and malformed values', () => {
      for (const candidate of [
        'https://evil.example/',
        '//evil.example/x',
        'javascript:alert(1)',
        '/\\evil.example',
        '/quiz\\..\\x',
        '/a b',
        'quiz',
        '',
        42,
        null,
        undefined,
        { url: '/x' },
      ]) {
        expect(safeNotificationUrl(origin, candidate)).toBeNull();
      }
      expect(safeNotificationUrl('not an origin', '/x')).toBeNull();
    });
  });
});
