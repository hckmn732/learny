// Types of mobile-preflight.mjs for TypeScript consumers (Vitest unit tests, ADR-3018).
export interface EnvCheck {
  missing: string[];
  problems: string[];
  ok: boolean;
}

export interface DiskVerdict {
  freeGb: number;
  minGb: number;
  ok: boolean;
}

export interface AdbVerdict {
  ok: boolean;
  serial: string | null;
  offline: string | null;
  detail: string;
}

export interface BootVerdict {
  booted: boolean;
  value: string;
}

export type HttpKind = 'ok' | 'unauthorized' | 'down';

export const REQUIRED_KEYS: string[];
export const DEPRECATED_KEYS: string[];

export function parseEnvFile(content: string): Record<string, string>;
export function checkEnv(env: Record<string, string>): EnvCheck;
/** URL à sonder depuis l'hôte : `10.0.2.2` devient `127.0.0.1` ; `null` si ce n'est pas une URL. */
export function hostProbeUrl(value: string): string | null;
export function classifyHttp(status: number): HttpKind;
export function diskVerdict(freeBytes: number, minGb: number): DiskVerdict;
export function adbVerdict(output: string | null | undefined): AdbVerdict;
export function bootVerdict(output: string | null | undefined): BootVerdict;
