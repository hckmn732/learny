// Demonstration data of SPEC-805: the security controls read from the latest validation report.
//
// The page never runs an attack and never displays a secret, a payload or a victim identifier.
// Without `test-results/sdd/SPEC-805/checks.json`, every control is explicitly « Non exécuté ».
import fs from 'node:fs';
import path from 'node:path';

export type SecurityStatus = 'verified' | 'failed' | 'not_run';

export interface SecurityRow {
  label: string;
  test: string;
  status: SecurityStatus;
}

export interface SecurityCategory {
  key: 'headers' | 'api' | 'rls' | 'ai' | 'ssrf' | 'dependencies';
  title: string;
  rows: SecurityRow[];
}

interface CheckResult {
  status?: string;
}

type Checks = Record<string, CheckResult>;

const AUDIT_FILE = path.join('evidence', 'SPEC-805', 'audit.json');

function candidatePaths(cwd: string, relative: string): string[] {
  return [path.resolve(cwd, relative), path.resolve(cwd, '..', '..', relative)];
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

function findFile(cwd: string, relative: string): string | null {
  for (const candidate of candidatePaths(cwd, relative)) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function loadChecks(cwd: string): Checks | null {
  const file = findFile(cwd, path.join('test-results', 'sdd', 'SPEC-805', 'checks.json'));
  const parsed = file === null ? null : readJson(file);
  return typeof parsed === 'object' && parsed !== null ? (parsed as Checks) : null;
}

function stepStatus(checks: Checks | null, keys: readonly string[]): SecurityStatus {
  if (checks === null) return 'not_run';
  const statuses = keys.map((key) => checks[key]?.status).filter((value) => value !== undefined);
  if (statuses.length !== keys.length) return 'not_run';
  if (statuses.some((status) => status !== 'passed')) return 'failed';
  return 'verified';
}

function auditStatus(cwd: string): SecurityStatus {
  const file = findFile(cwd, AUDIT_FILE);
  const report = file === null ? null : readJson(file);
  if (typeof report !== 'object' || report === null) return 'not_run';
  const metadata = report as {
    executed?: unknown;
    high?: unknown;
    critical?: unknown;
  };
  if (metadata.executed !== true) return 'not_run';
  return metadata.high === 0 && metadata.critical === 0 ? 'verified' : 'failed';
}

export function loadSpec805Report(cwd: string = process.cwd()): SecurityCategory[] {
  const checks = loadChecks(cwd);
  return [
    {
      key: 'headers',
      title: 'En-têtes',
      rows: [
        {
          label: 'CSP à nonce par requête, sans unsafe-eval',
          test: 'csp.test.ts',
          status: stepStatus(checks, ['unit']),
        },
        {
          label: 'HSTS, nosniff, Referrer-Policy, Permissions-Policy',
          test: 'security-headers.test.ts',
          status: stepStatus(checks, ['integration']),
        },
        {
          label: 'Parcours légitime sous CSP',
          test: 'spec-805.spec.ts',
          status: stepStatus(checks, ['e2e']),
        },
      ],
    },
    {
      key: 'api',
      title: 'API',
      rows: [
        {
          label: 'Origine étrangère refusée avant le service',
          test: 'security-headers.test.ts',
          status: stepStatus(checks, ['integration']),
        },
        {
          label: 'Quota atteint : 429 et Retry-After',
          test: 'security-headers.test.ts',
          status: stepStatus(checks, ['integration']),
        },
        {
          label: 'Parcours protégé et absence d’effet',
          test: 'spec-805.spec.ts',
          status: stepStatus(checks, ['e2e']),
        },
      ],
    },
    {
      key: 'rls',
      title: 'Données',
      rows: [
        {
          label: 'Isolation de toutes les tables privées',
          test: 'rls-security.test.ts',
          status: stepStatus(checks, ['integration']),
        },
        {
          label: 'Fichiers et URL signées d’un autre compte',
          test: 'rls-security.test.ts',
          status: stepStatus(checks, ['integration']),
        },
      ],
    },
    {
      key: 'ai',
      title: 'IA',
      rows: [
        {
          label: 'Cinq tâches IA résistantes aux consignes injectées',
          test: 'prompt-injection.test.ts',
          status: stepStatus(checks, ['integration']),
        },
        {
          label: 'Aucun outil hors garde exécuté',
          test: 'prompt-injection.test.ts',
          status: stepStatus(checks, ['integration']),
        },
      ],
    },
    {
      key: 'ssrf',
      title: 'Import',
      rows: [
        {
          label: 'Schémas et adresses non publiques refusés',
          test: 'ssrf.test.ts',
          status: stepStatus(checks, ['integration']),
        },
        {
          label: 'Redirections et DNS rebindés bloqués',
          test: 'ssrf.test.ts',
          status: stepStatus(checks, ['integration']),
        },
      ],
    },
    {
      key: 'dependencies',
      title: 'Dépendances',
      rows: [
        {
          label: 'Aucune vulnérabilité haute ou critique non traitée',
          test: 'pnpm audit',
          status: auditStatus(cwd),
        },
        {
          label: 'Grille ASVS niveau 1 reliée à une preuve',
          test: 'asvs.test.ts',
          status: stepStatus(checks, ['unit']),
        },
      ],
    },
  ];
}
