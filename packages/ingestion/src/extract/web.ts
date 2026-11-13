// Web page extractor (SPEC-510 EF-1, ET-2, CA-1; ADR-0057).
//
// `safeFetch` retrieves the page with its anti-SSRF guard, 15 s and 5 MB bounds and robots.txt;
// `linkedom` + Readability isolate the main article; the text is rebuilt block by block with the
// exact character range and nearest anchor of every block. Navigation, headers and footers are
// never copied. The result is validated by the `WebExtraction` contract before it leaves.
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';

import { WebExtraction, type WebAnchor } from '@learny/contracts';
import {
  safeFetch,
  type AddressLookup,
  type SafeFetchResult,
  type SafeFetchTransport,
} from '@learny/core/net';

import { IngestionError } from '../errors';

import { WEB_LIMITS, RemoteUrlInput, remoteError } from './remote';
import type { ExtractedContent } from './types';

const SKIP_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'canvas',
  'iframe',
  'form',
  'nav',
  'header',
  'footer',
  'aside',
]);

const BLOCK_TAGS = new Set([
  'address',
  'article',
  'blockquote',
  'dd',
  'details',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'li',
  'main',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
]);

const MAX_TEXT_CHARACTERS = 2_000_000;

export interface WebFetchResult {
  /** Final URL after redirects. */
  url: string;
  contentType: string | null;
  body: Uint8Array;
}

export type WebFetcher = (url: string) => Promise<WebFetchResult>;

export interface WebExtractionOptions {
  /** Test/demonstration seam; the production fetcher is `safeWebFetcher`. */
  fetcher?: WebFetcher;
  lookup?: AddressLookup;
  transport?: SafeFetchTransport;
  /** ADR-0159 point 7 — only the local fixture server of the tests uses it. */
  allowPrivate?: boolean;
  respectRobots?: boolean;
  timeoutMs?: number;
  maxBytes?: number;
}

/** Default fetcher: every guard of ADR-0159 is on, and the caller cannot weaken it. */
export function safeWebFetcher(options: WebExtractionOptions = {}): WebFetcher {
  return async (url) => {
    let result: SafeFetchResult;
    try {
      result = await safeFetch(url, {
        timeoutMs: options.timeoutMs ?? WEB_LIMITS.timeoutMs,
        maxBytes: options.maxBytes ?? WEB_LIMITS.maxBytes,
        maxRedirects: WEB_LIMITS.maxRedirects,
        ...(options.lookup === undefined ? {} : { lookup: options.lookup }),
        ...(options.transport === undefined ? {} : { transport: options.transport }),
        ...(options.allowPrivate === undefined ? {} : { allowPrivate: options.allowPrivate }),
        ...(options.respectRobots === undefined ? {} : { respectRobots: options.respectRobots }),
      });
    } catch (error) {
      throw remoteError(error, 'FETCH_FAILED');
    }
    return { url: result.url, contentType: result.contentType, body: result.body };
  };
}

interface Block {
  text: string;
  anchor: string | undefined;
}

function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function clamp(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

function hasBlockDescendant(element: Element): boolean {
  for (const child of element.children) {
    const tag = child.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) continue;
    if (BLOCK_TAGS.has(tag) || hasBlockDescendant(child)) return true;
  }
  return false;
}

function collectBlocks(root: Element): Block[] {
  const blocks: Block[] = [];

  const walk = (node: Element, inheritedAnchor: string | undefined): void => {
    const tag = node.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;
    const ownId = cleanText(node.getAttribute('id'));
    const name = cleanText(node.getAttribute('name'));
    const anchor = ownId !== '' ? ownId : tag === 'a' && name !== '' ? name : inheritedAnchor;

    if (BLOCK_TAGS.has(tag) && !hasBlockDescendant(node)) {
      const text = cleanText(node.textContent);
      if (text !== '') blocks.push({ text, anchor });
      return;
    }
    if (BLOCK_TAGS.has(tag) && node.children.length === 0) {
      const text = cleanText(node.textContent);
      if (text !== '') blocks.push({ text, anchor });
      return;
    }
    for (const child of node.children) walk(child, anchor);
  };

  for (const child of root.children) walk(child, undefined);
  return blocks;
}

/** Groups consecutive blocks sharing an anchor into one exact source location. */
function contentOfBlocks(blocks: readonly Block[]): ExtractedContent {
  let text = '';
  const locations: ExtractedContent['locations'] = [];
  let current: ExtractedContent['locations'][number] | null = null;
  let currentAnchor: string | undefined;

  for (const block of blocks) {
    if (text !== '') text += '\n\n';
    const charStart = text.length;
    text += block.text;
    const charEnd = text.length;
    if (current !== null && block.anchor === currentAnchor && block.anchor !== undefined) {
      current.charEnd = charEnd;
      continue;
    }
    current = {
      charStart,
      charEnd,
      ...(block.anchor === undefined ? {} : { anchor: block.anchor }),
    };
    currentAnchor = block.anchor;
    locations.push(current);
  }

  return { text, pages: null, locations };
}

function anchorsOf(root: Element): WebAnchor[] {
  const seen = new Set<string>();
  const anchors: WebAnchor[] = [];
  for (const element of root.querySelectorAll('[id], a[name]')) {
    const id =
      cleanText(element.getAttribute('id')) ||
      (element.tagName.toLowerCase() === 'a' ? cleanText(element.getAttribute('name')) : '');
    if (id === '' || seen.has(id)) continue;
    seen.add(id);
    const text = cleanText(element.textContent).slice(0, 500);
    anchors.push({ id: clamp(id, 200), ...(text === '' ? {} : { text }) });
  }
  return anchors;
}

function metaContent(document: Document, selector: string): string {
  return cleanText(document.querySelector(selector)?.getAttribute('content'));
}

export interface WebExtractedDocument {
  extraction: WebExtraction;
  content: ExtractedContent;
}

/**
 * ET-2, CA-1 — extracts `{title, text, anchors, sourceUrl}` and the located content used by the
 * passage pipeline. Navigation, headers and footers are skipped block by block.
 */
export async function extractWebDocument(
  url: string,
  options: WebExtractionOptions = {},
): Promise<WebExtractedDocument> {
  const input = RemoteUrlInput.safeParse({ url });
  if (!input.success) {
    throw new IngestionError('URL_INVALID', 'Cette adresse web n’est pas valide.');
  }

  const fetcher = options.fetcher ?? safeWebFetcher(options);
  let page: WebFetchResult;
  try {
    page = await fetcher(input.data.url);
  } catch (error) {
    throw remoteError(error, 'FETCH_FAILED');
  }

  const type = page.contentType?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (type !== 'text/html' && type !== 'application/xhtml+xml') {
    throw new IngestionError(
      'WEB_UNSUPPORTED_CONTENT',
      'Cette adresse ne renvoie pas une page web lisible : seules les pages HTML sont acceptées.',
    );
  }

  let html: string;
  try {
    html = new TextDecoder('utf-8', { fatal: false }).decode(page.body);
  } catch (error) {
    throw new IngestionError('WEB_EMPTY_TEXT', 'Cette page n’a pas pu être décodée.', {
      cause: error,
    });
  }

  let document: Document;
  let article: ReturnType<Readability['parse']>;
  try {
    ({ document } = parseHTML(html) as unknown as { document: Document });
    article = new Readability(document).parse();
  } catch (error) {
    throw new IngestionError(
      'WEB_EMPTY_TEXT',
      'Le contenu principal de cette page n’a pas pu être isolé.',
      { cause: error },
    );
  }

  const title = clamp(
    cleanText(article?.title) || cleanText(document.title) || new URL(page.url).hostname,
    200,
  );
  if (title === '') {
    throw new IngestionError('WEB_EMPTY_TEXT', 'Cette page ne contient aucun titre lisible.');
  }

  let contentDocument: Document;
  try {
    ({ document: contentDocument } = parseHTML(
      article?.content ?? document.body.innerHTML,
    ) as unknown as { document: Document });
  } catch (error) {
    throw new IngestionError('WEB_EMPTY_TEXT', 'Cette page ne contient aucun texte lisible.', {
      cause: error,
    });
  }

  const articleRoot =
    contentDocument.body.children.length > 0
      ? contentDocument.body
      : contentDocument.documentElement;
  const blocks = collectBlocks(articleRoot);
  if (blocks.length === 0) {
    throw new IngestionError('WEB_EMPTY_TEXT', 'Cette page ne contient aucun texte principal.');
  }
  const content = contentOfBlocks(blocks);
  if (content.text.length > MAX_TEXT_CHARACTERS) {
    throw new IngestionError(
      'WEB_TOO_LARGE',
      'Le texte de cette page dépasse la limite de 2 millions de caractères.',
    );
  }

  const siteName =
    cleanText(article?.siteName) || metaContent(document, 'meta[property="og:site_name"]');
  const language =
    cleanText(article?.lang) || cleanText(document.documentElement.getAttribute('lang'));

  const extraction = {
    title,
    text: content.text,
    anchors: anchorsOf(articleRoot),
    sourceUrl: page.url,
    ...(siteName === '' ? {} : { siteName: clamp(siteName, 200) }),
    ...(language === '' ? {} : { language: clamp(language, 35) }),
  };
  const parsed = WebExtraction.safeParse(extraction);
  if (!parsed.success) {
    throw new IngestionError(
      'WEB_EMPTY_TEXT',
      'Le contenu extrait de cette page ne respecte pas le contrat attendu.',
      { cause: parsed.error },
    );
  }
  return {
    extraction: parsed.data,
    content: {
      ...content,
      title,
      metadata: {
        ...(siteName === '' ? {} : { siteName: clamp(siteName, 200) }),
        ...(language === '' ? {} : { language: clamp(language, 35) }),
      },
      contentOrigin: 'source',
    },
  };
}

/** ET-2 — the contract-only entry point used by callers that do not need the passage offsets. */
export async function extractWeb(
  url: string,
  options: WebExtractionOptions = {},
): Promise<WebExtraction> {
  return (await extractWebDocument(url, options)).extraction;
}
