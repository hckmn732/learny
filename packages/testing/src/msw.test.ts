import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createMockServer, jsonHandler } from './msw';

const server = createMockServer(
  jsonHandler('get', 'https://api.example.test/status', { ok: true }),
);

beforeAll(() => {
  server.listen();
});
afterAll(() => {
  server.close();
});

describe('[SPEC-004] deterministic HTTP doubles', () => {
  it('answers mocked requests with the fixed body', async () => {
    const res = await fetch('https://api.example.test/status');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('fails any request that is not mocked', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(fetch('https://api.example.test/other')).rejects.toThrow();
    expect(errors.mock.calls.flat().join(' ')).toContain('[MSW]');
    errors.mockRestore();
  });
});
