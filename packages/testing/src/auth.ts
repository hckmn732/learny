// Authentication helpers for tests (SPEC-202 §8 step 7): read the mails sent by Supabase Auth in the
// Mailpit bundled with the Supabase CLI, extract the link they carry, and sign a browser in.
import { execFileSync } from 'node:child_process';

import type { BrowserContext } from '@playwright/test';

import type { TestSession } from './supabase';

export interface MailMessage {
  id: string;
  subject: string;
  to: string;
  html: string;
  text: string;
}

let cachedUrl: string | undefined;

/** Mailpit of the local stack: `MAILPIT_URL`, else the one reported by `supabase status`. */
export function mailpitUrl(env: Record<string, string | undefined> = process.env): string {
  if (env.MAILPIT_URL) return env.MAILPIT_URL.replace(/\/+$/, '');
  if (cachedUrl !== undefined) return cachedUrl;
  let url = 'http://127.0.0.1:54324';
  try {
    const output = execFileSync('supabase', ['status', '-o', 'env'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const match = /^MAILPIT_URL="?([^"\n]+)"?$/m.exec(output);
    if (match?.[1] !== undefined) url = match[1];
  } catch {
    // keep the default local port
  }
  cachedUrl = url;
  return url;
}

interface SearchResponse {
  messages: { ID: string; Subject: string; To: { Address: string }[] }[];
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`Mailpit ${String(response.status)} sur ${url}`);
  return (await response.json()) as T;
}

/** Messages addressed to `to`, newest first. */
export async function listMail(to: string): Promise<MailMessage[]> {
  const base = mailpitUrl();
  const found = await getJson<SearchResponse>(
    `${base}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
  );
  const messages: MailMessage[] = [];
  for (const entry of found.messages) {
    const full = await getJson<{ HTML: string; Text: string }>(
      `${base}/api/v1/message/${entry.ID}`,
    );
    messages.push({
      id: entry.ID,
      subject: entry.Subject,
      to: entry.To[0]?.Address ?? to,
      html: full.HTML,
      text: full.Text,
    });
  }
  return messages;
}

export async function mailCount(to: string): Promise<number> {
  return (await listMail(to)).length;
}

/** Waits for the newest message to `to` (optionally with a given subject). */
export async function waitForMail(
  to: string,
  options: { subject?: string; timeoutMs?: number } = {},
): Promise<MailMessage> {
  const deadline = performance.now() + (options.timeoutMs ?? 10_000);
  for (;;) {
    const match = (await listMail(to)).find(
      (message) => options.subject === undefined || message.subject === options.subject,
    );
    if (match !== undefined) return match;
    if (performance.now() > deadline) {
      throw new Error(
        `Aucun message pour ${to}${options.subject ? ` (« ${options.subject} »)` : ''}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

export function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

/** The authentication link of a message, as a URL (HTML entities decoded). */
export function extractAuthLink(message: MailMessage): URL {
  const match = /href="([^"]*\/api\/v1\/auth\/callback\?[^"]+)"/.exec(message.html);
  if (match?.[1] === undefined) throw new Error('Aucun lien d’authentification dans le message');
  return new URL(decodeHtmlEntities(match[1]));
}

/** The same link, pointed at another origin (the e2e server listens on its own port). */
export function linkOnOrigin(link: URL, origin: string): string {
  const target = new URL(link.pathname + link.search, origin);
  return target.toString();
}

/** Signs a browser context in with the cookies of a test session. */
export async function signInAs(
  context: BrowserContext,
  baseURL: string,
  session: Pick<TestSession, 'cookies'>,
): Promise<void> {
  await context.addCookies(session.cookies.map((cookie) => ({ ...cookie, url: baseURL })));
}
