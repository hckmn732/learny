// Server-only view of the LLM environment (SPEC-504 ET-3, ET-9). The values come from the single
// Zod schema of @learny/config; nothing here is ever imported by a browser component.
import type { LlmMode } from '@learny/config';
import { parseServerEnv } from '@learny/config/server';

/** `LLM_MODE` with the documented fallback: a missing value means `mock` outside production. */
export function llmMode(env: Record<string, string | undefined> = process.env): LlmMode {
  const raw = env.LLM_MODE;
  if (raw === 'live' || raw === 'mock') return raw;
  return 'mock';
}

/** Provided-AI key, read only server-side (ET-3, ET-9). */
export function anthropicApiKey(env: Record<string, string | undefined> = process.env): string | null {
  if (env.ANTHROPIC_API_KEY !== undefined && env.ANTHROPIC_API_KEY.trim() !== '') {
    return env.ANTHROPIC_API_KEY;
  }
  try {
    return parseServerEnv(env).ANTHROPIC_API_KEY ?? null;
  } catch {
    return null;
  }
}
