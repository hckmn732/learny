// Types of the workflow checker (check-workflows.mjs) for TypeScript consumers.
export const ROOT: string;
export const CI_WORKFLOW: string;
export const PR_TITLE_WORKFLOW: string;
export const DEPLOY_WORKFLOW: string;
export const REQUIRED_ENV: Readonly<Record<string, string>>;
export const REQUIRED_SCRIPTS: readonly string[];
export const REQUIRED_JOBS: readonly string[];
export const APP_JOBS: readonly string[];
export const REQUIRED_ARTIFACTS: readonly string[];
export const AUDIT_LEVELS: readonly string[];

export interface WorkflowStep {
  name?: string;
  id?: string;
  uses?: string;
  run?: string;
  if?: string;
  env?: Record<string, unknown>;
  with?: Record<string, unknown>;
  'continue-on-error'?: boolean;
}

export interface WorkflowJob {
  name?: string;
  needs?: string | string[];
  if?: string;
  outputs?: Record<string, string>;
  permissions?: Record<string, string>;
  steps?: WorkflowStep[];
}

export interface WorkflowDoc {
  name?: string;
  on?: Record<string, unknown>;
  permissions?: Record<string, string>;
  env?: Record<string, unknown>;
  jobs?: Record<string, WorkflowJob>;
}

export interface ReadWorkflowsResult {
  root: string;
  ci: WorkflowDoc | null;
  ciRaw: string | null;
  prTitle: WorkflowDoc | null;
  prTitleRaw: string | null;
  parseErrors: string[];
}

export interface Artifact {
  name: string;
  paths: string;
  retentionDays: number;
  always: boolean;
  ifNoFilesFound: string;
  job?: string;
}

export interface DescribedJob {
  id: string;
  name: string;
  needs: string[];
  condition: string;
  artifacts: Artifact[];
}

export interface DescribedCi {
  triggers: { push: string[]; pullRequest: boolean; workflowDispatch: boolean };
  permissions: Record<string, string>;
  env: Record<string, string>;
  jobs: DescribedJob[];
  artifacts: Artifact[];
  security: {
    gitleaks: boolean;
    builtinScanner: boolean;
    auditLevel: string | null;
    prTitle: { configured: boolean; trigger: string[]; commitlint: boolean };
  };
}

export interface ActionlintResult {
  available: boolean;
  code: number;
  output: string;
  version?: string;
  errors?: number;
}

export interface CheckReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
  workflows: ReadWorkflowsResult;
  actionlint: ActionlintResult;
  act: boolean;
}

export function readWorkflows(root?: string): ReadWorkflowsResult;
export function stepsOf(job: WorkflowJob | undefined): WorkflowStep[];
export function runsOf(job: WorkflowJob | undefined): string[];
export function artifactsOf(
  job: WorkflowJob | undefined,
  env?: Record<string, unknown>,
): Artifact[];
export function describeCi(workflows: ReadWorkflowsResult): DescribedCi;
export function validateWorkflows(args: {
  workflows: ReadWorkflowsResult;
  scripts: Record<string, string> | null;
  actionlint?: ActionlintResult;
  act?: boolean;
}): { errors: string[]; warnings: string[] };
export function commandExists(command: string, versionArg?: string): boolean;
export function runActionlint(root?: string): ActionlintResult;
export function checkRepository(
  root?: string,
  options?: { actionlint?: ActionlintResult; act?: boolean },
): CheckReport;
