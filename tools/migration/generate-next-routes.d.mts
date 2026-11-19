// Types du générateur pour ses consommateurs TypeScript (test unitaire de génération).
export declare const ROOT: string;
export declare const API_ROOT: string;
export declare const NEXT_ROUTE_MODULE: string;
export declare const GENERATED_HEADER: string;
export declare const SEGMENT_OPTIONS: Record<string, { runtime?: string; maxDuration?: number }>;

export interface PlannedFile {
  content: string;
  methods: string[];
  keys: string[];
}

export interface PlannedFiles {
  files: Map<string, PlannedFile>;
  duplicates: string[];
  registry: number;
  specials: number;
}

export interface RouteCheckReport {
  drift: string[];
  missing: string[];
  orphans: string[];
  duplicates: string[];
  planned: number;
  present: number;
}

export declare function readRegistry(root?: string): Map<string, { method: string; path: string }>;
export declare function readSpecials(
  root?: string,
): { key: string; method: string; path: string }[];
export declare function filePathOf(routePath: string): string;
export declare function plannedFiles(root?: string): PlannedFiles;
export declare function renderFile(
  relative: string,
  methods: Map<string, { key: string; special: boolean }>,
): string;
export declare function expectedRouteFiles(root?: string): { path: string; methods: string[] }[];
export declare function scanGenerated(
  root?: string,
): Map<string, { content: string; methods: string[] }>;
export declare function check(root?: string): RouteCheckReport;
export declare function main(argv?: string[], root?: string): void;
