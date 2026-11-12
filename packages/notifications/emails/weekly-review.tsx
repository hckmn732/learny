// Weekly review (SPEC-204 EF-3): three figures and three paragraphs, from the "Bilan de la
// semaine" card of the mockups.
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

export const category = 'service' as const;

export function subject(props: EmailProps<'weekly_review'>, tone: Tone): string {
  return t(tone, {
    vous: `Votre bilan de la semaine du ${props.periodStartLabel} au ${props.periodEndLabel}`,
    tu: `Ton bilan de la semaine du ${props.periodStartLabel} au ${props.periodEndLabel}`,
  });
}

export function preview(props: EmailProps<'weekly_review'>): string {
  return `${props.studyLabel} d’étude, ${String(props.atRiskCount)} notions à risque.`;
}

const figureStyle = {
  display: 'inline-block',
  width: '33%',
  verticalAlign: 'top',
  fontFamily: "'Space Grotesk', Arial, sans-serif",
  fontSize: '22px',
  lineHeight: '28px',
  fontWeight: 600,
} as const;

export default function WeeklyReviewEmail({
  props,
  frame,
}: Readonly<{ props: EmailProps<'weekly_review'>; frame: EmailFrame }>) {
  const { tone, appUrl } = frame;
  const retention =
    props.retentionPercent === null
      ? '— % retenu à 1 mois'
      : `${String(props.retentionPercent)} % retenu à 1 mois`;
  return (
    <EmailLayout frame={frame} category={category} preview={preview(props)}>
      <EmailTitle>
        {t(tone, {
          vous: `Votre bilan du ${props.periodStartLabel} au ${props.periodEndLabel}`,
          tu: `Ton bilan du ${props.periodStartLabel} au ${props.periodEndLabel}`,
        })}
      </EmailTitle>
      <div style={{ margin: '0 0 24px' }} data-testid="email-figures">
        <span style={figureStyle}>{`${props.studyLabel} d’étude`}</span>
        <span style={figureStyle}>{retention}</span>
        <span style={figureStyle}>{`${String(props.atRiskCount)} notions à risque`}</span>
      </div>
      <EmailText>{`Réussi : ${props.succeeded}`}</EmailText>
      <EmailText>
        {t(tone, {
          vous: `À risque d’oubli : ${props.atRisk}. Ils passent dans vos prochains quiz globaux.`,
          tu: `À risque d’oubli : ${props.atRisk}. Ils passent dans tes prochains quiz globaux.`,
        })}
      </EmailText>
      <EmailText>{`Cette semaine : ${props.nextWeek}`}</EmailText>
      <EmailText>
        {t(tone, {
          vous: 'Vos disponibilités changent-elles ?',
          tu: 'Tes disponibilités changent-elles ?',
        })}
      </EmailText>
      <EmailButton href={`${appUrl}/accueil`} testId="email-cta">
        Voir le bilan
      </EmailButton>{' '}
      <EmailButton href={`${appUrl}/parametres#profil`} secondary>
        Mes disponibilités changent
      </EmailButton>
    </EmailLayout>
  );
}

WeeklyReviewEmail.PreviewProps = {
  props: fixtureFor('weekly_review', 'vous'),
  frame: PREVIEW_FRAME,
};
