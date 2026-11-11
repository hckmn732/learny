import { describe, expect, it } from 'vitest';

import { isForbiddenSecretFile, maskSecret, scanText, SECRET_PATTERNS } from './secret-patterns';

// Fake keys are assembled at runtime so that this file never contains a secret-like literal.
const fake = (...parts: string[]) => parts.join('');

const POSITIVE: Record<string, string> = {
  'anthropic-key': fake('sk-ant-', 'api03-', 'A'.repeat(30)),
  'openai-key': fake('sk-', 'proj-', 'B'.repeat(40)),
  'stripe-key': fake('sk_', 'live_', 'C'.repeat(24)),
  'stripe-webhook': fake('whsec_', 'D'.repeat(24)),
  'aws-access-key': fake('AKIA', 'E'.repeat(16)),
  'private-key': fake('-----BEGIN ', 'RSA PRIVATE KEY-----'),
  jwt: fake('eyJ', 'F'.repeat(12), '.eyJ', 'G'.repeat(12), '.', 'H'.repeat(12)),
  'resend-key': fake('re_', 'I'.repeat(8), '_', 'J'.repeat(16)),
  'voyage-key': fake('pa-', 'K'.repeat(32)),
  'tavily-key': fake('tvly-', 'L'.repeat(24)),
  'sentry-token': fake('sntry', 's_', 'M'.repeat(24)),
  'vercel-token': fake('VERCEL_', 'TOKEN=', 'N'.repeat(24)),
  'generic-assignment': fake('api_key = "', 'O'.repeat(20), '"'),
};

const NEGATIVE: Record<string, string> = {
  'anthropic-key': 'sk-ant-short',
  'openai-key': 'sk-short-value',
  'stripe-key': 'sk_live_short',
  'stripe-webhook': 'whsec_short',
  'aws-access-key': 'AKIA-lowercase',
  'private-key': '-----BEGIN PUBLIC KEY-----',
  jwt: 'eyJhbGciOi.short',
  'resend-key': 're_short',
  'voyage-key': 'pa-short',
  'tavily-key': 'tvly-short',
  'sentry-token': 'sntrys_short',
  'vercel-token': 'VERCEL_TOKEN=',
  'generic-assignment': 'api_key = process.env.API_KEY',
};

describe('[SPEC-002] secret patterns', () => {
  it('covers every pattern with test values', () => {
    expect(Object.keys(POSITIVE).sort()).toEqual(SECRET_PATTERNS.map((p) => p.id).sort());
  });

  it.each(SECRET_PATTERNS.map((p) => p.id))('detects %s', (id) => {
    const findings = scanText(`value ${POSITIVE[id] ?? ''}`, 'f.ts');
    expect(findings.map((f) => f.rule)).toContain(id);
  });

  it.each(SECRET_PATTERNS.map((p) => p.id))('does not flag a harmless %s look-alike', (id) => {
    const findings = scanText(NEGATIVE[id] ?? '', 'f.ts');
    expect(findings.map((f) => f.rule)).not.toContain(id);
  });

  it('reports one finding per secret when patterns overlap', () => {
    const key = fake('sk-ant-', 'api03-', 'A'.repeat(30));
    expect(scanText(`ANTHROPIC_API_KEY=${key}`, 'f').map((f) => f.rule)).toEqual(['anthropic-key']);
  });

  it('ignores lines holding the learny-test-only marker', () => {
    expect(scanText('sk-ant-learny-test-only-0000000000000000', 'f.ts')).toEqual([]);
  });

  it('reports the line and a masked preview', () => {
    const key = fake('sk-ant-', 'api03-', 'A'.repeat(30));
    const [finding] = scanText(`first\nANTHROPIC_API_KEY=${key}`, 'saisie');
    expect(finding).toEqual({ file: 'saisie', line: 2, rule: 'anthropic-key', preview: 'sk-a…' });
    expect(maskSecret('abcdef')).toBe('abcd…');
  });

  it.each(['.env', '.env.local', 'apps/web/.env.production', 'key.pem', 'cert.p12', 'id.key'])(
    'forbids the file %s',
    (path) => {
      expect(isForbiddenSecretFile(path)).toBe(true);
    },
  );

  it.each(['.env.example', 'env.ts', 'apps/web/lib/env.ts', 'keys.md'])(
    'allows the file %s',
    (path) => {
      expect(isForbiddenSecretFile(path)).toBe(false);
    },
  );
});
