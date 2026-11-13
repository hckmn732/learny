import type { NotionGraphColorMode } from '@learny/contracts';
import { colors } from '@learny/ui/tokens';

// Browser-side palette of SCR-14 (SPEC-616 BR-CAR-02). The module colours are the seven fixed
// values of `Carte.dc.html`; SPEC-301 classifies them as a data palette, not interface tokens
// (`packages/ui/test/integration/tokens-vs-mockups.test.ts`). The mastery colours reuse the design
// tokens. The legend consumes exactly the same values as the nodes.

export const MODULE_COLORS = [
  colors['indigo-light'],
  'rgb(45, 212, 191)',
  colors.lime,
  'rgb(251, 191, 36)',
  'rgb(244, 114, 182)',
  'rgb(96, 165, 250)',
  'rgb(248, 113, 113)',
] as const;

export const MASTERY_COLORS = {
  mastered: colors['green-mint'],
  to_consolidate: colors.orange,
  upcoming: colors['dark-400'],
} as const;

export const GRAPH_COLORS = {
  formation: colors.white,
  source: colors['on-dark-muted'],
  moduleNeutral: colors['on-dark-faint'],
  selected: colors.lime,
  confusion: colors.orange,
  tutor: 'rgba(198, 244, 50, 0.7)',
  sourceLink: 'rgba(161, 161, 170, 0.35)',
  contains: 'rgba(255, 255, 255, 0.09)',
  relation: 'rgba(255, 255, 255, 0.16)',
} as const;

export function moduleColor(position: number | null): string {
  if (position === null) return MODULE_COLORS[0];
  return MODULE_COLORS[(position - 1) % MODULE_COLORS.length] ?? MODULE_COLORS[0];
}

export function nodeColor(
  mode: NotionGraphColorMode,
  node: {
    kind: 'formation' | 'module' | 'notion' | 'source';
    modulePosition: number | null;
    masteryStatus: 'mastered' | 'to_consolidate' | 'upcoming' | null;
  },
): string {
  if (node.kind === 'formation') return GRAPH_COLORS.formation;
  if (node.kind === 'source') return GRAPH_COLORS.source;
  if (mode === 'mastery') {
    if (node.kind === 'module') return GRAPH_COLORS.moduleNeutral;
    if (node.masteryStatus === null) return MASTERY_COLORS.upcoming;
    return MASTERY_COLORS[node.masteryStatus];
  }
  return moduleColor(node.modulePosition);
}
