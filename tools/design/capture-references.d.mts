// Types of the deterministic mockup capturer (capture-references.mjs, SPEC-005 ET-1..ET-6).
import type { Manifest, Scenario, Viewport } from './manifest.mjs';

export interface CaptureOptions {
  outDir: string;
  sourcesDir?: string;
  scenarios?: Scenario[];
  viewports?: Record<string, Viewport>;
  diagnosticsDir?: string;
  log?: (message: string) => void;
  keepGoing?: boolean;
}

export function captureReferences(options: CaptureOptions): Promise<Manifest>;
export function publish(staging: string, target: string): void;
