// Account deletion scheduled (SPEC-204 EF-3, transactional, ADR-0044): effective in 30 days,
// cancelled by signing in again.
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
import { t, type Tone } from './tone';

export const category = 'transactional' as const;

export function subject(props: EmailProps<'deletion_scheduled'>, tone: Tone): string {
  return t(tone, {
    vous: `Suppression de votre compte programmée le ${props.scheduledLabel}`,
    tu: `Suppression de ton compte programmée le ${props.scheduledLabel}`,
  });
}

export function preview(props: EmailProps<'deletion_scheduled'>, tone: Tone): string {
  return t(tone, {
    vous: `Effective le ${props.scheduledLabel} ; annulable à tout moment en vous reconnectant.`,
    tu: `Effective le ${props.scheduledLabel} ; annulable à tout moment en te reconnectant.`,
  });
}

export default function DeletionScheduledEmail({
  props,
  frame,
}: Readonly<{ props: EmailProps<'deletion_scheduled'>; frame: EmailFrame }>) {
  const { tone, appUrl } = frame;
  return (
    <EmailLayout frame={frame} category={category} preview={preview(props, tone)}>
      <EmailTitle>{subject(props, tone)}</EmailTitle>
      <EmailText>
        {t(tone, {
          vous: `Vous avez demandé la suppression de votre compte. Elle sera effective le ${props.scheduledLabel} : formations, apports, cours, résultats et réglages seront alors effacés définitivement.`,
          tu: `Tu as demandé la suppression de ton compte. Elle sera effective le ${props.scheduledLabel} : formations, apports, cours, résultats et réglages seront alors effacés définitivement.`,
        })}
      </EmailText>
      <EmailText>
        {t(tone, {
          vous: 'D’ici là, vous pouvez l’annuler à tout moment : il suffit de vous reconnecter.',
          tu: 'D’ici là, tu peux l’annuler à tout moment : il suffit de te reconnecter.',
        })}
      </EmailText>
      <EmailButton href={`${appUrl}/parametres#profil`} testId="email-cta">
        Annuler la suppression
      </EmailButton>{' '}
      <EmailButton href={`${appUrl}/parametres#profil`} secondary>
        Exporter mes données
      </EmailButton>
    </EmailLayout>
  );
}

DeletionScheduledEmail.PreviewProps = {
  props: fixtureFor('deletion_scheduled', 'vous'),
  frame: PREVIEW_FRAME,
};
