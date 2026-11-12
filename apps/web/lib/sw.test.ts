// The service worker is a plain script served from `public/`: these tests run its real bytes in a
// sandbox with a simulated worker scope (SPEC-205 EF-4, ET-4, CL-6, CA-3).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

const SW_PATH = path.resolve(__dirname, '../public/sw.js');
const ORIGIN = 'https://app.learny.test';

interface Shown {
  title: string;
  options: { body: string; icon: string; data: { url: string | null }; tag?: string };
}

interface Scope {
  listeners: Record<string, (event: unknown) => void>;
  shown: Shown[];
  opened: string[];
  navigated: string[];
  focused: number;
  clients: Array<{
    url: string;
    focus: () => Promise<unknown>;
    navigate?: (url: string) => Promise<unknown>;
  }>;
}

function loadWorker(): Scope {
  const scope: Scope = {
    listeners: {},
    shown: [],
    opened: [],
    navigated: [],
    focused: 0,
    clients: [],
  };
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (name: string, fn: (event: unknown) => void) => {
      scope.listeners[name] = fn;
    },
    skipWaiting: () => undefined,
    registration: {
      showNotification: (title: string, options: Shown['options']) => {
        scope.shown.push({ title, options });
        return Promise.resolve();
      },
    },
    clients: {
      claim: () => Promise.resolve(),
      matchAll: () => Promise.resolve(scope.clients),
      openWindow: (url: string) => {
        scope.opened.push(url);
        return Promise.resolve(null);
      },
    },
  };
  const context = vm.createContext({ self, URL, Object, console });
  vm.runInContext(readFileSync(SW_PATH, 'utf8'), context, { filename: 'sw.js' });
  return scope;
}

async function push(scope: Scope, payload: unknown): Promise<Shown | undefined> {
  const waits: Promise<unknown>[] = [];
  scope.listeners.push?.({
    data: { json: () => payload },
    waitUntil: (promise: Promise<unknown>) => waits.push(promise),
  });
  await Promise.all(waits);
  return scope.shown[scope.shown.length - 1];
}

async function click(scope: Scope, url: unknown): Promise<void> {
  const waits: Promise<unknown>[] = [];
  let closed = 0;
  scope.listeners.notificationclick?.({
    notification: { data: { url }, close: () => (closed += 1) },
    waitUntil: (promise: Promise<unknown>) => waits.push(promise),
  });
  await Promise.all(waits);
  expect(closed).toBe(1);
}

describe('[SPEC-205] service worker', () => {
  it('contains no secret, no cache and only the push handlers (ET-4)', () => {
    const source = readFileSync(SW_PATH, 'utf8');
    expect(source).not.toMatch(/VAPID_PRIVATE_KEY|privateKey|caches\.|fetch\(/);
    expect(source).toContain("addEventListener('push'");
    expect(source).toContain("addEventListener('notificationclick'");
  });

  it('shows a bounded title, body and bundled icon from the payload (EF-4)', async () => {
    const scope = loadWorker();
    const shown = await push(scope, {
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
    const long = await push(scope, {
      title: 'T'.repeat(500),
      body: 'B'.repeat(900),
      icon: 'https://evil/x.png',
    });
    expect(long?.title).toHaveLength(120);
    expect(long?.options.body).toHaveLength(400);
    expect(long?.options.icon).toBe('/icons/notification.png');
    const empty = await push(scope, 'not an object');
    expect(empty?.title).toBe('Learny');
    expect(empty?.options.data.url).toBeNull();
  });

  it('opens or focuses an internal URL only (CL-6, CA-3)', async () => {
    const scope = loadWorker();
    await click(scope, '/agenda');
    expect(scope.opened).toEqual([`${ORIGIN}/agenda`]);

    scope.clients = [
      {
        url: `${ORIGIN}/`,
        focus: () => {
          scope.focused += 1;
          return Promise.resolve();
        },
        navigate: (url) => {
          scope.navigated.push(url);
          return Promise.resolve({ focus: () => Promise.resolve() });
        },
      },
    ];
    await click(scope, '/quiz/global');
    expect(scope.navigated).toEqual([`${ORIGIN}/quiz/global`]);
    expect(scope.opened).toHaveLength(1);
  });

  it('ignores external, javascript:, protocol-relative and malformed URLs (CL-6)', async () => {
    const scope = loadWorker();
    for (const url of [
      'https://evil.example/',
      'javascript:alert(1)',
      '//evil.example/x',
      '/\\evil.example',
      'quiz',
      '',
      null,
      undefined,
      12,
    ]) {
      await click(scope, url);
    }
    expect(scope.opened).toEqual([]);
    expect(scope.navigated).toEqual([]);
    expect(scope.focused).toBe(0);
  });
});
