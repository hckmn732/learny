// Types of evidence.mjs for TypeScript consumers (tests).
export interface CollectOptions {
  evidenceRoot?: string;
  junit?: string;
  lfs?: boolean;
  gitInfoDir?: string | null;
}
export interface CollectResult {
  dir: string;
  videos: number;
  copied: {
    reports: string[];
    videos: string[];
    screenshots: string[];
    visual: string[];
    attachments: string[];
  };
}
export function sha256(file: string): string;
export function slugify(text: string): string;
export function collectEvidence(
  spec: { id: string; title: string; path: string },
  resultsDir?: string,
  options?: CollectOptions,
): CollectResult;
