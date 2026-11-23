// Registry of the native brick views (SPEC-3301 ET-1, BR-BRI-01, ADR-3009 § 1 and § 2).
//
// Nine types are rendered natively; `instruction`, `scripted_dialogue`, `timer` and `scoring`
// (exercise, mock exam: out of the mobile scope) show the « Cette activité se fait sur le web »
// card. `BRICK_RENDERERS` is exhaustive on `BRICK_TYPES`: a fourteenth type breaks the build and
// the completeness test (`registry.test.ts`), which is the guard of BR-BRI-01.
//
// Pure: no React Native import. `views.tsx` binds each entry to its component and its own
// completeness test (`test/bricks/registry.test.tsx`) proves the binding at runtime.
import type { ReactElement, ReactNode } from 'react';

import type { BrickPublic, BrickType, CorrectionView } from '@learny/bricks';

/** The nine types rendered natively in V1 (ADR-3009 § 2). */
export const NATIVE_BRICK_TYPES = [
  'text',
  'resource_excerpt',
  'choice_question',
  'open_question',
  'cloze',
  'matching',
  'ordering',
  'categorization',
  'recall_card',
] as const;

export type NativeBrickType = (typeof NATIVE_BRICK_TYPES)[number];

/** The four types handed back to the web in V1 (ADR-3009 § 2). */
export const WEB_ONLY_BRICK_TYPES = [
  'instruction',
  'scripted_dialogue',
  'timer',
  'scoring',
] as const;

export type WebOnlyBrickType = (typeof WEB_ONLY_BRICK_TYPES)[number];

/** How a type is shown: a native component or the hand-off card. */
export type BrickRendererKind = 'native' | 'web';

/** Exhaustive decision table: one entry per type of `BRICK_TYPES` (ET-1). */
export const BRICK_RENDERERS: Record<BrickType, BrickRendererKind> = {
  text: 'native',
  resource_excerpt: 'native',
  choice_question: 'native',
  open_question: 'native',
  cloze: 'native',
  matching: 'native',
  ordering: 'native',
  categorization: 'native',
  recall_card: 'native',
  instruction: 'web',
  scripted_dialogue: 'web',
  timer: 'web',
  scoring: 'web',
};

/** Reading mode of the course, playing mode of the validation quiz, the global quiz and the warm-up. */
export type BrickMode = 'read' | 'play';

/**
 * Props of every native brick view (EF-1). `correction` is only ever the one the server sent back
 * (ADR-0150): a view never derives a good answer from the public charge (ET-2, CA-3).
 */
export interface NativeBrickViewProps {
  readonly brick: BrickPublic;
  readonly mode: BrickMode;
  readonly correction?: CorrectionView | undefined;
  /** Current response of a playing brick, controlled by the screen that owns the attempt. */
  readonly response?: unknown;
  readonly onResponse?: ((response: unknown) => void) | undefined;
  readonly disabled?: boolean | undefined;
  /** Opens `GET /resources/:rid/url` in the in-app browser; wired by the owning screen (BR-COU-02). */
  readonly onOpenResource?: ((resourceId: string) => void) | undefined;
  /** Opens the web page of a native-only feature, or of a type out of the mobile scope. */
  readonly onOpenWeb?: (() => void) | undefined;
  /** Buttons supplied by the parent screen (self-assessment of a recall card, EF-6). */
  readonly actions?: ReactNode;
  readonly testID?: string | undefined;
}

/** One brick view: a component that renders one public charge. */
export type NativeBrickView = (props: NativeBrickViewProps) => ReactElement | null;

/** True when the type is one of the nine native ones. */
export function isNativeBrickType(type: BrickType): type is NativeBrickType {
  return BRICK_RENDERERS[type] === 'native';
}

/** True when the type is handed back to the web (CL-1, ADR-3009 § 2). */
export function isWebOnlyBrickType(type: BrickType): type is WebOnlyBrickType {
  return BRICK_RENDERERS[type] === 'web';
}
