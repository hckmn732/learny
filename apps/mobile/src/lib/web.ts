// Web links of the mobile application (SPEC-3102 EF-5, ADR-3002 § 3).
//
// Every entry point that is out of the mobile scope opens the corresponding web page in the
// in-app browser (`expo-web-browser`), with the label « Continuer sur le web ». The base URL is
// `EXPO_PUBLIC_WEB_URL`, validated at start-up with the other public variables (SPEC-3001 ET-5).
//
// The browser itself is injected (`src/lib/web-browser.ts` installs it at start-up): this module
// stays free of any native import and its functions run unchanged in Node (Vitest).
import { fr } from '@learny/i18n';

import { configResult } from '../config';

import { nativeRouteFor } from './native-routes';

/** Label of every web hand-off (ADR-3002 § 3). */
export const WEB_CONTINUE_LABEL: string = fr.mobile.shell.web.continue;

/** Opens a URL in the in-app browser; installed once by `web-browser.ts`. */
export type BrowserOpener = (url: string) => Promise<unknown>;

let installedOpener: BrowserOpener | null = null;

/** Navigates to a native route; installed once by `web-browser.ts` (expo-router). */
export type NativeNavigator = (route: string) => void;

let installedNavigator: NativeNavigator | null = null;

/** Installs the native navigator of the process (`null` removes it, for a test). */
export function setNativeNavigator(navigator: NativeNavigator | null): void {
  installedNavigator = navigator;
}

/** Installs the opener of the process (`null` removes it, for a test). */
export function setWebOpener(opener: BrowserOpener | null): void {
  installedOpener = opener;
}

/** Base of the web application, without a trailing slash; empty when the configuration is invalid. */
export function webBaseUrl(): string {
  return configResult.ok ? configResult.config.webUrl.replace(/\/+$/, '') : '';
}

/**
 * Absolute URL of an internal web path. A path that does not start with `/` is refused: the
 * hand-off never builds an external URL from a notification payload (ADR-3002 § 3).
 */
export function webUrl(path: string, baseUrl: string): string {
  if (!path.startsWith('/')) throw new Error(`Chemin web interne attendu : ${path}`);
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

/** Opens `path` of the web application and answers the URL that was opened. */
export async function openOnWeb(
  path: string,
  options: { readonly baseUrl?: string; readonly open?: BrowserOpener } = {},
): Promise<string> {
  const url = webUrl(path, options.baseUrl ?? webBaseUrl());
  // A page rebuilt natively opens in the application, not in the browser (QA 2026-11-25).
  const native = options.open === undefined ? nativeRouteFor(path) : null;
  if (native !== null && installedNavigator !== null) {
    installedNavigator(native);
    return url;
  }
  const open = options.open ?? installedOpener;
  if (open === null) throw new Error('Aucun navigateur installé : importer src/lib/web-browser.');
  await open(url);
  return url;
}

/** True when the link is an absolute URL the in-app browser may open (ET-3, CL-5). */
export function isExternalUrl(url: string): boolean {
  return /^(https?:|mailto:)/i.test(url.trim());
}

/**
 * Opens an absolute URL of the charge — a Markdown link, or the URL of
 * `GET /resources/:rid/url` fetched by the owning screen (BR-COU-02, ET-3) — in the in-app
 * browser. Any other scheme is refused: the renderer never opens a `javascript:` link (CL-5).
 */
export async function openExternal(
  url: string,
  options: { readonly open?: BrowserOpener } = {},
): Promise<string> {
  if (!isExternalUrl(url)) throw new Error(`URL externe attendue : ${url.trim().slice(0, 32)}`);
  const trimmed = url.trim();
  const open = options.open ?? installedOpener;
  if (open === null) throw new Error('Aucun navigateur installé : importer src/lib/web-browser.');
  await open(trimmed);
  return trimmed;
}
