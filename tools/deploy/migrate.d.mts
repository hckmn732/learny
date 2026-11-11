// Types of the remote migration tool (tools/deploy/migrate.mjs).
import type { Validation } from './check.mjs';

export const MIGRATIONS_DIR: string;

export interface LocalMigration {
  version: string;
  name: string;
  file: string;
  sha256: string;
}

export interface MigrateReport {
  dryRun: boolean;
  envName: string | null;
  mode: 'dry-run' | 'apply';
  commit: string | null;
  destination: string;
  backup: string;
  pending: string[];
  skipped: string[];
  applied: string[];
  failedMigration: string | null;
  status: 'ok' | 'invalid' | 'external' | 'failed';
  errors?: string[];
  warnings: string[];
  note?: string;
}

export interface MigrateResult {
  code: number;
  ok: boolean;
  report: MigrateReport;
}

export interface RunMigrateOptions {
  root?: string;
  env?: Record<string, string | undefined>;
  envName?: string;
  dryRun?: boolean;
  backup?: string;
  manifestPath?: string;
  runner?: (args: string[]) => { code: number; output: string; missing?: boolean };
  log?: (line: string) => void;
}

export function sha256(content: Buffer | string): string;
export function readLocalMigrations(root?: string): {
  migrations: LocalMigration[];
  errors: string[];
};
export function parseRemoteMigrations(output: string): string[];
export function planMigrations(input: {
  migrations: LocalMigration[];
  remoteVersions: readonly string[];
  manifest?: Record<string, string>;
}): { pending: LocalMigration[]; skipped: LocalMigration[]; errors: string[] };
export function validateMigrateConfig(input: {
  envName?: string;
  env: Record<string, string | undefined>;
  backup?: string;
  dryRun?: boolean;
}): Validation & { databaseUrl?: string };
export function runMigrate(options?: RunMigrateOptions): MigrateResult;
export function formatMigrateReport(result: MigrateResult): string;
