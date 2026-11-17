// Declared foreground/background token pairs of the interface (SPEC-803 ET-4, CA-4).
// Every pair is checked by `contrast.test.ts`; `minimum` is 4.5 for normal text and 3 for large
// text and for the focus / non-text indicators (WCAG 2.2 1.4.3 and 1.4.11).
import type { ColorToken } from './colors';

export interface TokenPair {
  id: string;
  foreground: ColorToken;
  background: ColorToken;
  minimum: number;
  usage: 'text' | 'large-text' | 'non-text';
}

export const TOKEN_PAIRS = [
  { id: 'ink-on-surface', foreground: 'ink', background: 'surface', minimum: 4.5, usage: 'text' },
  { id: 'ink-on-canvas', foreground: 'ink', background: 'canvas', minimum: 4.5, usage: 'text' },
  {
    id: 'ink-secondary-on-surface',
    foreground: 'ink-secondary',
    background: 'surface',
    minimum: 4.5,
    usage: 'text',
  },
  // The two pairs called out explicitly by ET-4.
  {
    id: 'ink-muted-on-canvas',
    foreground: 'ink-muted',
    background: 'canvas',
    minimum: 4.5,
    usage: 'text',
  },
  {
    id: 'ink-muted-on-surface-subtle',
    foreground: 'ink-muted',
    background: 'surface-subtle',
    minimum: 4.5,
    usage: 'text',
  },
  {
    id: 'ink-muted-on-surface',
    foreground: 'ink-muted',
    background: 'surface',
    minimum: 4.5,
    usage: 'text',
  },
  {
    id: 'indigo-ink-on-surface',
    foreground: 'indigo-ink',
    background: 'surface',
    minimum: 4.5,
    usage: 'text',
  },
  {
    id: 'indigo-on-surface',
    foreground: 'indigo',
    background: 'surface',
    minimum: 4.5,
    usage: 'text',
  },
  {
    id: 'indigo-ink-on-indigo-soft',
    foreground: 'indigo-ink',
    background: 'indigo-soft',
    minimum: 4.5,
    usage: 'text',
  },
  {
    id: 'lime-ink-on-lime-soft',
    foreground: 'lime-ink',
    background: 'lime-soft',
    minimum: 4.5,
    usage: 'text',
  },
  {
    id: 'orange-ink-on-orange-soft',
    foreground: 'orange-ink',
    background: 'orange-soft',
    minimum: 4.5,
    usage: 'text',
  },
  {
    id: 'green-ink-on-green-soft',
    foreground: 'green-ink',
    background: 'green-soft',
    minimum: 4.5,
    usage: 'text',
  },
  {
    id: 'violet-ink-on-violet-soft',
    foreground: 'violet-ink',
    background: 'violet-soft',
    minimum: 4.5,
    usage: 'text',
  },
  {
    id: 'danger-on-surface',
    foreground: 'danger',
    background: 'surface',
    minimum: 4.5,
    usage: 'text',
  },
  {
    id: 'on-dark-secondary-on-dark-850',
    foreground: 'on-dark-secondary',
    background: 'dark-850',
    minimum: 4.5,
    usage: 'text',
  },
  {
    id: 'on-dark-muted-on-dark-850',
    foreground: 'on-dark-muted',
    background: 'dark-850',
    minimum: 4.5,
    usage: 'text',
  },
  { id: 'lime-on-ink', foreground: 'lime', background: 'ink', minimum: 4.5, usage: 'text' },
  {
    id: 'orange-on-dark-on-dark-850',
    foreground: 'orange-on-dark',
    background: 'dark-850',
    minimum: 4.5,
    usage: 'text',
  },
  { id: 'white-on-indigo', foreground: 'white', background: 'indigo', minimum: 4.5, usage: 'text' },
  { id: 'white-on-danger', foreground: 'white', background: 'danger', minimum: 4.5, usage: 'text' },
  { id: 'ink-on-success', foreground: 'ink', background: 'success', minimum: 4.5, usage: 'text' },
  // Focus ring and non-text indicators (1.4.11, 2.4.7, CA-4).
  {
    id: 'focus-ring-on-surface',
    foreground: 'indigo-ink',
    background: 'surface',
    minimum: 3,
    usage: 'non-text',
  },
  {
    id: 'focus-ring-on-canvas',
    foreground: 'indigo-ink',
    background: 'canvas',
    minimum: 3,
    usage: 'non-text',
  },
  {
    id: 'focus-ring-on-dark',
    foreground: 'lime',
    background: 'ink',
    minimum: 3,
    usage: 'non-text',
  },
  {
    id: 'icon-on-surface',
    foreground: 'ink-muted',
    background: 'surface',
    minimum: 3,
    usage: 'non-text',
  },
  {
    id: 'icon-on-canvas',
    foreground: 'ink-muted',
    background: 'canvas',
    minimum: 3,
    usage: 'non-text',
  },
] as const satisfies readonly TokenPair[];

export type TokenPairId = (typeof TOKEN_PAIRS)[number]['id'];
