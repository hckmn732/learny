// Types of compare.mjs for TypeScript consumers (Vitest unit tests).
export interface MaskRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MaskZones {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

export interface CompareOptions {
  /** Mask specification: named fractions (`top=0.05,bottom=0.04`) or a JSON rectangle list. */
  mask?: string;
  /** Explicit rectangles, in reference pixels (wins over `mask`). */
  masks?: MaskRect[];
  /** Named fractions replacing the defaults. */
  zones?: MaskZones;
  threshold?: number;
  colorThreshold?: number;
}

export interface CompareResult {
  ok: boolean;
  diffRatio: number;
  different: number;
  total: number;
  width: number;
  height: number;
  threshold: number;
  diffPng: unknown;
}

export const DEFAULT_THRESHOLD: number;
export const DEFAULT_COLOR_THRESHOLD: number;
export const DEFAULT_ZONES: { top: number; bottom: number; left: number; right: number };

export function parseMask(value: string | undefined | null, width: number, height: number): MaskRect[];
export function parseZones(value: string): MaskZones;
export function maskPng(png: unknown, rects: MaskRect[]): unknown;
export function resizeImage(png: unknown, width: number, height: number): unknown;
export function compareImages(
  captureBuffer: Buffer,
  referenceBuffer: Buffer,
  options?: CompareOptions,
): CompareResult;
export function runCli(argv: string[]): number;
