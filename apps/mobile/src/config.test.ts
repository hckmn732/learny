// Unit tests of the configuration (SPEC-3001 ET-5, CL-2, CA-2).
import { describe, expect, it } from 'vitest';

import {
  formatConfigError,
  parseConfig,
  PUBLIC_ENV_KEYS,
  publicEnvSchema,
  type PublicEnv,
} from './config';

// A harmless placeholder value: the tests assert that it never reaches a message or a log.
const ANON_KEY_PLACEHOLDER = 'anon-key-placeholder-for-tests';

const validEnv: PublicEnv = {
  EXPO_PUBLIC_API_URL: 'http://10.0.2.2:3001',
  EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY_PLACEHOLDER,
  EXPO_PUBLIC_WEB_URL: 'http://127.0.0.1:3100',
  EXPO_PUBLIC_ENABLE_SDD_PAGES: '1',
  EXPO_PUBLIC_CLOCK_FIXED_AT: '2026-11-11T12:20:00Z',
};

function env(patch: Partial<Record<keyof PublicEnv, string | undefined>>): PublicEnv {
  return { ...validEnv, ...patch };
}

describe('[SPEC-3001] configuration publique', () => {
  it('accepte une configuration complète et normalise les URL', () => {
    const result = parseConfig(env({ EXPO_PUBLIC_API_URL: 'http://10.0.2.2:3001/' }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config).toEqual({
      apiUrl: 'http://10.0.2.2:3001',
      supabaseUrl: 'http://127.0.0.1:54321',
      supabaseAnonKey: ANON_KEY_PLACEHOLDER,
      webUrl: 'http://127.0.0.1:3100',
      enableSddPages: true,
      clockFixedAt: '2026-11-11T12:20:00Z',
    });
  });

  it('liste les clés manquantes (CL-2)', () => {
    const result = parseConfig(env({ EXPO_PUBLIC_API_URL: undefined, EXPO_PUBLIC_WEB_URL: '' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missing).toEqual(['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_WEB_URL']);
  });

  it('traite la variable optionnelle de l’horloge comme facultative', () => {
    const result = parseConfig(env({ EXPO_PUBLIC_CLOCK_FIXED_AT: undefined }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.clockFixedAt).toBeNull();
  });

  it('refuse une URL qui n’en est pas une, sans citer la valeur fautive', () => {
    const result = parseConfig(env({ EXPO_PUBLIC_API_URL: 'pas-une-url' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.invalid.map((issue) => issue.key)).toContain('EXPO_PUBLIC_API_URL');
    expect(formatConfigError(result)).not.toContain('pas-une-url');
  });

  it('refuse une valeur de commutateur hors 0/1', () => {
    const result = parseConfig(env({ EXPO_PUBLIC_ENABLE_SDD_PAGES: 'true' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.invalid.map((issue) => issue.key)).toContain('EXPO_PUBLIC_ENABLE_SDD_PAGES');
  });

  it('refuse un instant d’horloge invalide', () => {
    const result = parseConfig(env({ EXPO_PUBLIC_CLOCK_FIXED_AT: 'hier' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.invalid.map((issue) => issue.key)).toContain('EXPO_PUBLIC_CLOCK_FIXED_AT');
  });

  it('ne recopie jamais une valeur secrète dans le message d’erreur (CL-2)', () => {
    const result = parseConfig(
      env({
        EXPO_PUBLIC_SUPABASE_ANON_KEY: undefined,
        EXPO_PUBLIC_API_URL: 'valeur-fautive-secrete',
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const message = formatConfigError(result);
    expect(message).toContain('EXPO_PUBLIC_SUPABASE_ANON_KEY');
    expect(message).toContain('EXPO_PUBLIC_API_URL');
    expect(message).not.toContain('valeur-fautive-secrete');
    expect(message).not.toContain(ANON_KEY_PLACEHOLDER);
  });

  it('expose exactement les six clés publiques attendues (ET-5)', () => {
    expect([...PUBLIC_ENV_KEYS]).toEqual([
      'EXPO_PUBLIC_API_URL',
      'EXPO_PUBLIC_SUPABASE_URL',
      'EXPO_PUBLIC_SUPABASE_ANON_KEY',
      'EXPO_PUBLIC_WEB_URL',
      'EXPO_PUBLIC_ENABLE_SDD_PAGES',
      'EXPO_PUBLIC_CLOCK_FIXED_AT',
    ]);
    // The schema and the key list cannot drift apart.
    expect(Object.keys(publicEnvSchema.shape)).toEqual([...PUBLIC_ENV_KEYS]);
  });

  it('n’accepte aucun schéma non http(s)', () => {
    const result = parseConfig(env({ EXPO_PUBLIC_WEB_URL: 'ftp://example.test' }));

    expect(result.ok).toBe(false);
  });
});
