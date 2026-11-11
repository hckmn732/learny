// Read-only snapshot of the SDD repository for the /_dev/sdd index (SPEC-003, ADR-0068).
// The source of truth stays progress/state.json; nothing here writes.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { scanText } from '@learny/config';

import {
  indexCatalog,
  nextAction,
  normalizeState,
  progressSummary,
  type DisplayStatus,
  type RawCatalog,
} from '../../../tools/sdd/core.mjs';

export interface PublicSpec {
  id: string;
  title: string;
  phase: string;
  status: DisplayStatus;
  dependsOn: string[];
  validationsPassed: number;
  validationsTotal: number;
  reason: string | null;
}

export interface PublicPhase {
  id: string;
  title: string;
  done: number;
  total: number;
  checkpoint: string;
  checkpointStatus: 'pending' | 'passed' | 'failed';
}

export type PublicNextAction =
  | { kind: 'resume' | 'start'; id: string; title: string }
  | { kind: 'checkpoint'; checkpoint: string }
  | { kind: 'finished' }
  | { kind: 'stuck'; remaining: number };

export type SddStatus =
  | {
      ok: true;
      total: number;
      done: number;
      inProgress: number;
      blocked: number;
      globalPercent: number;
      v1Percent: number;
      next: PublicNextAction;
      phases: PublicPhase[];
      specs: PublicSpec[];
    }
  | { ok: false; requestId: string };

/** Repository root: SDD_ROOT (tests) or the first parent directory holding specs/catalog.json. */
export function findRepoRoot(start = process.cwd(), env = process.env): string | null {
  if (env.SDD_ROOT) return path.resolve(env.SDD_ROOT);
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'specs', 'catalog.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// Blocking reasons are shown, but never a value that looks like a secret.
function safeReason(reason: string | null): string | null {
  if (reason === null) return null;
  return scanText(reason, 'reason').length > 0 ? 'Raison masquée (valeur sensible).' : reason;
}

export function readSddStatus(root = findRepoRoot()): SddStatus {
  const requestId = randomUUID();
  try {
    if (root === null) throw new Error('repository root not found');
    const raw = JSON.parse(
      fs.readFileSync(path.join(root, 'specs', 'catalog.json'), 'utf8'),
    ) as RawCatalog;
    const catalog = indexCatalog(raw);
    const statePath = path.join(root, 'progress', 'state.json');
    const stateRaw: unknown = fs.existsSync(statePath)
      ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
      : null;
    const st = normalizeState(catalog, stateRaw);
    const summary = progressSummary(catalog, st);
    const action = nextAction(catalog, st);

    let next: PublicNextAction;
    switch (action.kind) {
      case 'resume':
      case 'start':
        next = { kind: action.kind, id: action.spec.id, title: action.spec.title };
        break;
      case 'checkpoint':
        next = { kind: 'checkpoint', checkpoint: action.checkpoint };
        break;
      case 'finished':
        next = { kind: 'finished' };
        break;
      case 'stuck':
        next = { kind: 'stuck', remaining: action.remaining.length };
        break;
    }

    return {
      ok: true,
      total: summary.total,
      done: summary.done,
      inProgress: summary.inProgress,
      blocked: summary.blocked + summary.dependencyBlocked,
      globalPercent: summary.globalPercent,
      v1Percent: summary.v1Percent,
      next,
      phases: summary.phases.map((p) => ({
        id: p.id,
        title: p.title,
        done: p.done,
        total: p.total,
        checkpoint: p.checkpoint,
        checkpointStatus: p.checkpointState.status,
      })),
      specs: catalog.specs.map((s) => {
        const x = st.specs[s.id];
        const validations = Object.values(x?.validations ?? {});
        const status = summary.displayStatuses[s.id] ?? 'pending';
        return {
          id: s.id,
          title: s.title,
          phase: s.phase,
          status,
          dependsOn: s.dependsOn,
          validationsPassed: validations.filter((v) => v.status === 'passed').length,
          validationsTotal: validations.length,
          reason: status === 'blocked' ? safeReason(x?.lastError ?? null) : null,
        };
      }),
    };
  } catch (error) {
    console.error(
      JSON.stringify({ msg: 'sdd status unreadable', requestId, error: String(error) }),
    );
    return { ok: false, requestId };
  }
}
