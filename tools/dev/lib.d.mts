// Types of the local stack helpers (lib.mjs) for TypeScript consumers.
import type { SpawnSyncReturns } from 'node:child_process';

export const ROOT: string;
export const COMPOSE_FILE: string;
export const REQUIRED_EXTENSIONS: string[];
export const LOCAL_HOSTS: Set<string>;
export const STACK: {
  supabaseApi: number;
  postgres: number;
  inngest: number;
  mailpitSmtp: number;
  mailpitUi: number;
  web: number;
};
export function serviceUrls(env?: NodeJS.ProcessEnv): {
  supabase: string;
  postgres: string;
  inngest: string;
  mailpit: string;
  web: string;
};
export function loadEnvFiles(files?: string[]): void;
export function databaseResetGuard(env?: NodeJS.ProcessEnv): { ok: boolean; reason: string };
export function parsePort(value: string | undefined, fallback: number): number;
export function hasCommand(command: string, args?: string[]): string | null;
export function commandExists(command: string): boolean;
export function run(command: string, args: string[], options?: Record<string, unknown>): number;
export function runQuiet(
  command: string,
  args: string[],
  options?: Record<string, unknown>,
): SpawnSyncReturns<string>;
export function waitForHttp(
  url: string,
  options?: { timeoutMs?: number; intervalMs?: number },
): Promise<Response>;
export function dockerDiagnostic(): string | null;
export function supabaseDiagnostic(): string | null;
