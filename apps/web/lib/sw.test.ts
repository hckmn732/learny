// The push handlers of the single service worker (SPEC-205 EF-4, ET-4, CL-6, CA-3) now live in
// `lib/push/sw-push.ts` and are imported by the Serwist worker (SPEC-801). The tests run the real
// functions against a simulated worker scope.
import { describe, expect, it } from 'vitest';

import {
  iconFor,
  registerPushHandlers,
  safeNotificationUrl,
  safeText,
  type PushWorkerScope,
} from './push/sw-push';

const ORIGIN = 'https://app.learny.test';

interface Shown {
  title: string;
  options: { body: string; icon: string; data: { url: string | null }; tag?: string };
}

interface Client {
  url: string;
  focus?: () => Promise<unknown>;
  navigate?: (url: string) => Promise<unknown>;
}

interface Harness {
  scope: PushWorkerScope;
  listeners: Record<string, (event: unknown) => void>;
  shown: Shown[];
  opened: string[];
  navigated: string[];
  focused: number;
  clients: Client[];
}

function loadWorker(): Harness {
  const shown: Shown[] = [];
  const opened: string[] = [];
  const navigated: string[] = [];
  const clients: Client[] = [];
  const harness: Harness = {
    scope: undefined as never,
    listeners: {},
    shown,
    opened,
    navigated,
    focused: 0,
    clients,
  };
  harness.scope = {
    location: { origin: ORIGIN },
    listeners: harness.listeners,
    shown,
    opened,
    navigated,
    focused: 0,
    addEventListener: (name: string, fn: (event: never) => void) => {
      harness.listeners[name] = fn as (event: unknown) => void;
    },
    registration: {
      showNotification: (title: string, options: unknown) => {
        shown.push({ title, options: options as Shown['options'] });
        return Promise.resolve();
      },
    },
    clients: {
      matchAll: () => Promise.resolve(clients),
      openWindow: (url: string) => {
        opened.push(url);
        return Promise.resolve(null);
      },
    },
  } as unknown as PushWorkerScope & Harness;
  registerPushHandlers(harness.scope);
  return harness;
}

async function push(harness: Harness, payload: unknown): Promise<Shown | undefined> {
  const waits: Promise<unknown>[] = [];
  harness.listeners.push?.({
    data: { json: () => payload },
    waitUntil: (promise: Promise<unknown>) => waits.push(promise),
  });
  await Promise.all(waits);
  return harness.shown[harness.shown.length - 1];
}

async function click(harness: Harness, url: unknown): Promise<void> {
  const waits: Promise<unknown>[] = [];
  let closed = 0;
  harness.listeners.notificationclick?.({
    notification: { data: { url }, close: () => (closed += 1) },
    waitUntil: (promise: Promise<unknown>) => waits.push(promise),
  });
  await Promise.all(waits);
  expect(closed).toBe(1);
}

describe('[SPEC-205] [SPEC-801] gestionnaire push du service worker unique', () => {
  it('borne le texte et l’icône, sans URL externe (EF-4)', () => {
    expect(safeText('  a\u0000b  ', 10, 'x')).toBe('a b');
    expect(safeText('T'.repeat(50), 120, 'x')).toHaveLength(50);
    expect(safeText(12, 10, 'x')).toBe('x');
    expect(iconFor('calendar')).toBe('/icons/notification.png');
    expect(iconFor('https://evil/x.png')).toBe('/icons/notification.png');
    expect(safeNotificationUrl(ORIGIN, '/agenda')).toBe(`${ORIGIN}/agenda`);
    for (const candidate of [
      'https://evil.example/',
      'javascript:alert(1)',
      '//evil.example/x',
      '/\\evil.example',
      'quiz',
      '',
      null,
    ]) {
      expect(safeNotificationUrl(ORIGIN, candidate)).toBeNull();
    }
  });

  it('affiche un titre, un corps et une icône bornés (EF-4)', async () => {
    const harness = loadWorker();
    const shown = await push(harness, {
      title: 'Votre quiz global du jour est prêt',
      body: 'Dix questions.',
      icon: 'calendar',
      url: '/quiz/global',
      tag: 'abc',
    });
    expect(shown).toEqual({
      title: 'Votre quiz global du jour est prêt',
      options: {
        body: 'Dix questions.',
        icon: '/icons/notification.png',
        data: { url: `${ORIGIN}/quiz/global` },
        tag: 'abc',
      },
    });
    const long = await push(harness, {
      title: 'T'.repeat(500),
      body: 'B'.repeat(900),
      icon: 'https://evil/x.png',
    });
    expect(long?.title).toHaveLength(120);
    expect(long?.options.body).toHaveLength(400);
    expect(long?.options.icon).toBe('/icons/notification.png');
    const empty = await push(harness, 'not an object');
    expect(empty?.title).toBe('Learny');
    expect(empty?.options.data.url).toBeNull();
  });

  it('ouvre ou focalise une URL interne uniquement (CL-6, CA-3)', async () => {
    const harness = loadWorker();
    await click(harness, '/agenda');
    expect(harness.opened).toEqual([`${ORIGIN}/agenda`]);

    harness.clients.push({
      url: `${ORIGIN}/`,
      focus: () => {
        harness.focused += 1;
        return Promise.resolve();
      },
      navigate: (url) => {
        harness.navigated.push(url);
        return Promise.resolve({ focus: () => Promise.resolve() });
      },
    });
    await click(harness, '/quiz/global');
    expect(harness.navigated).toEqual([`${ORIGIN}/quiz/global`]);
    expect(harness.opened).toHaveLength(1);
  });
});
