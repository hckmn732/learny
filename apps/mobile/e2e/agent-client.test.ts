// Tests du client HTTP de l'agent appareil : soumission, scrutation, délais (ADR-3015 § 1).
//
// L'edge coupe les requêtes longues : le contrat testé ici est celui d'un travail asynchrone dont
// chaque requête est courte, avec un délai global long et une erreur explicite qui nomme le
// `jobId` — jamais un `container_unreachable` anonyme.
import { describe, expect, it } from 'vitest';

import {
  AgentProtocolError,
  AgentTimeoutError,
  createAgentClient,
  DEFAULT_JOB_TIMEOUT_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  TERMINAL_STATUSES,
} from './agent-client.mjs';

const ARTIFACT = {
  flow: 'SPEC-3003 session',
  kind: 'screenshot',
  path: 'SPEC-3003 session/takeScreenshot/SPEC-3003-session.png',
  name: 'SPEC-3003-session.png',
  base64: 'iVBORw0KGgo=',
};

interface Call {
  url: string;
  method: string;
  body: unknown;
  hasSignal: boolean;
}

interface Reply {
  status?: number;
  body: unknown;
}

/** Faux agent : `handler` décide de la réponse à chaque appel, `calls` journalise. */
function harness(handler: (call: Call, index: number) => Reply | Error) {
  const calls: Call[] = [];
  const clock = { t: 1_000 };
  const fetchImpl = ((url: string, init: RequestInit = {}): Promise<Response> => {
    const signal = init.signal;
    const call: Call = {
      url,
      method: init.method ?? 'GET',
      body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : null,
      hasSignal: signal !== undefined && signal !== null,
    };
    calls.push(call);
    const reply = handler(call, calls.length - 1);
    if (reply instanceof Error) return Promise.reject(reply);
    return Promise.resolve(
      new Response(JSON.stringify(reply.body), {
        status: reply.status ?? 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }) as unknown as typeof fetch;

  const client = createAgentClient({
    baseUrl: 'https://agent.test/',
    token: 'jeton',
    fetchImpl,
    requestTimeoutMs: 5_000,
    pollIntervalMs: 2_000,
    jobTimeoutMs: 20_000,
    now: () => clock.t,
    delay: (ms: number) => {
      clock.t += ms;
      return Promise.resolve();
    },
    log: () => {},
  });

  return { client, calls, clock };
}

describe('[SPEC-3001] client de l’agent appareil', () => {
  it('soumet la campagne et rend un jobId sans attendre Maestro', async () => {
    const { client, calls } = harness(() => ({
      status: 202,
      body: { jobId: 'j-1', status: 'queued' },
    }));

    const jobId = await client.submitMaestro({ tags: ['SPEC-3001'], flows: [] });

    expect(jobId).toBe('j-1');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://agent.test/maestro');
    expect(calls[0]?.method).toBe('POST');
  });

  it('scrute le statut et rend le JUnit et les artefacts du travail terminé', async () => {
    const replies = [
      { status: 202, body: { jobId: 'j-2' } },
      { body: { id: 'j-2', status: 'running', progress: 'maestro' } },
      { body: { id: 'j-2', status: 'running', progress: 'maestro' } },
      {
        body: {
          id: 'j-2',
          status: 'done',
          exitCode: 0,
          junit:
            '<testsuites><testsuite><testcase name="SPEC-3001 demo"/></testsuite></testsuites>',
          artifacts: [ARTIFACT],
        },
      },
    ];
    const { client, calls } = harness(
      (_call, index) => replies[index] ?? new Error('appel excédentaire'),
    );

    const done = await client.runMaestro({ tags: ['SPEC-3001'] });

    expect(done.status).toBe('done');
    expect(done.junit).toContain('testcase name="SPEC-3001 demo"');
    expect(done.artifacts?.[0]?.flow).toBe('SPEC-3003 session');
    // Une soumission puis une scrutation par état, toutes en mode léger.
    expect(calls).toHaveLength(4);
    expect(calls[1]?.url).toBe('https://agent.test/maestro/j-2?artifacts=0');
  });

  it('garde chaque requête courte : délai de 5 s et signal d’annulation', async () => {
    const { client, calls } = harness((_call, index) =>
      index === 0
        ? { status: 202, body: { jobId: 'j-3' } }
        : { body: { id: 'j-3', status: 'done' } },
    );

    await client.runMaestro({ tags: ['SPEC-3001'] });

    expect(client.requestTimeoutMs).toBe(DEFAULT_REQUEST_TIMEOUT_MS);
    expect(client.requestTimeoutMs).toBeLessThanOrEqual(5_000);
    expect(DEFAULT_JOB_TIMEOUT_MS).toBeGreaterThan(60_000);
    expect(client.jobTimeoutMs).toBeGreaterThan(client.requestTimeoutMs);
    for (const call of calls) expect(call.hasSignal).toBe(true);
  });

  it('échoue en nommant le travail quand le délai global est dépassé, puis l’annule', async () => {
    const { client, calls } = harness((_call, index) =>
      index === 0
        ? { status: 202, body: { jobId: 'j-4' } }
        : { body: { id: 'j-4', status: 'running', progress: 'maestro' } },
    );

    const thrown: unknown = await client
      .runMaestro({ tags: ['SPEC-3001'] })
      .then(() => null)
      .catch((cause: unknown) => cause);

    expect(thrown).toBeInstanceOf(AgentTimeoutError);
    const message = thrown instanceof Error ? thrown.message : '';
    expect(message).toContain('j-4');
    expect(message).toContain('sans statut terminal');
    expect(calls.some((call) => call.url.endsWith('/maestro/j-4/cancel'))).toBe(true);
  });

  it('refuse un agent au contrat synchrone en expliquant le correctif', async () => {
    const { client } = harness(() => ({
      body: { status: 0, stdout: '', stderr: '', junit: '', artifacts: [] },
    }));

    const thrown: unknown = await client
      .submitMaestro({ tags: ['SPEC-3001'] })
      .then(() => null)
      .catch((cause: unknown) => cause);

    expect(thrown).toBeInstanceOf(AgentProtocolError);
    expect(thrown instanceof Error ? thrown.message : '').toContain('jobId');
  });

  it('retente une scrutation en échec isolée (l’edge peut hoqueter)', async () => {
    const { client } = harness((_call, index) => {
      if (index === 0) return { status: 202, body: { jobId: 'j-5' } };
      if (index === 1) return new Error('fetch failed');
      return { body: { id: 'j-5', status: 'done', junit: '<testsuites/>', artifacts: [] } };
    });

    const done = await client.runMaestro({ tags: ['SPEC-3001'] });

    expect(done.status).toBe('done');
  });

  it('abandonne après cinq scrutations en échec consécutives', async () => {
    const { client } = harness((_call, index) =>
      index === 0 ? { status: 202, body: { jobId: 'j-6' } } : new Error('fetch failed'),
    );

    const thrown: unknown = await client
      .runMaestro({ tags: ['SPEC-3001'] })
      .then(() => null)
      .catch((cause: unknown) => cause);

    expect(thrown).toBeInstanceOf(AgentTimeoutError);
  });

  it('redemande les artefacts quand la réponse terminale les omet', async () => {
    const { client, calls } = harness((_call, index) => {
      if (index === 0) return { status: 202, body: { jobId: 'j-7' } };
      if (index === 1) return { body: { id: 'j-7', status: 'done', junit: '<testsuites/>' } };
      return { body: { id: 'j-7', status: 'done', junit: '<testsuites/>', artifacts: [ARTIFACT] } };
    });

    const done = await client.runMaestro({ tags: ['SPEC-3001'] });

    expect(done.artifacts).toHaveLength(1);
    expect(calls.at(-1)?.url).toBe('https://agent.test/maestro/j-7');
  });

  it('expose les statuts terminaux du contrat', () => {
    expect([...TERMINAL_STATUSES].sort()).toEqual(['cancelled', 'done', 'error', 'failed']);
  });
});
