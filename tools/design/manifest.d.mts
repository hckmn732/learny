// Types of the pure reference-manifest functions (manifest.mjs) for TypeScript consumers.
import type { Page } from '@playwright/test';

export interface Viewport {
  width: number;
  height: number;
}

export interface Scenario {
  screenId: string;
  state: string;
  source: string;
  setup: (page: Page) => Promise<void>;
  expect: (page: Page) => Promise<unknown>;
}

export interface ReferenceEntry {
  screenId: string;
  state: string;
  viewport: string;
  viewportWidth: number;
  viewportHeight: number;
  source: string;
  file: string;
  width: number;
  height: number;
  fixedAt: string;
  locale: string;
  timeZone: string;
  zoom: number;
  sha256: string;
}

export interface Manifest {
  version: number;
  generatedFor: string;
  rule: string;
  zoom: number;
  references: ReferenceEntry[];
}

export interface TokenEntry {
  screenId: string;
  source: string;
  selector: string;
  property: string;
  value: string;
}

export interface Tokens {
  version: number;
  rule: string;
  zoom: number;
  note: string;
  distinct: Record<string, string[]>;
  entries: TokenEntry[];
}

export const FIXED_AT: string;
export const LOCALE: string;
export const TIME_ZONE: string;
export const ZOOM: number;
export const SOURCES_DIR: string;
export const REFERENCES_DIR: string;
export const TOKEN_PROPERTIES: string[];
export const TOKEN_SELECTORS: string[];
export function referenceFile(screenId: string, state: string, viewport: string): string;
export function sourceFile(source: string): string;
export function validateScenarios(
  scenarios: Scenario[],
  viewports: Record<string, Viewport>,
): string[];
export function sha256(buffer: Buffer): string;
export function pngSize(buffer: Buffer): Viewport;
export function manifestEntry(options: {
  screenId: string;
  state: string;
  viewport: string;
  source: string;
  png: Buffer;
  viewportSize: Viewport;
  zoom?: number;
}): ReferenceEntry;
export function sortEntries(entries: ReferenceEntry[]): ReferenceEntry[];
export function buildManifest(entries: ReferenceEntry[]): Manifest;
export function tokenEntries(raw: TokenEntry[]): TokenEntry[];
export function buildTokens(entries: TokenEntry[]): Tokens;
export function toJson(data: unknown): string;
