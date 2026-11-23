// Web links of the mobile application (SPEC-3102 EF-5, ADR-3002 § 3).
//
// Every entry point that is out of the mobile scope opens the corresponding web page in the
// in-app browser (`expo-web-browser`), with the label « Continuer sur le web ». The base URL is
// `EXPO_PUBLIC_WEB_URL`, validated at start-up with the other public variables (SPEC-3001 ET-5).
import * as WebBrowser from 'expo-web-browser';

import { fr } from '@learny/i18n';

import { configResult } from '../config';

/** Label of every web hand-off (ADR-3002 § 3). */
export const WEB_CONTINUE_LABEL: string = fr.mobile.shell.web.continue;

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

/** Opens `path` in the browser sheet; the injected opener keeps the unit tests free of native code. */
export type BrowserOpener = (url: string) => Promise<unknown>;

export async function openOnWeb(
  path: string,
  options: { readonly baseUrl?: string; readonly open?: BrowserOpener } = {},
): Promise<string> {
  const baseUrl = options.baseUrl ?? webBaseUrl();
  const url = webUrl(path, baseUrl);
  const open = options.open ?? ((target: string) => WebBrowser.openBrowserAsync(target));
  await open(url);
  return url;
}
