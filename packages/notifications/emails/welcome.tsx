// Welcome e-mail (SPEC-204 EF-3), sent once after `user/signed-up` (EF-6).
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

export function subject(): string {
  return 'Bienvenue sur Learny';
}

export function preview(_props: EmailProps<'welcome'>, tone: Tone): string {
  return t(tone, {
    vous: 'Votre compte est prêt : deux minutes de réglages avec le tuteur.',
    tu: 'Ton compte est prêt : deux minutes de réglages avec le tuteur.',
  });
}

export default function WelcomeEmail({
  props,
  frame,
}: Readonly<{ props: EmailProps<'welcome'>; frame: EmailFrame }>) {
  const { tone, appUrl } = frame;
  const greeting =
    props.firstName === null || props.firstName === ''
      ? 'Bienvenue !'
      : `Bienvenue, ${props.firstName} !`;
  return (
    <EmailLayout frame={frame} category={category} preview={preview(props, tone)}>
      <EmailTitle>{greeting}</EmailTitle>
      <EmailText>
        {t(tone, {
          vous: 'Votre compte est prêt. Le tuteur vous attend pour quelques réglages : votre profil, votre rythme et votre IA. Comptez deux minutes.',
          tu: 'Ton compte est prêt. Le tuteur t’attend pour quelques réglages : ton profil, ton rythme et ton IA. Compte deux minutes.',
        })}
      </EmailText>
      <ul style={{ margin: '0 0 24px', paddingLeft: '20px' }}>
        <li style={{ margin: '0 0 8px' }}>
          {t(tone, {
            vous: 'Des cours construits à partir de vos propres ressources, sources citées',
            tu: 'Des cours construits à partir de tes propres ressources, sources citées',
          })}
        </li>
        <li style={{ margin: '0 0 8px' }}>Des révisions espacées pour ne pas oublier</li>
        <li style={{ margin: '0 0 8px' }}>
          {t(tone, {
            vous: 'Gratuit avec votre propre clé d’IA',
            tu: 'Gratuit avec ta propre clé d’IA',
          })}
        </li>
      </ul>
      <EmailButton href={`${appUrl}/premiers-pas/profil`} testId="email-cta">
        Continuer mes premiers pas
      </EmailButton>
    </EmailLayout>
  );
}

WelcomeEmail.PreviewProps = { props: fixtureFor('welcome', 'vous'), frame: PREVIEW_FRAME };
