// Rendering of a template into HTML and plain text, with its headers and tags (SPEC-204 ET-1,
// ET-4). The one-click unsubscribe headers are added for the `service` category only (ADR-0124).
import { render } from '@react-email/render';
import { createElement } from 'react';

import type { EmailFrame } from '../../emails/layout';
import type { EmailProps, EmailTemplateKey } from '../../emails/schemas';
import type { Tone } from '../../emails/tone';

import { emailConfig } from './config';
import { EMAIL_TEMPLATES } from './templates';
import { createUnsubscribeToken } from './unsubscribe-token';

export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  tags: { name: string; value: string }[];
}

export type RenderedEmail = Omit<EmailMessage, 'to' | 'from'>;

export const UNSUBSCRIBE_PATH = '/api/v1/email/unsubscribe';

export function unsubscribeUrl(appUrl: string, secret: string, userId: string): string {
  return `${appUrl}${UNSUBSCRIBE_PATH}?token=${createUnsubscribeToken(secret, userId)}`;
}

export interface RenderOptions {
  tone: Tone;
  userId: string;
  /** Overrides of the process configuration (tests, preview server). */
  appUrl?: string;
  linkSecret?: string;
}

export async function renderEmail<K extends EmailTemplateKey>(
  key: K,
  props: EmailProps<K>,
  options: RenderOptions,
): Promise<RenderedEmail> {
  const template = EMAIL_TEMPLATES[key];
  const config =
    options.appUrl !== undefined && options.linkSecret !== undefined ? null : emailConfig();
  const appUrl = options.appUrl ?? config?.appUrl ?? '';
  const secret = options.linkSecret ?? config?.linkSecret ?? '';
  const unsubscribe =
    template.category === 'service' ? unsubscribeUrl(appUrl, secret, options.userId) : null;
  const frame: EmailFrame = { tone: options.tone, appUrl, unsubscribeUrl: unsubscribe };
  const element = createElement(template.component, { props, frame });
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  const headers: Record<string, string> = {};
  if (unsubscribe !== null) {
    headers['List-Unsubscribe'] = `<${unsubscribe}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  return {
    subject: template.subject(props, options.tone),
    html,
    text,
    headers,
    tags: [
      { name: 'template', value: key },
      { name: 'category', value: template.category },
    ],
  };
}
