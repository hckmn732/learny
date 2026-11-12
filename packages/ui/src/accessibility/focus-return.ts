// Focus management shared by skip links, panels and dialogs (SPEC-309, EF-1, EF-2, CL-1).
export type FocusTarget = HTMLElement | null | undefined;

export interface FocusReturnOptions {
  /** Element that opened the panel; focused again when it still exists. */
  trigger?: FocusTarget;
  /** Explicit fallback, for example a page heading held by the caller. */
  fallback?: FocusTarget;
  /** Document used to locate the fallbacks; defaults to the current document. */
  document?: Document;
}

export interface FocusElementOptions {
  /** Keeps the current scroll position when focusing an off-screen target. */
  preventScroll?: boolean;
}

/** A target is usable only when it is still attached and is not the body or the root element. */
export function isConnectedTarget(target: FocusTarget): target is HTMLElement {
  if (target === null || target === undefined) return false;
  if (typeof target.focus !== 'function') return false;
  if (!target.isConnected) return false;
  const document = target.ownerDocument;
  return document.body !== target && document.documentElement !== target;
}

/** Page title used when the opener disappeared (CL-1): explicit marker first, then the h1. */
export function findPageTitle(document: Document): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('[data-page-title]') ??
    document.querySelector<HTMLElement>('main h1') ??
    document.querySelector<HTMLElement>('h1')
  );
}

/** Main content targeted by the skip link. */
export function findMainContent(document: Document, id = 'contenu-principal'): HTMLElement | null {
  return document.getElementById(id) ?? document.querySelector<HTMLElement>('main');
}

/**
 * Resolves the element that must receive focus, in order: connected trigger, explicit fallback,
 * page title, main content. It never returns body.
 */
export function resolveFocusTarget(options: FocusReturnOptions = {}): HTMLElement | null {
  const document = options.document ?? globalThis.document;
  if (isConnectedTarget(options.trigger)) return options.trigger;
  if (isConnectedTarget(options.fallback)) return options.fallback;
  return findPageTitle(document) ?? findMainContent(document);
}

/**
 * Focuses a target and makes non-interactive landmarks programmatically focusable. Returns true
 * only when the browser actually moved the focus (guards against hidden or inert targets).
 */
export function focusElement(target: FocusTarget, options: FocusElementOptions = {}): boolean {
  if (!isConnectedTarget(target)) return false;
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: options.preventScroll ?? false });
  return target.ownerDocument.activeElement === target;
}

/** Returns focus to the opener, or to the page title when the opener was removed. */
export function returnFocus(options: FocusReturnOptions = {}): boolean {
  return focusElement(resolveFocusTarget(options), { preventScroll: true });
}

/** Moves focus to `main#contenu-principal` (skip link, EF-1). */
export function focusMainContent(id = 'contenu-principal', document?: Document): boolean {
  const document_ = document ?? globalThis.document;
  return focusElement(findMainContent(document_, id), { preventScroll: true });
}
