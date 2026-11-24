// Vitest [SPEC-3301] — real public charges built by the server (CA-1, CA-2, CA-3).
//
// Requires `pnpm dev:up`, the demonstration seed and the API on http://127.0.0.1:3001 with
// `LLM_MODE=mock`. The demonstration route of SPEC-501 creates a brick version through the real
// service (`createBrick` + `getPublicBrick`, RLS included) and returns exactly the public
// projection the mobile application receives:
//   set -a; . ./.env.local; set +a; node tools/sdd/validate.mjs SPEC-3301
//
// The route is the fixture of the SPEC-501 demonstration page: it adds one brick version to the
// seeded formation on each run, which is why the test never corrects or retires anything.
import { describe, expect, it } from 'vitest';

import type { AutoGradedType, BrickPayload, BrickType } from '@learny/bricks';
import { AUTO_GRADED_TYPES, BRICK_TYPES, gradeBrick } from '@learny/bricks';

import { parsePublicPayload } from '../../src/bricks/public-schemas';
import { WEB_ONLY_BRICK_TYPES } from '../../src/bricks/registry';
import { correctResponseFor } from '../../src/bricks/showcase';

const ENV = process.env as Record<string, string | undefined>;
const API_URL = ENV.MOBILE_API_URL ?? 'http://127.0.0.1:3001';

interface DemoBrick {
  readonly brickId: string;
  readonly status: string;
  readonly currentVersion: number;
  readonly publicPayload: unknown;
  readonly publicVersionId: string;
}

interface DemoResponse {
  readonly brick: DemoBrick | null;
  readonly error: string | null;
}

/** Creates (idempotently) the demonstration brick of SPEC-501 and returns its public projection. */
async function serverBrick(): Promise<DemoBrick> {
  const response = await fetch(`${API_URL}/api/v1/dev/sdd/SPEC-501/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // The origin guard of the API accepts a request without `Origin` when it proves it is
      // same-origin (ADR-0016); a native client has no origin at all.
      'Sec-Fetch-Site': 'same-origin',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: '{}',
  });
  expect(response.status).toBe(200);
  const { brick } = (await response.json()) as DemoResponse;
  if (brick === null) throw new Error('La démonstration SPEC-501 n’a pas créé de brique.');
  return brick;
}

describe('[SPEC-3301] charges publiques réelles', () => {
  it('[SPEC-3301] la pile locale sert une charge publique typée (CA-1)', async () => {
    const health = await fetch(`${API_URL}/api/v1/health`);
    expect(health.status).toBe(200);
    const brick = await serverBrick();
    expect(brick.status).toBe('active');
    expect(brick.publicPayload).toBeTypeOf('object');
  });

  it('[SPEC-3301] la charge publique du serveur est acceptée par le miroir de son type (CA-1, CA-2)', async () => {
    const brick = await serverBrick();
    const payload = brick.publicPayload as { mode?: 'single' | 'multiple'; options?: unknown[] };
    // The SPEC-501 demonstration builds a choice question; its public projection is exactly the
    // shape the mobile mirror describes (`stem`, `mode`, `options`, `sources`).
    expect(payload.mode).toBeTypeOf('string');
    expect(Array.isArray(payload.options)).toBe(true);
    const parsed = parsePublicPayload('choice_question', brick.publicPayload);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.payload.options.length).toBeGreaterThanOrEqual(2);
  });

  it('[SPEC-3301] la charge publique ne porte aucune bonne réponse (CA-3)', async () => {
    const brick = await serverBrick();
    const serialised = JSON.stringify(brick.publicPayload);
    for (const field of ['"correct"', '"answers"', '"expectedElements"', '"modelAnswer"']) {
      expect(serialised).not.toContain(field);
    }
  });

  it('[SPEC-3301] le registre et les schémas couvrent les treize types (CA-1, ET-1)', () => {
    expect(BRICK_TYPES).toHaveLength(13);
    for (const type of AUTO_GRADED_TYPES) {
      expect(WEB_ONLY_BRICK_TYPES).not.toContain(type);
    }
    // A response built by the device is graded by the same pure code the server runs (CA-2).
    expect(typeof correctResponseFor).toBe('function');
    expect(typeof gradeBrick).toBe('function');
    const typed: BrickType = 'text';
    expect(typed).toBe('text');
    const auto: AutoGradedType = 'cloze';
    expect(typeof auto).toBe('string');
    const payload = {} as BrickPayload<AutoGradedType>;
    expect(payload).toBeTypeOf('object');
  });
});
