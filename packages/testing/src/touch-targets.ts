// Responsive layout controls (SPEC-802 ET-4, EF-8): touch-target size and horizontal overflow.
import { expect, type Page } from '@playwright/test';

export interface Box {
  width: number;
  height: number;
}

export interface PseudoBox {
  content: string;
  position: string;
  width: string;
  height: string;
}

/** Size of the clickable box, extended by a positioned `::before` when the browser reports one. */
export function computeTargetSize(box: Box, pseudo: PseudoBox | null): Box {
  if (pseudo === null) return box;
  const positioned = pseudo.position === 'absolute' || pseudo.position === 'fixed';
  if (!positioned || pseudo.content === 'none' || pseudo.content === 'normal') return box;
  const width = Number.parseFloat(pseudo.width);
  const height = Number.parseFloat(pseudo.height);
  return {
    width: Number.isFinite(width) ? Math.max(box.width, width) : box.width,
    height: Number.isFinite(height) ? Math.max(box.height, height) : box.height,
  };
}

export function isTouchExempt(value: string | null): boolean {
  return value !== null && value.trim() !== '';
}

export interface TouchTargetOptions {
  min?: number;
}

export interface TouchTargetViolation {
  selector: string;
  text: string;
  width: number;
  height: number;
}

const TOUCH_SELECTORS = [
  'a[href]',
  'button',
  'input:not([type=hidden])',
  'select',
  'textarea',
  '[role=button]',
  '[role=switch]',
  '[role=tab]',
  '[role=checkbox]',
  '[role=radio]',
  '[role=menuitem]',
  '[tabindex="0"]',
].join(',');

/**
 * Every visible interactive element must be at least `min` × `min` CSS pixels. Elements carrying
 * `data-touch-exempt` are the only exceptions (inline text links and graph nodes, ADR-0201).
 */
export async function expectTouchTargets(
  page: Page,
  options: TouchTargetOptions = {},
): Promise<void> {
  const min = options.min ?? 44;
  const violations = await page.evaluate(
    ({ selectors, min, tolerance }) => {
      type Pseudo = { content: string; position: string; width: string; height: string } | null;
      const parse = (value: string): number => Number.parseFloat(value);
      const out: { selector: string; text: string; width: number; height: number }[] = [];
      const label = (el: Element): string => {
        const testId = el.getAttribute('data-testid');
        if (testId !== null) return `[data-testid="${testId}"]`;
        if (el.id !== '') return `#${el.id}`;
        const cls = [...el.classList].slice(0, 2).join('.');
        return cls === '' ? el.tagName.toLowerCase() : `${el.tagName.toLowerCase()}.${cls}`;
      };
      for (const el of document.querySelectorAll(selectors)) {
        if (!(el instanceof HTMLElement) || el.getClientRects().length === 0) continue;
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        // Radix focus guards are aria-hidden 0 × 0 spans: not interactive targets.
        if (el.getAttribute('aria-hidden') === 'true') continue;
        if (el.closest('[aria-hidden="true"]') !== null) continue;
        if (el.hasAttribute('data-radix-focus-guard')) continue;
        const raw = el.getBoundingClientRect();
        if (raw.width === 0 && raw.height === 0) continue;
        // A skip link is 1 px until keyboard focus reveals it; it is not a touch target.
        if (
          (el.classList.contains('sr-only') || el.classList.contains('learny-visually-hidden')) &&
          document.activeElement !== el
        )
          continue;
        if (el.closest('[data-touch-exempt]') !== null) continue;
        if (el.hasAttribute('data-touch-exempt')) continue;
        // WCAG 2.5.8 inline exception: a link inside running text keeps the text flow.
        if (el.tagName === 'A' && style.display === 'inline') continue;
        const box = el.getBoundingClientRect();
        const pseudoStyle = getComputedStyle(el, '::before');
        const pseudo: Pseudo =
          pseudoStyle.content === 'none' || pseudoStyle.content === 'normal'
            ? null
            : {
                content: pseudoStyle.content,
                position: pseudoStyle.position,
                width: pseudoStyle.width,
                height: pseudoStyle.height,
              };
        let width = box.width;
        let height = box.height;
        if (pseudo !== null && (pseudo.position === 'absolute' || pseudo.position === 'fixed')) {
          width = Math.max(width, parse(pseudo.width));
          height = Math.max(height, parse(pseudo.height));
        }
        if (
          Number.isFinite(width) &&
          Number.isFinite(height) &&
          (width < min - tolerance || height < min - tolerance)
        ) {
          out.push({
            selector: label(el),
            text: (el.getAttribute('aria-label') ?? el.textContent).trim().slice(0, 60),
            width: Math.round(width * 10) / 10,
            height: Math.round(height * 10) / 10,
          });
        }
      }
      return out;
    },
    { selectors: TOUCH_SELECTORS, min, tolerance: 0.5 },
  );

  const summary = violations
    .map((v) => `${v.selector} « ${v.text} » ${String(v.width)}×${String(v.height)}`)
    .join('\n');
  expect(violations, `cibles tactiles < ${String(min)} px :\n${summary}`).toEqual([]);
}

/** No horizontal scroll of the page: `scrollWidth` never exceeds the window width. */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const result = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    offenders: [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.right > window.innerWidth + 1 || rect.left < -1;
      })
      .slice(0, 8)
      .map((el) => {
        const testId = el.getAttribute('data-testid');
        const rect = el.getBoundingClientRect();
        const name = testId === null ? el.tagName.toLowerCase() : `[data-testid="${testId}"]`;
        const classes = [...el.classList].slice(0, 6).join('.');
        return `${name}${classes === '' ? '' : `.${classes}`} right=${String(
          Math.round(rect.right),
        )} width=${String(Math.round(rect.width))}`;
      }),
  }));
  expect(
    result.documentWidth,
    `défilement horizontal (document ${String(result.documentWidth)} > fenêtre ${String(
      result.innerWidth,
    )}) ${result.offenders.join(', ')}`,
  ).toBeLessThanOrEqual(result.innerWidth + 1);
  expect(result.bodyWidth).toBeLessThanOrEqual(result.innerWidth + 1);
}
