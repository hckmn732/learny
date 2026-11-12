// Export ready (SPEC-204 EF-3, transactional, ADR-0044): signed link valid for seven days.
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

export function subject(_props: EmailProps<'export_ready'>, tone: Tone): string {
  return t(tone, { vous: 'Votre export Learny est prêt', tu: 'Ton export Learny est prêt' });
}

export function preview(props: EmailProps<'export_ready'>): string {
  return `Archive de ${props.sizeLabel}, lien valable 7 jours.`;
}

export default function ExportReadyEmail({
  props,
  frame,
}: Readonly<{ props: EmailProps<'export_ready'>; frame: EmailFrame }>) {
  const { tone } = frame;
  return (
    <EmailLayout frame={frame} category={category} preview={preview(props)}>
      <EmailTitle>{subject(props, tone)}</EmailTitle>
      <EmailText>
        {t(tone, {
          vous: `Votre archive (${props.sizeLabel}) est prête. Le lien de téléchargement est valable 7 jours, jusqu’au ${props.expiresLabel}.`,
          tu: `Ton archive (${props.sizeLabel}) est prête. Le lien de téléchargement est valable 7 jours, jusqu’au ${props.expiresLabel}.`,
        })}
      </EmailText>
      <EmailButton href={props.downloadUrl} testId="email-cta">
        Télécharger mes données
      </EmailButton>
      <EmailText muted>
        <br />
        {t(tone, {
          vous: 'Ce lien est personnel : ne le transférez pas.',
          tu: 'Ce lien est personnel : ne le transfère pas.',
        })}
      </EmailText>
    </EmailLayout>
  );
}

ExportReadyEmail.PreviewProps = { props: fixtureFor('export_ready', 'vous'), frame: PREVIEW_FRAME };
