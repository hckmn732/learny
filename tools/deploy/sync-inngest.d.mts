// Types of the Inngest synchronisation tool (tools/deploy/sync-inngest.mjs).
export interface SyncReport {
  dryRun: boolean;
  envName: string | null;
  mode: 'dry-run' | 'sync';
  commit: string | null;
  region: string;
  app: string;
  functions: string[];
  synced: boolean;
  inspected: boolean;
  status: 'ok' | 'invalid' | 'external' | 'failed';
  errors: string[];
  warnings: string[];
}

export interface SyncResult {
  code: number;
  ok: boolean;
  report: SyncReport;
}

export interface RunSyncOptions {
  root?: string;
  env?: Record<string, string | undefined>;
  envName?: string;
  dryRun?: boolean;
  appUrl?: string;
  region?: string;
  commit?: string;
  functions?: string[];
  fetchImpl?: typeof fetch;
}

export function readExpectedFunctions(root?: string): string[];
export function validateSyncConfig(input: {
  envName?: string;
  env: Record<string, string | undefined>;
  appUrl?: string;
  region?: string;
  expectedFunctions: string[];
  dryRun?: boolean;
}): { errors: string[]; warnings: string[] };
export function runSync(options?: RunSyncOptions): Promise<SyncResult>;
export function formatSyncReport(result: SyncResult): string;
