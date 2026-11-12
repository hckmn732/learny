// Resend transport (SPEC-204 ET-5, CL-2, CA-7): 429/5xx/network are transient, other 4xx are
// definitive, and the idempotency key travels with the request.
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { EmailRejectedError, EmailTransientError } from '../errors';
import type { EmailMessage } from '../render';

import { isTransientStatus, createResendTransport } from './resend';

const ENDPOINT = 'https://api.resend.com/emails';
const server = setupServer();

const message: EmailMessage = {
  to: 'alex.perrin@test.learny.test',
  from: 'Learny <bonjour@learny.example>',
  subject: 'Bienvenue sur Learny',
  html: '<p>Bonjour</p>',
  text: 'Bonjour',
  headers: { 'X-Entity-Ref-ID': 'welcome:user' },
  tags: [{ name: 'template', value: 'welcome' }],
};

interface Captured {
  idempotencyKey: string | null;
  body: Record<string, unknown>;
}

let captured: Captured | undefined;

beforeAll(() => {
  server.listen();
});

afterEach(() => {
  server.resetHandlers();
  captured = undefined;
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  server.use(
    http.post(ENDPOINT, async ({ request }) => {
      captured = {
        idempotencyKey: request.headers.get('idempotency-key'),
        body: (await request.json()) as Record<string, unknown>,
      };
      return HttpResponse.json({ id: 're_message_1' });
    }),
  );
});

const transport = createResendTransport({ apiKey: 're_test_only' });

describe('[SPEC-204] transport Resend', () => {
  it('envoie le message avec la clé d’idempotence et rend son identifiant', async () => {
    const result = await transport.send(message, { idempotencyKey: 'welcome:user' });
    expect(result.messageId).toBe('re_message_1');
    expect(captured?.idempotencyKey).toBe('welcome:user');
    expect(captured?.body).toMatchObject({
      from: message.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  });

  it('CA-7 — 429 et 503 sont transitoires (réessayables)', async () => {
    for (const status of [429, 503]) {
      server.use(
        http.post(ENDPOINT, () =>
          HttpResponse.json(
            { statusCode: status, name: 'service_error', message: 'x' },
            { status },
          ),
        ),
      );
      await expect(
        transport.send(message, { idempotencyKey: `retry-${String(status)}` }),
      ).rejects.toBeInstanceOf(EmailTransientError);
    }
  });

  it('CA-7 — 422 est un refus définitif', async () => {
    server.use(
      http.post(ENDPOINT, () =>
        HttpResponse.json(
          { statusCode: 422, name: 'validation_error', message: 'invalid from' },
          { status: 422 },
        ),
      ),
    );
    await expect(transport.send(message, { idempotencyKey: 'rejected' })).rejects.toBeInstanceOf(
      EmailRejectedError,
    );
  });

  it('une panne réseau est transitoire', async () => {
    server.use(http.post(ENDPOINT, () => HttpResponse.error()));
    const failure = await transport
      .send(message, { idempotencyKey: 'network' })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(EmailTransientError);
    expect((failure as EmailTransientError).status).toBeNull();
  });

  it('isTransientStatus ne retient que null, 429 et 5xx', () => {
    expect([null, 429, 500, 502, 503].every(isTransientStatus)).toBe(true);
    expect([400, 401, 403, 404, 422].some(isTransientStatus)).toBe(false);
  });
});
