#!/usr/bin/env node
/* global performance */
// Génère les secrets de la pile auto-hébergée (SPEC-012, EF-4, CA-3).
// Les valeurs ne sont écrites que sur la sortie standard : jamais dans un fichier du dépôt.
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

/** Injectable time source (ADR-0047): CLOCK_FIXED_AT wins, otherwise the monotonic origin. */
export function toolNow(env = process.env) {
  const fixed = env.CLOCK_FIXED_AT;
  if (fixed !== undefined && fixed !== '') {
    const parsed = new Date(fixed);
    if (Number.isNaN(parsed.getTime())) throw new Error(`CLOCK_FIXED_AT invalide : ${fixed}`);
    return parsed;
  }
  return new Date(performance.timeOrigin + performance.now());
}

const SUPABASE_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365 * 10;

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

/** Signs a Supabase-compatible HS256 JWT. Pure and deterministic for a given issue time. */
export function createJwt(secret, payload) {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

export function serviceKeys(jwtSecret, issuedAtSeconds) {
  const common = {
    iss: 'supabase',
    iat: issuedAtSeconds,
    exp: issuedAtSeconds + SUPABASE_TOKEN_TTL_SECONDS,
  };
  return {
    anon: createJwt(jwtSecret, { ...common, role: 'anon' }),
    service: createJwt(jwtSecret, { ...common, role: 'service_role' }),
  };
}

export function generateSecrets(now) {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const jwtSecret = crypto.randomBytes(32).toString('hex');
  const keys = serviceKeys(jwtSecret, issuedAt);
  return {
    POSTGRES_PASSWORD: crypto.randomBytes(24).toString('hex'),
    SUPABASE_JWT_SECRET: jwtSecret,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: keys.anon,
    SUPABASE_SERVICE_ROLE_KEY: keys.service,
    INNGEST_EVENT_KEY: crypto.randomBytes(24).toString('hex'),
    INNGEST_SIGNING_KEY: crypto.randomBytes(32).toString('hex'),
    APP_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
    RATE_LIMIT_IP_SECRET: crypto.randomBytes(32).toString('hex'),
    EMAIL_LINK_SECRET: crypto.randomBytes(32).toString('hex'),
  };
}

function main() {
  const secrets = generateSecrets(toolNow());
  const lines = Object.entries(secrets).map(([key, value]) => `${key}=${value}`);
  process.stdout.write(
    [
      '# Secrets générés par tools/docker/selfhost-secrets.mjs — ne pas versionner.',
      '# Copier ces lignes dans .env.selfhost puis compléter les URLs publiques et GIT_COMMIT.',
      ...lines,
      '',
    ].join('\n'),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
