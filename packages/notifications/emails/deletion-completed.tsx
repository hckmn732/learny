// Account deleted (SPEC-204 EF-3, transactional): sent to the address captured before deletion.
import { fixtureFor } from './fixtures';
import { EmailLayout, EmailText, EmailTitle, PREVIEW_FRAME, type EmailFrame } from './layout';
import type { EmailProps } from './schemas';
import { t, type Tone } from './tone';

export const category = 'transactional' as const;

export function subject(_props: EmailProps<'deletion_completed'>, tone: Tone): string {
  return t(tone, {
    vous: 'Votre compte Learny a été supprimé',
    tu: 'Ton compte Learny a été supprimé',
  });
}

export function preview(): string {
  return 'Merci d’avoir appris avec Learny.';
}

export default function DeletionCompletedEmail({
  props,
  frame,
}: Readonly<{ props: EmailProps<'deletion_completed'>; frame: EmailFrame }>) {
  const { tone } = frame;
  return (
    <EmailLayout frame={frame} category={category} preview={preview()}>
      <EmailTitle>{subject(props, tone)}</EmailTitle>
      <EmailText>
        {t(tone, {
          vous: `Comme demandé le ${props.requestedLabel}, votre compte et toutes vos données ont été supprimés définitivement aujourd’hui. Merci d’avoir appris avec Learny.`,
          tu: `Comme demandé le ${props.requestedLabel}, ton compte et toutes tes données ont été supprimés définitivement aujourd’hui. Merci d’avoir appris avec Learny.`,
        })}
      </EmailText>
    </EmailLayout>
  );
}

DeletionCompletedEmail.PreviewProps = {
  props: fixtureFor('deletion_completed', 'vous'),
  frame: PREVIEW_FRAME,
};
