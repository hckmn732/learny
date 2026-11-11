// Read-only snapshot of the last local stack check for the SPEC-008 demo page.
import fs from 'node:fs';
import path from 'node:path';

import { findRepoRoot } from './sdd-status';

export const STACK_SERVICES = ['supabase', 'postgres', 'inngest', 'mailpit', 'web'] as const;
export const STACK_EXTENSIONS = ['vector', 'unaccent', 'pg_trgm', 'pgcrypto'] as const;

export interface StackServiceStatus {
  name: string;
  ok: boolean;
  detail: string;
}

export interface StackExtensionStatus {
  name: string;
  ok: boolean;
}

export interface StackSnapshot {
  demo: boolean;
  dockerUnavailable: boolean;
  services: StackServiceStatus[];
  extensions: StackExtensionStatus[];
}

interface CachedCheck {
  results?: { name: string; ok: boolean; detail: string }[];
  extensions?: { name: string; ok: boolean }[];
}

/** The page shows a labelled demonstration until `pnpm dev:check` published a real result. */
export function readStackStatus(root = findRepoRoot()): StackSnapshot {
  const simulated: StackSnapshot = {
    demo: true,
    dockerUnavailable: false,
    services: STACK_SERVICES.map((name) => ({ name, ok: true, detail: 'Démonstration' })),
    extensions: STACK_EXTENSIONS.map((name) => ({ name, ok: true })),
  };
  if (root === null || process.env.SDD_STACK_DEMO === 'true') return simulated;
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(root, '.sdd', 'tmp', 'dev-check.json'), 'utf8'),
    ) as CachedCheck;
    const services = (raw.results ?? []).map((result) => ({
      name: result.name,
      ok: result.ok,
      detail: result.detail,
    }));
    if (services.length === 0) return simulated;
    return {
      demo: false,
      dockerUnavailable: services.length === 1 && services[0]?.name === 'docker' && !services[0].ok,
      services,
      extensions: raw.extensions ?? simulated.extensions,
    };
  } catch {
    return simulated;
  }
}
