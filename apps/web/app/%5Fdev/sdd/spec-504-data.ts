// Data of the SPEC-504 demonstration: three isolated accounts built for one request, then removed.
// `serviceDb` is used only under `_dev` (ADR-0049); resolution itself runs against the real tables.
import { randomUUID } from 'node:crypto';

import { AI_TASKS, type AiTask } from '@learny/config';
import { serviceDb, sql } from '@learny/db';
import { createCredential, setTaskModel, upsertSubscription } from '@learny/db';
import { createTestUser } from '@learny/db/testing';
import { resolveModel } from '@learny/llm';

const PREFIX = 'sdd-504-demo-';
const FUTURE = new Date('2026-12-11T12:20:00.000Z');

export interface ResolutionCell {
  task: AiTask;
  model: string;
  available: boolean;
  reason: string | null;
}

export interface ResolutionRow {
  key: 'subscriber' | 'byok' | 'none';
  label: string;
  cells: ResolutionCell[];
}

async function newUser(label: string): Promise<string> {
  const email = `${PREFIX}${label}-${randomUUID()}@test.learny.test`;
  return serviceDb().transaction(async (tx) => (await createTestUser(tx, { email })).id);
}

async function subscribe(userId: string): Promise<void> {
  await serviceDb().transaction((tx) =>
    upsertSubscription(tx, { userId, status: 'active', currentPeriodEnd: FUTURE }),
  );
}

async function resolution(userId: string): Promise<ResolutionCell[]> {
  const cells: ResolutionCell[] = [];
  for (const task of AI_TASKS) {
    const resolved = await resolveModel(serviceDb(), { userId, task });
    cells.push(
      resolved.ok
        ? {
            task,
            model: `${resolved.value.provider} · ${resolved.value.modelId}`,
            available: true,
            reason: null,
          }
        : {
            task,
            model: 'Indisponible',
            available: false,
            reason: resolved.error.reason ?? resolved.error.code,
          },
    );
  }
  return cells;
}

export async function loadResolutionDemo(): Promise<ResolutionRow[]> {
  const subscriber = await newUser('subscriber');
  const byok = await newUser('byok');
  const none = await newUser('none');
  try {
    await subscribe(subscriber);
    const credential = await serviceDb().transaction((tx) =>
      createCredential(tx, {
        userId: byok,
        provider: 'openai',
        label: 'Clé OpenAI de démonstration',
        baseUrl: 'https://api.openai.com/v1',
        modelIds: ['gpt-demo'],
        encryptedKey: new Uint8Array(29).fill(3),
        keyLast4: 'demo',
        status: 'qualified',
        qualifiedAt: FUTURE,
      }),
    );
    await serviceDb().transaction((tx) =>
      setTaskModel(tx, {
        userId: byok,
        task: 'tutor',
        credentialId: credential.id,
        modelId: 'gpt-demo',
      }),
    );
    return [
      { key: 'subscriber', label: 'Abonné à l’IA fournie', cells: await resolution(subscriber) },
      {
        key: 'byok',
        label: 'Non abonné, clé OpenAI qualifiée sur tuteur',
        cells: await resolution(byok),
      },
      { key: 'none', label: 'Sans abonnement ni clé', cells: await resolution(none) },
    ];
  } finally {
    await serviceDb().execute(
      sql`delete from auth.users where email like ${`${PREFIX}%`}`,
    );
  }
}

export interface MockCallState {
  task: AiTask;
  scenario: string;
  kind: 'text' | 'tools' | 'object' | 'error';
  result: string;
  call: {
    task: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    status: string;
    errorCode: string | null;
  } | null;
}

export async function runMockCall(input: {
  task: AiTask;
  scenario: string;
}): Promise<MockCallState> {
  const userId = await newUser('call');
  await subscribe(userId);
  try {
    const session = await (await import('@learny/llm')).createSession(
      { userId, db: serviceDb(), requestId: `sdd-504-${randomUUID()}` },
      {
        task: input.task,
        promptId: input.task === 'light' ? 'light.demo-object' : 'tutor.demo',
        mock: { scenario: input.scenario },
      },
    );
    if (!session.ok) {
      return {
        task: input.task,
        scenario: input.scenario,
        kind: 'error',
        result: session.error.code,
        call: null,
      };
    }
    let kind: MockCallState['kind'] = 'text';
    let result: string;
    if (input.scenario === 'demo-object' || input.scenario === 'demo-invalid-object') {
      const { z } = await import('zod');
      const object = await session.value.object({
        system: [{ text: 'Réponds avec un titre et une confiance.', cache: false }],
        messages: [{ role: 'user', content: 'Titre du chapitre' }],
        schema: z.object({ title: z.string(), confidence: z.number() }),
      });
      kind = 'object';
      result = object.ok ? JSON.stringify(object.value) : object.error.code;
    } else {
      const step = await session.value.step({
        system: [{ text: 'Tu es un tuteur concis.', cache: true }],
        messages: [{ role: 'user', content: 'Bonjour' }],
      });
      if (step.ok) {
        kind = step.value.toolCalls.length > 0 ? 'tools' : 'text';
        result =
          step.value.toolCalls.length > 0
            ? JSON.stringify(step.value.toolCalls)
            : step.value.text;
      } else {
        kind = 'error';
        result = step.error.code;
      }
    }
    const { listAiCalls } = await import('@learny/db');
    const rows = await listAiCalls(serviceDb() as never, { userId, limit: 1 });
    const row = rows[0];
    return {
      task: input.task,
      scenario: input.scenario,
      kind,
      result,
      call:
        row === undefined
          ? null
          : {
              task: row.task,
              model: row.model,
              inputTokens: row.inputTokens,
              outputTokens: row.outputTokens,
              status: row.status,
              errorCode: row.errorCode,
            },
    };
  } finally {
    // ai_calls.user_id is set to null by the FK and the row survives for the assertion.
    await serviceDb().execute(
      sql`delete from auth.users where email like ${`${PREFIX}%`}`,
    );
  }
}
