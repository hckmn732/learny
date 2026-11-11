// Guards of the deterministic test environment (ADR-0047, ADR-0048).
import { FIXED_TIME_ISO } from './clock';

export const TEST_SERVER_ENV = {
  CLOCK_FIXED_AT: FIXED_TIME_ISO,
  LLM_MODE: 'mock',
  TZ: 'UTC',
} as const;

/** Refuses to start a test run with a real AI provider (CL-5), before any network call. */
export function assertMockLlm(env: Record<string, string | undefined> = process.env): void {
  const mode = env.LLM_MODE;
  if (mode !== undefined && mode !== '' && mode !== 'mock') {
    throw new Error(
      `LLM_MODE=${mode} interdit en test : seul LLM_MODE=mock est autorisé (ADR-0048).`,
    );
  }
}

/** The test server must run with the fixed clock, the mock AI and UTC. */
export function assertTestServerEnv(env: Record<string, string | undefined>): void {
  for (const [key, expected] of Object.entries(TEST_SERVER_ENV)) {
    if (env[key] !== expected) {
      throw new Error(
        `Serveur de test : ${key} doit valoir ${expected} (reçu : ${env[key] ?? 'absent'}).`,
      );
    }
  }
}
