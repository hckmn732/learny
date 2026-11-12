// Registry of the eight templates (SPEC-204 ET-1): category, props schema, subject and component.
import type { ComponentType } from 'react';
import type { z } from 'zod';

import * as aiTaskFailed from '../../emails/ai-task-failed';
import * as dailyDigest from '../../emails/daily-digest';
import * as deletionCompleted from '../../emails/deletion-completed';
import * as deletionScheduled from '../../emails/deletion-scheduled';
import * as exportReady from '../../emails/export-ready';
import type { EmailCategory, EmailFrame } from '../../emails/layout';
import * as reminder from '../../emails/reminder';
import { EMAIL_PROPS_SCHEMAS, type EmailProps, type EmailTemplateKey } from '../../emails/schemas';
import type { Tone } from '../../emails/tone';
import * as weeklyReview from '../../emails/weekly-review';
import * as welcome from '../../emails/welcome';

export interface EmailTemplateDefinition<K extends EmailTemplateKey> {
  category: EmailCategory;
  propsSchema: z.ZodType<EmailProps<K>>;
  subject: (props: EmailProps<K>, tone: Tone) => string;
  preview: (props: EmailProps<K>, tone: Tone) => string;
  component: ComponentType<{ props: EmailProps<K>; frame: EmailFrame }>;
}

type Module<K extends EmailTemplateKey> = {
  category: EmailCategory;
  subject: (props: EmailProps<K>, tone: Tone) => string;
  preview: (props: EmailProps<K>, tone: Tone) => string;
  default: ComponentType<{ props: EmailProps<K>; frame: EmailFrame }>;
};

function define<K extends EmailTemplateKey>(key: K, module: Module<K>): EmailTemplateDefinition<K> {
  return {
    category: module.category,
    propsSchema: EMAIL_PROPS_SCHEMAS[key] as unknown as z.ZodType<EmailProps<K>>,
    subject: module.subject,
    preview: module.preview,
    component: module.default,
  };
}

export const EMAIL_TEMPLATES: { [K in EmailTemplateKey]: EmailTemplateDefinition<K> } = {
  welcome: define('welcome', welcome),
  daily_digest: define('daily_digest', dailyDigest),
  reminder: define('reminder', reminder),
  weekly_review: define('weekly_review', weeklyReview),
  ai_task_failed: define('ai_task_failed', aiTaskFailed),
  export_ready: define('export_ready', exportReady),
  deletion_scheduled: define('deletion_scheduled', deletionScheduled),
  deletion_completed: define('deletion_completed', deletionCompleted),
};

export function templateOf<K extends EmailTemplateKey>(key: K): EmailTemplateDefinition<K> {
  return EMAIL_TEMPLATES[key];
}
