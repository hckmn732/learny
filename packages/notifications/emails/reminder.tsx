// Reminder e-mail (SPEC-204 EF-3): the notification title and body, already written in the tone
// of the learner by SPEC-209; the template only frames them.
import { fixtureFor } from './fixtures';
import {
  EmailButton,
  EmailLayout,
  EmailText,
  EmailTitle,
  PREVIEW_FRAME,
  type EmailFrame,
} from './layout';
import type { EmailProps } from './schemas';

export const category = 'service' as const;

export const DEFAULT_CTA = 'Ouvrir dans Learny';

export function subject(props: EmailProps<'reminder'>): string {
  return props.title;
}

export function preview(props: EmailProps<'reminder'>): string {
  return props.body;
}

export default function ReminderEmail({
  props,
  frame,
}: Readonly<{ props: EmailProps<'reminder'>; frame: EmailFrame }>) {
  return (
    <EmailLayout frame={frame} category={category} preview={preview(props)}>
      <EmailTitle>{props.title}</EmailTitle>
      <EmailText>{props.body}</EmailText>
      {props.formationTitle !== null ? <EmailText muted>{props.formationTitle}</EmailText> : null}
      <EmailButton href={`${frame.appUrl}${props.href}`} testId="email-cta">
        {props.ctaLabel ?? DEFAULT_CTA}
      </EmailButton>
    </EmailLayout>
  );
}

ReminderEmail.PreviewProps = { props: fixtureFor('reminder', 'vous'), frame: PREVIEW_FRAME };
