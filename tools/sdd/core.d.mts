// Types of the pure SDD functions (core.mjs) for TypeScript consumers.
export type StoredStatus = 'pending' | 'in_progress' | 'done' | 'blocked';
export type DisplayStatus =
  | 'pending'
  | 'ready'
  | 'waiting'
  | 'in_progress'
  | 'done'
  | 'blocked'
  | 'dependency_blocked';

export interface CatalogPhase {
  id: string;
  dir: string;
  title: string;
  checkpoint: string;
  /** Piste de la phase (ADR-1006) ; « produit » par défaut. */
  track?: string;
  /** Checkpoints (d'autres pistes) à réussir avant de débloquer la phase. */
  requires?: string[];
  /** Contrôles supplémentaires du checkpoint : 'cross-browser', 'perf'. */
  checks?: string[];
}

export interface TrackConfig {
  /** Branche de départ des branches de spécification, cible des fusions et du push. */
  baseBranch: string;
  /** Pose les tags SemVer (v0.n.0, v1.0.0…) aux checkpoints ; sinon seulement `cp-n`. */
  versionTags: boolean;
  /** Début de la plage de numérotation des ADR de la piste (0 → ADR-0001…0999, 1000 → ADR-1001…1999). */
  adrBase: number;
}

export interface CatalogSpec {
  id: string;
  title: string;
  phase: string;
  priority: string;
  path: string;
  dependsOn: string[];
  businessRules: string[];
  screens: string[];
  adrs: string[];
  visual?: string;
}

export interface RawCatalog {
  phases: CatalogPhase[];
  specs: CatalogSpec[];
  activeTrack?: string;
  tracks?: Record<string, Partial<TrackConfig>>;
}

export interface Catalog extends RawCatalog {
  byId: Record<string, CatalogSpec>;
}

export interface ValidationResult {
  status: 'passed' | 'failed';
  at: string;
  details: string;
}

export interface SpecState {
  status: StoredStatus;
  attempts: number;
  startedAt: string | null;
  completedAt: string | null;
  branch: string | null;
  commit: string | null;
  lastError: string | null;
  validations: Record<string, ValidationResult>;
}

export interface CheckpointState {
  status: 'pending' | 'passed' | 'failed';
  at: string | null;
  tag: string | null;
  report: string | null;
}

export interface SddState {
  version: number;
  updatedAt: string | null;
  specs: Record<string, SpecState>;
  checkpoints: Record<string, CheckpointState>;
  anomalies: unknown[];
}

export type NextAction =
  | { kind: 'resume' | 'start'; spec: CatalogSpec }
  | { kind: 'checkpoint'; checkpoint: string; phase: CatalogPhase }
  | { kind: 'finished' }
  | { kind: 'stuck'; remaining: string[]; waitingFor?: string[] };

export interface PhaseSummary extends CatalogPhase {
  total: number;
  done: number;
  checkpointState: CheckpointState;
}

export interface ProgressSummary {
  displayStatuses: Record<string, DisplayStatus>;
  total: number;
  v1Total: number;
  done: number;
  inProgress: number;
  ready: number;
  waiting: number;
  blocked: number;
  dependencyBlocked: number;
  globalPercent: number;
  v1Percent: number;
  phases: PhaseSummary[];
}

export const MAX_ATTEMPTS: number;
export const STATUSES: readonly StoredStatus[];
export const DISPLAY_STATUSES: readonly DisplayStatus[];
export function indexCatalog(raw: RawCatalog): Catalog;
export function emptySpecState(): SpecState;
export function normalizeState(catalog: Catalog, raw: unknown): SddState;
export function displayStatus(catalog: Catalog, st: SddState, id: string): DisplayStatus;
export function isBlockedTransitively(
  catalog: Catalog,
  st: SddState,
  id: string,
  seen?: Set<string>,
): boolean;
export const DEFAULT_TRACK: string;
export function trackOf(phase: CatalogPhase | undefined): string;
export function activeTrack(catalog: Catalog, override?: string): string;
export function trackConfig(catalog: Catalog, track: string): TrackConfig;
export function nextAdrNumber(existing: number[], adrBase?: number): number;
export function phaseOf(catalog: Catalog, phaseId: string): CatalogPhase | undefined;
export function specTrack(catalog: Catalog, spec: CatalogSpec): string;
export function phaseUnlocked(catalog: Catalog, st: SddState, phaseId: string): boolean;
export function readySpecs(catalog: Catalog, st: SddState, track?: string): CatalogSpec[];
export function mergeTrackStates(
  catalog: Catalog,
  ours: SddState,
  theirs: SddState,
  track: string,
): SddState;
export function nextAction(catalog: Catalog, st: SddState, track?: string): NextAction;
export function nextActionJson(action: NextAction): Record<string, unknown>;
export function progressSummary(catalog: Catalog, st: SddState): ProgressSummary;
export function renderProgressMarkdown(catalog: Catalog, st: SddState, now: string): string;

export interface PlaywrightSummary {
  passed: number;
  failed: number;
  videos: number;
  visual: number;
}
export function summarizePlaywright(report: unknown, tag: string): PlaywrightSummary;
export function e2eVerdict(code: number, summary: PlaywrightSummary): boolean;
export function visualVerdict(summary: PlaywrightSummary): boolean;
