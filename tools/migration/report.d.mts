// Types de report.mjs pour ses consommateurs TypeScript (test unitaire de frontière).
export declare const ROOT: string;
export declare const SERVER_PACKAGES: string[];
export declare const WEB_CATEGORIES: string[];

export interface CoupledFile {
  file: string;
  category: 'pages' | 'lib' | 'components' | 'dev' | 'proxy' | 'apiRoutes';
}

export interface WebBaseline {
  files: string[];
  globs: string[];
}

export interface WebBoundaryMeasure {
  coupled: CoupledFile[];
  byCategory: Record<CoupledFile['category'], number>;
  clientComponents: string[];
  routesRegistry: number;
  routeFiles: number;
}

export declare function categorizeWebFile(file: string): CoupledFile['category'] | null;
export declare function importsServerPackage(text: string): boolean;
export declare function countRegistryRoutes(root?: string): number;
export declare function measureWebBoundary(root?: string): WebBoundaryMeasure;
export declare function progressFrom(measure: WebBoundaryMeasure): {
  coupling: Record<CoupledFile['category'], number>;
  routes: { registry: number; routeFiles: number };
  clientComponents: string[];
};
export declare function baselineFrom(measure: WebBoundaryMeasure): WebBaseline;
export declare function baselineErrors(baseline: WebBaseline, root?: string): string[];
export declare function writeProgress(
  report: ReturnType<typeof progressFrom>,
  root?: string,
): string;
export declare function main(argv?: string[], root?: string): void;
