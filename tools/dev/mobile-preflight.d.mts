// Types of mobile-preflight.mjs for TypeScript consumers (Vitest unit tests, ADR-3015 § 5).
export interface PublishedPort {
  label: string;
  port: number;
  key: string;
  suffix: string;
  /** Chemin sondé sur le port (ex. `/api/v1/health`) ; vide pour l'APK. */
  path: string;
  instance: 'dev' | 'phone';
}

export interface EnvCheck {
  missing: string[];
  problems: string[];
  ok: boolean;
}

export type PortKind = 'ok' | 'down' | 'stale' | 'unauthorized';

export interface DiskVerdict {
  freeGb: number;
  minGb: number;
  ok: boolean;
}

export interface AgentVerdict {
  ok: boolean;
  detail: string;
  busy?: boolean;
  jobId?: string | null;
  version?: string | null;
}

export interface RepublishCapability {
  key: string | null;
  devInstance: string | null;
  phoneInstance: string | null;
  ok: boolean;
}

export const API_ROOT: string;
export const SANDBOX_ROOT: string;
export const REQUIRED_KEYS: string[];
export const PUBLISHED_PORTS: PublishedPort[];

export function parseEnvFile(content: string): Record<string, string>;
export function rewriteEnvFile(content: string, updates: Record<string, string>): string;
export function checkEnv(env: Record<string, string>): EnvCheck;
export function classifyPortResponse(status: number): PortKind;
export function diskVerdict(freeBytes: number, minGb: number): DiskVerdict;
export function agentVerdict(health: Record<string, unknown> | null): AgentVerdict;
export function republishCapability(
  env: Record<string, string>,
  readKey: () => string,
): RepublishCapability;
