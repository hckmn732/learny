// Read-only view of design/references/ for the SPEC-005 demo page.
import fs from 'node:fs';
import path from 'node:path';

import type { ReferenceEntryMeta, ReferenceState } from './reference-types';
import { findRepoRoot } from './sdd-status';

interface ManifestEntry extends ReferenceEntryMeta {
  source: string;
}

export type ReferencesSnapshot =
  | {
      ok: true;
      mockups: number;
      states: number;
      captures: number;
      tokens: number;
      stateList: ReferenceState[];
    }
  | { ok: false };

export function readReferences(root = findRepoRoot()): ReferencesSnapshot {
  try {
    if (root === null) throw new Error('repository root not found');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, 'design', 'references', 'manifest.json'), 'utf8'),
    ) as { references?: ManifestEntry[] };
    const tokens = JSON.parse(
      fs.readFileSync(path.join(root, 'design', 'references', 'tokens.json'), 'utf8'),
    ) as { entries?: unknown[] };
    const entries = manifest.references ?? [];
    if (entries.length === 0) throw new Error('empty manifest');

    const byState = new Map<
      string,
      { screenId: string; state: string; desktop?: ReferenceEntryMeta; mobile?: ReferenceEntryMeta }
    >();
    for (const entry of entries) {
      const key = `${entry.screenId}/${entry.state}`;
      const current = byState.get(key) ?? { screenId: entry.screenId, state: entry.state };
      const meta: ReferenceEntryMeta = {
        screenId: entry.screenId,
        state: entry.state,
        viewport: entry.viewport,
        file: entry.file,
        width: entry.width,
        height: entry.height,
        viewportWidth: entry.viewportWidth,
        viewportHeight: entry.viewportHeight,
        sha256: entry.sha256,
      };
      if (entry.viewport === 'desktop') current.desktop = meta;
      else current.mobile = meta;
      byState.set(key, current);
    }

    const stateList: ReferenceState[] = [];
    for (const [key, value] of byState) {
      if (value.desktop && value.mobile) {
        stateList.push({
          key,
          screenId: value.screenId,
          state: value.state,
          desktop: value.desktop,
          mobile: value.mobile,
        });
      }
    }
    stateList.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

    return {
      ok: true,
      mockups: new Set(entries.map((e) => e.source.replace(/[?#].*$/, ''))).size,
      states: stateList.length,
      captures: entries.length,
      tokens: tokens.entries?.length ?? 0,
      stateList,
    };
  } catch {
    return { ok: false };
  }
}
