// SPEC-805 CA-1 — nonce, directives, environment sources and unknown-source rejection.
import { describe, expect, it } from 'vitest';

import {
  buildContentSecurityPolicy,
  createCspNonce,
  cspSources,
  isValidCspNonce,
  normalizeCspOrigin,
} from './csp';
import {
  HSTS_VALUE,
  PERMISSIONS_POLICY_VALUE,
  REFERRER_POLICY_VALUE,
  securityHeaders,
  staticSecurityHeaders,
} from './headers';

function directive(policy: string, name: string): string {
  const found = policy
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `));
  return found ?? '';
}

describe('[SPEC-805] CSP', () => {
  it('CA-1 — deux nonces consécutifs sont distincts, aléatoires et valides', () => {
    const first = createCspNonce();
    const second = createCspNonce();
    expect(first).not.toBe(second);
    expect(first).toHaveLength(24);
    expect(isValidCspNonce(first)).toBe(true);
    expect(isValidCspNonce(second)).toBe(true);
    expect(isValidCspNonce("'; script-src https://evil.test")).toBe(false);
  });

  it('CA-1 — la politique porte le nonce, refuse unsafe-eval et unsafe-inline', () => {
    const nonce = createCspNonce();
    const policy = buildContentSecurityPolicy(nonce, { production: true });
    expect(directive(policy, 'script-src')).toContain(`'nonce-${nonce}'`);
    expect(directive(policy, 'script-src')).toContain("'strict-dynamic'");
    expect(directive(policy, 'style-src')).toContain(`'nonce-${nonce}'`);
    expect(policy).not.toContain('unsafe-eval');
    expect(policy).not.toContain('unsafe-inline');
    expect(directive(policy, 'object-src')).toBe("object-src 'none'");
    expect(directive(policy, 'base-uri')).toBe("base-uri 'self'");
    expect(directive(policy, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(policy).toContain('upgrade-insecure-requests');
  });

  it('CA-1 — un nonce forgé est refusé avant toute construction', () => {
    expect(() => buildContentSecurityPolicy("x'; script-src *")).toThrow('Nonce CSP invalide');
  });

  it('ET-1 — connect-src, img-src et frame-src suivent les intégrations réelles', () => {
    const nonce = createCspNonce();
    const policy = buildContentSecurityPolicy(nonce, {
      supabaseUrl: 'https://project.supabase.co',
      sentryDsn: 'https://public@o42.ingest.sentry.io/42',
    });
    expect(directive(policy, 'connect-src')).toContain('https://project.supabase.co');
    expect(directive(policy, 'connect-src')).toContain('wss://project.supabase.co');
    expect(directive(policy, 'connect-src')).toContain('https://o42.ingest.sentry.io');
    expect(directive(policy, 'img-src')).toContain('https://project.supabase.co');
    expect(directive(policy, 'img-src')).toContain('data:');
    expect(directive(policy, 'frame-src')).toBe("frame-src 'self'");
  });

  it('ET-1 — une source inconnue ou dangereuse est ignorée', () => {
    expect(normalizeCspOrigin('javascript:alert(1)')).toBeNull();
    expect(normalizeCspOrigin('data:text/html,<script>')).toBeNull();
    expect(normalizeCspOrigin('https://user:pass@example.test')).toBeNull();
    expect(normalizeCspOrigin('not a url')).toBeNull();
    expect(normalizeCspOrigin('https://example.test/path')).toBe('https://example.test');
    const sources = cspSources({
      supabaseUrl: 'javascript:alert(1)',
      sentryDsn: 'ftp://sentry.test',
    });
    expect(sources.connect).toEqual(["'self'"]);
  });

  it('EF-2 — HSTS seulement en production et sur HTTPS, avec les autres en-têtes', () => {
    const nonce = createCspNonce();
    const local = securityHeaders({ nonce, production: false, https: false });
    expect(local['strict-transport-security']).toBeUndefined();
    expect(local['x-content-type-options']).toBe('nosniff');
    expect(local['referrer-policy']).toBe(REFERRER_POLICY_VALUE);
    expect(local['permissions-policy']).toBe(PERMISSIONS_POLICY_VALUE);
    expect(local['permissions-policy']).toContain('camera=()');
    expect(local['permissions-policy']).toContain('geolocation=()');
    expect(local['content-security-policy']).toContain(`'nonce-${nonce}'`);

    const localBehindProxy = securityHeaders({ nonce, production: true, https: false });
    expect(localBehindProxy['strict-transport-security']).toBeUndefined();

    const production = securityHeaders({ nonce, production: true, https: true });
    expect(production['strict-transport-security']).toBe(HSTS_VALUE);
    expect(production['content-security-policy']).toContain('upgrade-insecure-requests');

    expect(staticSecurityHeaders(false)['strict-transport-security']).toBeUndefined();
  });
});
