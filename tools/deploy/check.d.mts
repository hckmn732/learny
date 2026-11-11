// Types of the deployment check (tools/deploy/check.mjs) for TypeScript consumers.
export interface DeployRegions {
  vercel: string;
  supabase: string;
  inngest: string;
}

export interface DeployAction {
  id: string;
  label: string;
  destination: string;
  note?: string;
}

export interface DeployReport {
  dryRun: boolean;
  envName: string | null;
  environment: string | null;
  commit: string | null;
  checkedAt: string | null;
  workflow?: string;
  status: 'ok' | 'invalid';
  regions: DeployRegions | null;
  actions: DeployAction[];
  warnings: string[];
  errors: string[];
  destinations: { web: string; database: string; jobs: string };
}

export interface DeployResult {
  ok: boolean;
  code: number;
  report: DeployReport;
}

export interface RunCheckOptions {
  root?: string;
  env?: Record<string, string | undefined>;
  dryRun?: boolean;
  envName?: string;
  ref?: string;
  branch?: string;
  event?: string;
}

export interface Validation {
  errors: string[];
  warnings: string[];
}

export function runCheck(options?: RunCheckOptions): DeployResult;
export function validateDeployment(input: Record<string, unknown>): Validation;
export function validateRef(input: {
  envName: string;
  ref?: string;
  branch?: string;
  event?: string;
  dryRun?: boolean;
}): Validation;
export function buildPlan(input: {
  envName: string;
  env: Record<string, string | undefined>;
}): DeployAction[];
export function formatReport(result: DeployResult): string;
