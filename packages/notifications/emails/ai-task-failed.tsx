// AI task failure (SPEC-204 EF-3): the personal model produced invalid content twice.
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

export function subject(props: EmailProps<'ai_task_failed'>): string {
  return `Le tuteur n’a pas pu terminer : ${props.taskLabel}`;
}

export function preview(props: EmailProps<'ai_task_failed'>, tone: Tone): string {
  return t(tone, {
    vous: `La tâche est arrêtée, rien n’a été modifié. Choisissez un autre modèle.`,
    tu: `La tâche est arrêtée, rien n’a été modifié. Choisis un autre modèle.`,
  });
}

export default function AiTaskFailedEmail({
  props,
  frame,
}: Readonly<{ props: EmailProps<'ai_task_failed'>; frame: EmailFrame }>) {
  const { tone, appUrl } = frame;
  return (
    <EmailLayout frame={frame} category={category} preview={preview(props, tone)}>
      <EmailTitle>{subject(props)}</EmailTitle>
      <EmailText>
        {t(tone, {
          vous: `Le modèle ${props.modelLabel} de votre clé a produit un contenu invalide deux fois de suite pour « ${props.subject} ». La tâche est arrêtée, rien n’a été modifié.`,
          tu: `Le modèle ${props.modelLabel} de ta clé a produit un contenu invalide deux fois de suite pour « ${props.subject} ». La tâche est arrêtée, rien n’a été modifié.`,
        })}
      </EmailText>
      <EmailText>
        {t(tone, {
          vous: `Choisissez un autre modèle de votre clé${props.managedAvailable ? ' ou utilisez l’IA fournie.' : '.'}`,
          tu: `Choisis un autre modèle de ta clé${props.managedAvailable ? ' ou utilise l’IA fournie.' : '.'}`,
        })}
      </EmailText>
      <EmailButton href={`${appUrl}/parametres#modeles`} testId="email-cta">
        Choisir un modèle
      </EmailButton>
    </EmailLayout>
  );
}

AiTaskFailedEmail.PreviewProps = {
  props: fixtureFor('ai_task_failed', 'vous'),
  frame: PREVIEW_FRAME,
};
