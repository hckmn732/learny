'use server';

// Demonstration of SPEC-506 (ADR-0049). Each click builds an isolated account and key, runs the
// real service in forced mock mode, then removes the account. The key is fake, encrypted at rest
// and never returned; only the qualification report reaches the browser.
import { randomUUID } from 'node:crypto';

import { QualificationReport } from '@learny/contracts';
import { AppError } from '@learny/core';
import { serviceDb, sql } from '@learny/db';
import { createTestUser } from '@learny/db/testing';
import { createServiceContext } from '@learny/services';
import { createCredential } from '@learny/services/ai/credentials';
import { qualifyCredential } from '@learny/services/ai/qualify';

const MODEL = 'gpt-qualification-demo';
const SECRET = 'sk-test-0000000000a91F'; // learny-test-only

export interface Spec506DemoState {
  scenario: 'idle' | 'success' | 'invalid';
  input: string;
  report: QualificationReport | null;
  error: string | null;
}

export async function runSpec506Demo(
  _previous: Spec506DemoState,
  formData: FormData,
): Promise<Spec506DemoState> {
  const scenario = formData.get('scenario') === 'invalid' ? 'invalid' : 'success';
  const input = JSON.stringify({ modelId: MODEL }, null, 2);
  const email = `sdd-506-demo-${randomUUID()}@test.learny.test`;
  const user = await serviceDb().transaction((tx) => createTestUser(tx, { email }));
  try {
    const ctx = createServiceContext({
      userId: user.id,
      email,
      requestId: `sdd-506-${randomUUID()}`,
    });
    const created = await createCredential(ctx, {
      provider: 'openai',
      modelIds: [MODEL],
      apiKey: SECRET,
    });
    if (!created.ok) return { scenario, input, report: null, error: created.error.detail };
    const qualified = await qualifyCredential(ctx, created.value.id, MODEL, {
      mode: 'mock',
      mockScenario:
        scenario === 'invalid' ? 'qualification-invalid-brick' : 'qualification-success',
    });
    if (!qualified.ok) {
      return { scenario, input, report: null, error: qualified.error.detail };
    }
    return {
      scenario,
      input,
      report: QualificationReport.parse(qualified.value),
      error: null,
    };
  } catch (error) {
    return {
      scenario,
      input,
      report: null,
      error: error instanceof AppError ? error.detail : 'Démonstration indisponible.',
    };
  } finally {
    await serviceDb().execute(sql`delete from auth.users where email = ${email}`);
  }
}
