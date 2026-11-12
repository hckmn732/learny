export interface MigrationEntry {
  name: string;
  content: string;
}

export interface MigrationWrite extends MigrationEntry {
  reason: 'missing' | 'changed';
}

export interface MigrationPlan {
  writes: MigrationWrite[];
  deletes: string[];
  unchanged: string[];
}

export const MIGRATION_PREFIX: string;
export const SOURCE_NAME: RegExp;
export const TARGET_NAME: RegExp;

export function normalizeSql(content: string): string;
export function planSync(sourceFiles: MigrationEntry[], targetFiles: MigrationEntry[]): MigrationPlan;
export function applyPlan(targetDir: string, plan: MigrationPlan): { written: number; deleted: number };
export function planDirectories(sourceDir: string, targetDir: string): MigrationPlan;
export function syncMigrations(
  sourceDir: string,
  targetDir: string,
): { plan: MigrationPlan; written: number; deleted: number };
export function checkMigrations(
  sourceDir: string,
  targetDir: string,
): { ok: true; checked: number };
export function sha256(content: string): string;
export function migrationDirectories(scriptDir: string): { source: string; target: string };

export class MigrationCheckError extends Error {
  readonly errors: string[];
}
