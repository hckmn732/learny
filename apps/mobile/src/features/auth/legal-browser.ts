// Opening of the legal pages in the integrated browser (SPEC-3101 BR-PLA-06).
//
// The CGU and the privacy policy are web pages reached without any session: the application only
// hands their absolute URL to the in-app browser of the platform (`expo-web-browser`), which
// keeps the learner inside Learny and needs no connection.
import * as WebBrowser from 'expo-web-browser';

import { configResult } from '../../config';

export type LegalDocument = 'cgu' | 'confidentialite';

/** Absolute URL of a legal page of the web application; `null` when the build has no web URL. */
export function legalPageUrl(document: LegalDocument): string | null {
  if (!configResult.ok) return null;
  return `${configResult.config.webUrl}/legal/${document}`;
}

/** Opens the legal page in the integrated browser (BR-PLA-06); no session is required. */
export async function openLegalPage(document: LegalDocument): Promise<void> {
  const url = legalPageUrl(document);
  if (url === null) return;
  await WebBrowser.openBrowserAsync(url);
}
