// Types of the deployment workflow checker (tools/deploy/workflow.mjs).
export interface DeployStep {
  name?: string;
  id?: string;
  uses?: string;
  run?: string;
  if?: string;
  env?: Record<string, unknown>;
  with?: Record<string, unknown>;
  'continue-on-error'?: boolean;
}

export interface DeployJob {
  name?: string;
  if?: string;
  environment?: string | { name?: string; url?: string };
  env?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  permissions?: Record<string, string>;
  steps?: DeployStep[];
}

export interface DeployWorkflowDoc {
  name?: string;
  on?: Record<string, unknown>;
  permissions?: Record<string, string>;
  env?: Record<string, unknown>;
  jobs?: Record<string, DeployJob>;
}

export interface ReadDeployWorkflowResult {
  raw: string | null;
  doc: DeployWorkflowDoc | null;
  error: string | null;
}

export interface WorkflowValidation {
  errors: string[];
  warnings: string[];
}

export const DEPLOY_JOBS: readonly string[];
export const DEPLOY_SCRIPTS: readonly string[];
export const DEPLOY_JOB_STEPS: Readonly<Record<string, string>>;

export function readDeployWorkflow(root: string): ReadDeployWorkflowResult;
export function validateDeployWorkflow(doc: DeployWorkflowDoc | null): WorkflowValidation;
export function environmentName(job: DeployJob | undefined): string;
