// Shared accessibility assertions of the mobile test suite (SPEC-3001 BR-PLA-03).
// Every screen test of the mobile track calls `expectAccessible` for the elements a screen reader
// must announce, and `expectMinTouchTarget` for every interactive control.
import type { RenderResult } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

export interface AccessibleOptions {
  /** Expected `accessibilityRole` (a button, a header, a text…). */
  readonly role?: string;
  /** Expected `accessibilityLabel`: mandatory when the element has no readable text. */
  readonly label?: string;
}

export interface MinTarget {
  /** Minimum width, when the control declares one (a full-width row does not). */
  readonly width?: number;
  /** Minimum height. */
  readonly height?: number;
}

interface AccessibleProps {
  readonly accessibilityRole?: unknown;
  readonly accessibilityLabel?: unknown;
  readonly accessibilityElementsHidden?: unknown;
  readonly style?: unknown;
  readonly hitSlop?: unknown;
}

function propsOf(node: unknown): AccessibleProps {
  const candidate = node as { props?: AccessibleProps };
  return candidate.props ?? {};
}

/** Asserts that `testID` exists and exposes the expected role and label. */
export function expectAccessible(
  screen: RenderResult,
  testID: string,
  options: AccessibleOptions = {},
): void {
  const node = screen.getByTestId(testID);
  expect(node).toBeTruthy();

  const props = propsOf(node);
  if (options.role !== undefined) {
    expect(props.accessibilityRole).toBe(options.role);
  }
  if (options.label !== undefined) {
    expect(props.accessibilityLabel).toBe(options.label);
  }
  if (options.role === 'header') {
    // A header is announced as such: it must not be hidden from assistive technologies.
    expect(props.accessibilityElementsHidden).not.toBe(true);
  }
}

interface FlatStyle {
  width?: number | string;
  height?: number | string;
  minWidth?: number | string;
  minHeight?: number | string;
}

function numeric(value: unknown): number {
  return typeof value === 'number' ? value : Number.NaN;
}

/** Largest of two measures, ignoring the ones a style does not declare (`NaN`). */
function best(first: number, second: number): number {
  if (Number.isNaN(first)) return Number.isNaN(second) ? 0 : second;
  if (Number.isNaN(second)) return first;
  return Math.max(first, second);
}

function hitSlopSum(slop: unknown): number {
  if (typeof slop === 'number') return slop * 2;
  if (typeof slop !== 'object' || slop === null) return 0;
  const { left = 0, right = 0, top = 0, bottom = 0 } = slop as Record<string, number>;
  return Math.min(left + right, top + bottom);
}

/**
 * Asserts that an interactive element reaches the platform minimum (48 × 48 dp on Android,
 * 44 × 44 pt on iOS, canevas § 3): either by its own metrics, or with its `hitSlop`.
 */
export function expectMinTouchTarget(node: unknown, target: MinTarget): void {
  const props = propsOf(node);
  const style = StyleSheet.flatten(props.style as never) as FlatStyle | undefined;
  const slop = hitSlopSum(props.hitSlop);

  const width = best(numeric(style?.width), numeric(style?.minWidth)) + slop;
  const height = best(numeric(style?.height), numeric(style?.minHeight)) + slop;

  // Two assertions rather than one object comparison: the failure message names the dimension.
  if (target.width !== undefined) expect(width).toBeGreaterThanOrEqual(target.width);
  if (target.height !== undefined) expect(height).toBeGreaterThanOrEqual(target.height);
}
