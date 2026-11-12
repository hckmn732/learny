// Daily programme (SPEC-204 EF-3), sent by SPEC-209 at the digest time of the learner.
import { Link } from 'react-email';

import { fixtureFor } from './fixtures';
import {
  EmailButton,
  EmailLayout,
  EmailText,
  EmailTitle,
  PREVIEW_FRAME,
  styles,
  type EmailFrame,
} from './layout';
import type { EmailProps } from './schemas';
import { t, type Tone } from './tone';

export const category = 'service' as const;

export function subject(props: EmailProps<'daily_digest'>, tone: Tone): string {
  return t(tone, {
    vous: `Votre programme du ${props.dateLabel}`,
    tu: `Ton programme du ${props.dateLabel}`,
  });
}

export function preview(props: EmailProps<'daily_digest'>, tone: Tone): string {
  if (props.activities.length === 0) return 'Aucune activité prévue aujourd’hui.';
  return t(tone, {
    vous: `${String(props.activities.length)} activités, ${props.plannedLabel} prévues.`,
    tu: `${String(props.activities.length)} activités, ${props.plannedLabel} prévues.`,
  });
}

export default function DailyDigestEmail({
  props,
  frame,
}: Readonly<{ props: EmailProps<'daily_digest'>; frame: EmailFrame }>) {
  const { tone, appUrl } = frame;
  const greeting =
    props.firstName === null || props.firstName === '' ? 'Bonjour,' : `Bonjour ${props.firstName},`;
  const count = props.activities.length;
  return (
    <EmailLayout frame={frame} category={category} preview={preview(props, tone)}>
      <EmailTitle>{greeting}</EmailTitle>
      {count === 0 ? (
        <EmailText>
          {t(tone, {
            vous: 'Aucune activité prévue aujourd’hui. Un quiz global de 5 minutes garde vos notions au chaud.',
            tu: 'Aucune activité prévue aujourd’hui. Un quiz global de 5 minutes garde tes notions au chaud.',
          })}
        </EmailText>
      ) : (
        <>
          <EmailText>
            {t(tone, {
              vous: `Voici vos ${String(count)} activités du jour, toutes formations confondues : ${props.plannedLabel} prévues.`,
              tu: `Voici tes ${String(count)} activités du jour, toutes formations confondues : ${props.plannedLabel} prévues.`,
            })}
          </EmailText>
          <ul style={styles.list} data-testid="email-activities">
            {props.activities.map((activity, index) => (
              <li key={`${activity.time}-${String(index)}`} style={styles.listItem}>
                <strong>{`${activity.time} · ${activity.title}`}</strong>
                <br />
                <span style={{ color: '#62626B', fontSize: '13px' }}>
                  {`${activity.detail} · ${activity.formationTitle}`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {props.globalQuiz !== null ? (
        <EmailText>
          {`Quiz global : ${String(props.globalQuiz.notions)} notions à revoir, environ ${String(props.globalQuiz.minutes)} min.`}
        </EmailText>
      ) : null}
      {props.held !== null ? (
        <>
          <EmailText>
            <strong>En attente dans l’application</strong>
          </EmailText>
          <EmailText>
            {t(tone, {
              vous: `${String(props.held.count)} notification(s) n’ont pas été envoyée(s) hier pour respecter votre limite de ${String(props.held.maxPerDay)} par jour :`,
              tu: `${String(props.held.count)} notification(s) n’ont pas été envoyée(s) hier pour respecter ta limite de ${String(props.held.maxPerDay)} par jour :`,
            })}
          </EmailText>
          <ul style={styles.list}>
            {props.held.titles.map((title, index) => (
              <li key={`${title}-${String(index)}`} style={styles.listItem}>
                {title}
              </li>
            ))}
          </ul>
          <EmailText>
            <Link href={`${appUrl}/accueil?notifications=ouvertes`} style={styles.link}>
              Ouvrir les notifications
            </Link>
          </EmailText>
        </>
      ) : null}
      <EmailButton href={`${appUrl}/accueil`} testId="email-cta">
        Ouvrir ma journée
      </EmailButton>
    </EmailLayout>
  );
}

DailyDigestEmail.PreviewProps = { props: fixtureFor('daily_digest', 'vous'), frame: PREVIEW_FRAME };
