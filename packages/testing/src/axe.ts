// axe-core helper shared by every Playwright test (SPEC-309, ET-3; ADR-0038).
//
// The rule is deliberately strict: only `serious` and `critical` violations block a validation.
// The full axe result is still attached to the test by the Playwright fixture.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import type { AxeResults, Result } from 'axe-core';

/** axe impact levels that fail a validation (BR-PLA-03). */
export const BLOCKING_AXE_IMPACTS = ['serious', 'critical'] as const;
export type BlockingAxeImpact = (typeof BLOCKING_AXE_IMPACTS)[number];

export interface AxeViolationLike {
  id: string;
  impact?: string | null;
  help: string;
}

export function blockingAxeViolations<T extends AxeViolationLike>(violations: readonly T[]): T[] {
  return violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
}

export function formatAxeViolations(violations: readonly AxeViolationLike[]): string[] {
  return violations.map(
    (violation) => `${violation.id} (${violation.impact ?? ''}) : ${violation.help}`,
  );
}

export interface RunAxeOptions {
  /** axe tags to enable, for example `['wcag2a', 'wcag2aa', 'wcag22aa']`. */
  tags?: string[];
}

/** Runs axe-core against the page and returns every violation, not only the blocking ones. */
export async function runAxe(page: Page, options: RunAxeOptions = {}): Promise<Result[]> {
  const builder = new AxeBuilder({ page });
  if (options.tags !== undefined && options.tags.length > 0) builder.withTags(options.tags);
  const results: AxeResults = await builder.analyze();
  return results.violations;
}

/**
 * Fails when a serious/critical violation is found and returns the complete result list so the
 * caller can attach it as evidence.
 */
export async function expectNoSeriousAxeViolations(page: Page): Promise<Result[]> {
  const violations = await runAxe(page);
  expect(
    formatAxeViolations(blockingAxeViolations(violations)),
    'violations axe serious/critical',
  ).toEqual([]);
  return violations;
}
