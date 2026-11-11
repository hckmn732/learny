// Types of the managed deployment helpers (tools/deploy/lib.mjs).
export const ROOT: string;
export const VERCEL_CONFIG: string;
export const DEPLOY_WORKFLOW: string;
export const DEPLOY_ENVS: readonly string[];
export const DEPLOY_COMPONENTS: readonly string[];
export const EXIT: Readonly<{ ok: number; config: number; external: number }>;
export const UNCONFIGURED: string;
export const LOCAL_HOSTS: ReadonlySet<string>;
export const PREVIEW_REQUIRED_KEYS: readonly string[];
export const REQUIRED_SECURITY_HEADERS: readonly string[];

export interface ManagedConfig {
  regions: { vercel: string; supabase: string; inngest: string };
  euRegions: string[];
  productionRequiredKeys: string[];
}

export interface VercelConfigResult {
  config: {
    regions?: unknown;
    headers?: Array<{ source?: string; headers?: Array<{ key?: string; value?: string }> }>;
    env?: unknown;
    build?: { env?: unknown };
  } | null;
  raw: string | null;
  error: string | null;
}

export function readText(file: string): string | null;
export function parseHostingRegions(source: string): Record<string, string> | null;
export function parseStringArray(source: string, name: string): string[] | null;
export function readManagedConfig(root?: string): ManagedConfig;
export function readVercelConfig(root?: string): VercelConfigResult;
export function isEuRegion(region: string, euRegions: readonly string[]): boolean;
export function maskDestination(value: string | undefined | null): string;
export function isLocalUrl(value: string | undefined | null): boolean;
export function redact(text: string, secrets?: readonly string[]): string;
export function missingKeys(keys: readonly string[], env: Record<string, string | undefined>): string[];
export function argValue(argv: readonly string[], name: string): string | undefined;
export function hasFlag(argv: readonly string[], name: string): boolean;
export function headerValue(
  config: VercelConfigResult['config'],
  source: string,
  key: string,
): string | null;
