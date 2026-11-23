import { describe, expect, it, vi } from 'vitest';

import { readApiHealth } from './health';

const ENV = { API_INTERNAL_URL: 'http://127.0.0.1:4011' };
const HEALTHY = {
  status: 'ok',
  version: 'dev',
  commit: 'unknown',
  database: 'ok',
  components: { database: 'ok', build: 'not_configured' },
};

describe('[SPEC-1203] santé affichée par le web', () => {
  it('lit la santé de l’API sur sa route publique', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(HEALTHY));

    const result = await readApiHealth(fetcher, ENV);

    expect(String(fetcher.mock.calls[0]?.[0])).toBe('http://127.0.0.1:4011/api/v1/health');
    expect(result).toEqual({ httpStatus: 200, body: HEALTHY });
  });

  it('signale une API injoignable comme indisponible, jamais comme saine', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('connection refused'));

    const result = await readApiHealth(fetcher, ENV);

    expect(result.httpStatus).toBe(503);
    expect(result.body.status).toBe('degraded');
    expect(result.body.database).toBe('unavailable');
  });
});
