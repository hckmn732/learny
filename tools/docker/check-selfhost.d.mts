export const ROOT: string;
export const COMPOSE_FILE: string;
export const GUIDE_FILE: string;
export const DOCKERIGNORE_FILE: string;
export const STATUS_FILE: string;
export const REQUIRED_SERVICES: string[];
export const HEALTHCHECKED_SERVICES: string[];
export const EXPECTED_VOLUMES: Record<string, string>;
export const PUBLISHED_SERVICES: string[];
export const SECRET_BUILD_ARG_NAMES: string[];

export interface ComposeService {
  image?: string;
  build?: { dockerfile?: string; args?: Record<string, string> };
  user?: string;
  ports?: unknown[];
  healthcheck?: { test?: unknown[]; disable?: boolean };
  depends_on?: Record<string, { condition?: string }>;
  restart?: string;
  profiles?: string[];
  networks?: string[];
  environment?: Record<string, string>;
  volumes?: unknown[];
  privileged?: boolean;
  network_mode?: string;
}

export interface ComposeDocument {
  name?: string;
  services: Record<string, ComposeService>;
  volumes?: Record<string, { name?: string } | null>;
  networks?: Record<string, { internal?: boolean }>;
}

export interface ComposePsService {
  Service?: string;
  Name?: string;
  State?: string;
  Health?: string;
  ExitCode?: number;
  Image?: string;
}

export interface Probe {
  name: string;
  target: string;
  ok: boolean;
  detail: string;
}

export interface ImageInfo {
  labels: Record<string, string>;
  user: string;
  image: string;
}

export interface SelfhostStatus {
  generatedAt: string;
  project: string;
  source: string;
  docker: boolean;
  services: { name: string; state: string; health: string; image: string }[];
  servicesError?: string | null;
  images: { name: string; tag: string; version: string; commit: string; user: string }[];
  health: Probe[];
  volumes: string[];
}

export type ComposeConfigResult =
  | { ok: true; config: ComposeDocument }
  | { ok: false; error: string };

export function readFile(relative: string): string;
export function parseComposeYaml(text: string): ComposeDocument;
export function requiredVariables(text: string): string[];
export function parseEnvFile(text: string): Record<string, string>;
export function missingRequiredVariables(
  text: string,
  env: Record<string, string | undefined>,
): string[];
export function validateComposeDocument(doc: ComposeDocument, text: string): string[];
export function validateResolvedConfig(config: ComposeDocument): string[];
export function validateDockerfile(text: string): string[];
export function validateDockerignore(text: string): string[];
export function validateGuide(text: string): string[];
export function redact(text: string, env: Record<string, string | undefined>): string;
export function dockerAvailable(): boolean;
export function composeCommand(project: string, envFile: string, args: string[]): string[];
export function loadEnvFile(file: string): { path: string; vars: Record<string, string> };
export function composeConfig(
  envFile: string,
  env?: Record<string, string | undefined>,
): ComposeConfigResult;
export function composeUp(
  project: string,
  envFile: string,
  env: Record<string, string | undefined>,
  options?: { build?: boolean },
): boolean;
export function composeDown(
  project: string,
  envFile: string,
  env: Record<string, string | undefined>,
): boolean;
export function composePs(
  project: string,
  envFile: string,
  env: Record<string, string | undefined>,
): { ok: boolean; services: ComposePsService[]; error?: string };
export function stackReady(services: ComposePsService[]): boolean;
export function waitForStack(
  project: string,
  envFile: string,
  env: Record<string, string | undefined>,
  timeoutMs?: number,
): Promise<{ ok: boolean; services: ComposePsService[] }>;
export function imageLabels(
  image?: string,
): { labels: Record<string, string>; user: string; id: string } | null;
export function serviceImageInfo(
  project: string,
  envFile: string,
  env: Record<string, string | undefined>,
  service: string,
): ImageInfo | null;
export function projectVolumes(project: string): string[];
export function buildImage(
  tag: string,
  dockerfile: string,
  buildArgs: Record<string, string>,
  env?: Record<string, string | undefined>,
): boolean;
export function probeStack(
  project: string,
  envFile: string,
  env: Record<string, string | undefined>,
  webPort: string,
): Promise<Probe[]>;
export function collectStatus(options: {
  project: string;
  envFile: string;
  env: Record<string, string | undefined>;
  webPort: string;
}): Promise<SelfhostStatus>;
export function writeStatus(status: SelfhostStatus): void;
