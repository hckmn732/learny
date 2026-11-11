// Shared helpers of the managed deployment tools (SPEC-013, BR-PLA-04).
// Every reader is deterministic and never loads `.env` files: callers inject the environment so
// tests do not depend on the developer machine (EF-8, ET-2).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const VERCEL_CONFIG = 'vercel.json';
export const DEPLOY_WORKFLOW = '.github/workflows/deploy.yml';
export const DEPLOY_ENVS = ['preview', 'production'];
export const DEPLOY_COMPONENTS = ['web', 'base', 'jobs', 'ai'];

/** Distinct exit codes (ET-6): invalid configuration is not an unavailable service. */
export const EXIT = Object.freeze({ ok: 0, config: 2, external: 3 });

/** Label shown when a provider destination has not been verified (SPEC-013 §10). */
export const UNCONFIGURED = 'Non configuré';

export const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', '0.0.0.0']);

/** API keys required by a preview. The production list is read from packages/config (ET-2). */
export const PREVIEW_REQUIRED_KEYS = Object.freeze([
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'APP_ENCRYPTION_KEY',
  'INNGEST_EVENT_KEY',
  'INNGEST_SIGNING_KEY',
  'ANTHROPIC_API_KEY',
  'RESEND_API_KEY',
  'RATE_LIMIT_IP_SECRET',
  'EMAIL_LINK_SECRET',
]);

const HEADERS = Object.freeze({
  nosniff: 'X-Content-Type-Options',
  referrer: 'Referrer-Policy',
  frame: 'X-Frame-Options',
  hsts: 'Strict-Transport-Security',
  permissions: 'Permissions-Policy',
});

/** Security headers required on every response (EF-1, BR-PLA-08). No CSP until SPEC-805. */
export const REQUIRED_SECURITY_HEADERS = Object.freeze(Object.values(HEADERS));

export function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** Extracts `HOSTING_REGIONS` from its single TypeScript declaration (ET-2). */
export function parseHostingRegions(source) {
  const block = /export const HOSTING_REGIONS\s*=\s*\{([\s\S]*?)\}\s*as const/.exec(source);
  if (block === null) return null;
  const regions = {};
  for (const match of block[1].matchAll(/([A-Za-z][A-Za-z0-9_]*)\s*:\s*'([^']+)'/g)) {
    regions[match[1]] = match[2];
  }
  return Object.keys(regions).length === 0 ? null : regions;
}

/** Extracts a `readonly string[]` declaration such as `EU_REGIONS`. */
export function parseStringArray(source, name) {
  const block = new RegExp(`export const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as const`).exec(
    source,
  );
  if (block === null) return null;
  const values = [...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  return values.length === 0 ? null : values;
}

/**
 * Reads the managed regions, the EU allow-list and the production requirements from
 * `packages/config`, the single source validated by SPEC-009.
 */
export function readManagedConfig(root = ROOT) {
  const platform = readText(path.join(root, 'packages/config/src/platform.ts'));
  if (platform === null) throw new Error('packages/config/src/platform.ts est absent.');
  const regions = parseHostingRegions(platform);
  const euRegions = parseStringArray(platform, 'EU_REGIONS');
  if (regions === null || euRegions === null) {
    throw new Error(
      'HOSTING_REGIONS ou EU_REGIONS est illisible dans packages/config/src/platform.ts.',
    );
  }
  const envSource = readText(path.join(root, 'packages/config/src/env.ts'));
  if (envSource === null) throw new Error('packages/config/src/env.ts est absent.');
  const productionRequiredKeys = parseStringArray(envSource, 'PRODUCTION_REQUIRED_KEYS');
  if (productionRequiredKeys === null) {
    throw new Error('PRODUCTION_REQUIRED_KEYS est illisible dans packages/config/src/env.ts.');
  }
  return { regions, euRegions, productionRequiredKeys };
}

export function readVercelConfig(root = ROOT) {
  const file = path.join(root, VERCEL_CONFIG);
  const raw = readText(file);
  if (raw === null) return { config: null, raw, error: `${VERCEL_CONFIG} est absent.` };
  try {
    return { config: JSON.parse(raw), raw, error: null };
  } catch (error) {
    return { config: null, raw, error: `${VERCEL_CONFIG} : JSON invalide — ${error.message}` };
  }
}

export function isEuRegion(region, euRegions) {
  return typeof region === 'string' && euRegions.includes(region);
}

/** A destination is never printed in full: only its provider suffix is kept. */
export function maskDestination(value) {
  if (value === undefined || value === null || value === '') return UNCONFIGURED;
  try {
    const url = new URL(String(value));
    const suffix = url.hostname.includes('.') ? url.hostname.slice(url.hostname.indexOf('.')) : '';
    return `${url.protocol}//***${suffix}`;
  } catch {
    return '***';
  }
}

export function isLocalUrl(value) {
  if (value === undefined || value === null || value === '') return false;
  try {
    const url = new URL(String(value));
    return LOCAL_HOSTS.has(url.hostname) || url.hostname.endsWith('.local');
  } catch {
    return false;
  }
}

/** Removes secret values from a command output before it reaches a log or a report. */
export function redact(text, secrets = []) {
  let out = String(text ?? '');
  for (const secret of [...secrets].filter((value) => typeof value === 'string' && value !== '')) {
    out = out.split(secret).join('***');
  }
  return out;
}

export function missingKeys(keys, env) {
  return keys.filter((key) => {
    const value = env[key];
    return value === undefined || value === null || String(value).trim() === '';
  });
}

export function argValue(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? (argv[index + 1] ?? '') : undefined;
}

export function hasFlag(argv, name) {
  return argv.includes(name);
}

export function headerValue(config, source, key) {
  const headers = Array.isArray(config?.headers) ? config.headers : [];
  for (const entry of headers) {
    if (entry?.source !== source) continue;
    const found = (entry.headers ?? []).find(
      (header) => String(header?.key ?? '').toLowerCase() === key.toLowerCase(),
    );
    if (found !== undefined) return String(found.value ?? '');
  }
  return null;
}

export { HEADERS };
