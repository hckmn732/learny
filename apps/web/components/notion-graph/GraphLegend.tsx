'use client';

import type { NotionGraphColorMode, NotionGraphNode } from '@learny/contracts';

import { fr } from '../../messages/fr';

import { GRAPH_COLORS, MASTERY_COLORS, moduleColor } from './palette';

const t = fr.notionGraph;

export interface GraphLegendProps {
  mode: NotionGraphColorMode;
  modules: readonly NotionGraphNode[];
}

/**
 * Legend of SCR-14 (SPEC-616 BR-CAR-02, EF-2): module colours or the three mastery states, plus
 * the two typed line styles. Every entry has a text label, so the legend never relies on colour
 * alone (WCAG 1.4.1).
 */
export function GraphLegend({ mode, modules }: GraphLegendProps) {
  const ordered = [...modules].sort(
    (left, right) => (left.modulePosition ?? 0) - (right.modulePosition ?? 0),
  );
  return (
    <div
      data-testid="graph-legend"
      className="pointer-events-none absolute right-70 bottom-14 left-14 flex flex-wrap gap-x-14 gap-y-6 rounded-14 bg-tooltip-glass px-12 py-10 text-12 text-on-dark-secondary"
    >
      {mode === 'mastery' ? (
        <>
          <span className="inline-flex items-center gap-6">
            <span
              aria-hidden="true"
              className="inline-block size-10 rounded-full"
              style={{ backgroundColor: MASTERY_COLORS.mastered }}
            />
            {t.legend.mastered}
          </span>
          <span className="inline-flex items-center gap-6">
            <span
              aria-hidden="true"
              className="inline-block size-10 rounded-full"
              style={{ backgroundColor: MASTERY_COLORS.to_consolidate }}
            />
            {t.legend.toConsolidate}
          </span>
          <span className="inline-flex items-center gap-6">
            <span
              aria-hidden="true"
              className="inline-block size-10 rounded-full"
              style={{ backgroundColor: MASTERY_COLORS.upcoming }}
            />
            {t.legend.upcoming}
          </span>
        </>
      ) : (
        ordered.map((module) => (
          <span key={module.id} className="inline-flex items-center gap-6">
            <span
              aria-hidden="true"
              className="inline-block size-10 rounded-full"
              style={{ backgroundColor: moduleColor(module.modulePosition) }}
            />
            M{module.modulePosition}
          </span>
        ))
      )}
      <span className="inline-flex items-center gap-6">
        <span
          aria-hidden="true"
          className="inline-block h-0 w-18 border-t-2 border-dashed"
          style={{ borderColor: GRAPH_COLORS.confusion }}
        />
        {t.legend.confusion}
      </span>
      <span className="inline-flex items-center gap-6">
        <span
          aria-hidden="true"
          className="inline-block h-0 w-18 border-t-2 border-dotted"
          style={{ borderColor: GRAPH_COLORS.selected }}
        />
        {t.legend.tutor}
      </span>
    </div>
  );
}
