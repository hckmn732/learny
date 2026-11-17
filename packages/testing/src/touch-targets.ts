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

/** The only exemptions admitted by ADR-0201 (CA-2): inline text links and graph nodes. */
export const ALLOWED_TOUCH_EXEMPTIONS = ['inline', 'graph-node'] as const;

export function isAllowedExemption(value: string | null): boolean {
  return (ALLOWED_TOUCH_EXEMPTIONS as readonly string[]).includes((value ?? '').trim());
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
    ({ selectors, min, tolerance, allowed }) => {
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
        const exempt = el.closest('[data-touch-exempt]');
        if (exempt !== null) {
          // CA-2 — only the two exemptions of ADR-0201 are admitted.
          const value = exempt.getAttribute('data-touch-exempt') ?? '';
          if (!allowed.includes(value.trim())) {
            const rect = el.getBoundingClientRect();
            out.push({
              selector: label(el),
              text: `exemption non autorisée « ${value} »`,
              width: Math.round(rect.width * 10) / 10,
              height: Math.round(rect.height * 10) / 10,
            });
          }
          continue;
        }
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
    {
      selectors: TOUCH_SELECTORS,
      min,
      tolerance: 0.5,
      allowed: [...ALLOWED_TOUCH_EXEMPTIONS] as string[],
    },
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
    // Page coordinates (the page may already be scrolled sideways) and outermost offenders only,
    // so the report names the element that overflows rather than its descendants.
    offenders: [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((el) => {
        const offends = (node: Element): boolean => {
          const rect = node.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return false;
          return (
            rect.right + window.scrollX > window.innerWidth + 1 || rect.left + window.scrollX < -1
          );
        };
        if (!offends(el)) return false;
        const parent = el.parentElement;
        return parent === null || parent === document.body || !offends(parent);
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

const TEXT_INPUT_SELECTOR = [
  'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range])',
  ':not([type=file]):not([type=color]):not([type=submit]):not([type=button])',
].join('');

/**
 * EF-9 — on mobile, every visible text field renders at least `min` CSS px so iOS never zooms
 * on focus. Checkboxes, radios, ranges and buttons are not text fields.
 */
export async function expectMobileInputFontSize(page: Page, min = 16): Promise<void> {
  const violations = await page.evaluate(
    ({ selector, min }) =>
      [...document.querySelectorAll<HTMLElement>(selector)]
        .filter((el) => el.getClientRects().length > 0)
        .filter((el) => getComputedStyle(el).visibility !== 'hidden')
        .map((el) => ({
          name:
            el.getAttribute('data-testid') ??
            el.getAttribute('name') ??
            el.getAttribute('aria-label') ??
            el.tagName.toLowerCase(),
          size: Number.parseFloat(getComputedStyle(el).fontSize),
        }))
        .filter((field) => field.size < min - 0.01),
    { selector: `${TEXT_INPUT_SELECTOR}, textarea, select`, min },
  );
  expect(
    violations,
    `champs < ${String(min)} px : ${violations.map((v) => `${v.name} ${String(v.size)} px`).join(', ')}`,
  ).toEqual([]);
}

/**
 * EF-1 — nothing is cut off at the window edge. `overflow-x: hidden` on a page container hides a
 * horizontal scrollbar but still truncates its content, so every rendered element must fit in
 * the window, except inside a horizontally scrollable region, a visually hidden element or a
 * closed off-canvas layer (`visibility: hidden`).
 */
export async function expectNoClippedContent(page: Page): Promise<void> {
  const offenders = await page.evaluate(() => {
    const width = window.innerWidth;
    const outside = (el: Element): boolean => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      return rect.right > width + 1 || rect.left < -1;
    };
    const exempt = (el: Element): boolean => {
      for (let node: Element | null = el; node !== null; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.visibility === 'hidden' || style.display === 'none') return true;
        if (style.getPropertyValue('clip') !== 'auto' || style.clipPath !== 'none') return true;
        if (node.classList.contains('sr-only')) return true;
        if (node !== el && (style.overflowX === 'auto' || style.overflowX === 'scroll'))
          return true;
      }
      return false;
    };
    return [...document.querySelectorAll('body *')]
      .filter((el) => outside(el) && !exempt(el))
      .filter((el) => el.parentElement === null || !outside(el.parentElement))
      .slice(0, 8)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const testId = el.getAttribute('data-testid');
        const name = testId === null ? el.tagName.toLowerCase() : `[data-testid="${testId}"]`;
        const classes = [...el.classList].slice(0, 6).join('.');
        return `${name}${classes === '' ? '' : `.${classes}`} left=${String(Math.round(rect.left))} right=${String(Math.round(rect.right))}`;
      });
  });
  expect(offenders, `contenu coupé au bord de la fenêtre : ${offenders.join(', ')}`).toEqual([]);
}
