// Model of the /_dev/sdd index (SPEC-006, EF-3/EF-4, ADR-0203): SPEC-006 owns the route, the guard
// and the shared presentation; SPEC-003 provides the progress content.
import { sddPagesEnabled } from './sdd-pages';
import type { SddStatus } from './sdd-status';

export interface SddIndexDemo {
  id: string;
  title: string;
}

export type SddIndexState =
  | { kind: 'minimal'; demos: SddIndexDemo[] }
  | { kind: 'progress'; status: SddStatus; demos: SddIndexDemo[] };

/**
 * `null` when the guard refuses (the page answers 404) — the progress is then never read.
 * Without a progress reader (SPEC-003 not delivered yet) the index is a minimal list of demos.
 */
export function loadSddIndex(
  env: Record<string, string | undefined>,
  registry: Readonly<Record<string, { title: string }>>,
  readProgress?: () => SddStatus,
): SddIndexState | null {
  if (!sddPagesEnabled(env)) return null;
  const demos = Object.entries(registry)
    .map(([id, demo]) => ({ id, title: demo.title }))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (readProgress === undefined) return { kind: 'minimal', demos };
  return { kind: 'progress', status: readProgress(), demos };
}
