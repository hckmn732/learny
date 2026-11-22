// Types of agent-client.mjs for TypeScript consumers (Vitest unit tests, ADR-3015 § 1).
export interface AgentArtifact {
  flow?: string | null;
  kind?: 'screenshot' | 'video';
  path?: string;
  name: string;
  base64?: string;
}

export interface AgentJob {
  jobId: string;
  status: string;
  progress?: string | null;
  exitCode?: number | null;
  junit?: string;
  artifacts?: AgentArtifact[];
  stdout?: string;
  stderr?: string;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface AgentClientOptions {
  baseUrl: string;
  token?: string | null;
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
  pollIntervalMs?: number;
  jobTimeoutMs?: number;
  now?: () => number;
  delay?: (ms: number) => Promise<void>;
  log?: (event: unknown) => void;
}

export interface WaitForJobOptions {
  onPoll?: (event: unknown) => void;
  artifacts?: boolean;
}

export interface AgentClient {
  requestTimeoutMs: number;
  pollIntervalMs: number;
  jobTimeoutMs: number;
  health(): Promise<Record<string, unknown>>;
  device(): Promise<Record<string, unknown>>;
  install(apkUrl: string | null): Promise<Record<string, unknown>>;
  freeze(): Promise<Record<string, unknown>>;
  submitMaestro(body: unknown): Promise<string>;
  job(jobId: string, options?: { artifacts?: boolean }): Promise<AgentJob>;
  cancel(jobId: string): Promise<Record<string, unknown>>;
  waitForJob(jobId: string, options?: WaitForJobOptions): Promise<AgentJob>;
  runMaestro(body: unknown, options?: WaitForJobOptions): Promise<AgentJob>;
}

export const TERMINAL_STATUSES: Set<string>;
export const DEFAULT_REQUEST_TIMEOUT_MS: number;
export const DEFAULT_JOB_TIMEOUT_MS: number;
export const DEFAULT_POLL_INTERVAL_MS: number;

export class AgentError extends Error {
  route?: string;
  method?: string;
  status?: number;
  jobId?: string;
}
export class AgentTimeoutError extends AgentError {}
export class AgentProtocolError extends AgentError {}

export function createAgentClient(options: AgentClientOptions): AgentClient;
