// Common layout of every Learny e-mail (SPEC-204 ET-3, BR-NOT-08, ADR-0124). 600 px wide, page
// background #F4F4F1, white card with a 24 px radius and a #E7E6E1 border, no remote image, no
// tracking pixel. The footer always carries the "Gérer mes notifications" link; `service` e-mails
// add the one-click unsubscribe link.
import type { CSSProperties, ReactNode } from 'react';
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'react-email';

import { t, type Tone } from './tone';

export const EMAIL_COLORS = {
  background: '#F4F4F1',
  card: '#FFFFFF',
  border: '#E7E6E1',
  text: '#111113',
  muted: '#62626B',
  link: '#3A3AA8',
  accent: '#C6F432',
  buttonText: '#FFFFFF',
} as const;

export const FONT_TEXT = "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif";
export const FONT_DISPLAY = "'Space Grotesk', Arial, sans-serif";

export type EmailCategory = 'service' | 'transactional';

/** Rendering context given to every template, next to its validated props. */
export interface EmailFrame {
  tone: Tone;
  /** Absolute origin of the application (`NEXT_PUBLIC_APP_URL`), without trailing slash. */
  appUrl: string;
  /** One-click unsubscribe page; `null` for transactional e-mails (ADR-0032). */
  unsubscribeUrl: string | null;
}

export const PREFERENCES_PATH = '/parametres#notifications';

export const styles = {
  body: {
    margin: 0,
    padding: '32px 16px',
    backgroundColor: EMAIL_COLORS.background,
    fontFamily: FONT_TEXT,
    color: EMAIL_COLORS.text,
    fontSize: '15px',
    lineHeight: '24px',
  },
  card: {
    width: '100%',
    maxWidth: '600px',
    margin: '0 auto',
    backgroundColor: EMAIL_COLORS.card,
    border: `1px solid ${EMAIL_COLORS.border}`,
    borderRadius: '24px',
    padding: '32px',
  },
  logoMark: {
    display: 'inline-block',
    width: '32px',
    height: '32px',
    borderRadius: '10px',
    backgroundColor: EMAIL_COLORS.accent,
    verticalAlign: 'middle',
  },
  logoText: {
    display: 'inline-block',
    marginLeft: '12px',
    fontFamily: FONT_DISPLAY,
    fontSize: '20px',
    fontWeight: 700,
    verticalAlign: 'middle',
    color: EMAIL_COLORS.text,
  },
  title: {
    margin: '28px 0 12px',
    fontFamily: FONT_DISPLAY,
    fontSize: '24px',
    lineHeight: '32px',
    fontWeight: 600,
    color: EMAIL_COLORS.text,
  },
  text: {
    margin: '0 0 16px',
    fontSize: '15px',
    lineHeight: '24px',
    color: EMAIL_COLORS.text,
  },
  muted: {
    margin: '0 0 12px',
    fontSize: '13px',
    lineHeight: '20px',
    color: EMAIL_COLORS.muted,
  },
  button: {
    display: 'inline-block',
    boxSizing: 'border-box',
    minHeight: '44px',
    padding: '14px 22px',
    borderRadius: '12px',
    backgroundColor: EMAIL_COLORS.text,
    color: EMAIL_COLORS.buttonText,
    fontFamily: FONT_TEXT,
    fontSize: '15px',
    lineHeight: '16px',
    fontWeight: 600,
    textDecoration: 'none',
  },
  secondaryButton: {
    display: 'inline-block',
    boxSizing: 'border-box',
    minHeight: '44px',
    padding: '13px 22px',
    borderRadius: '12px',
    border: `1px solid ${EMAIL_COLORS.border}`,
    backgroundColor: EMAIL_COLORS.card,
    color: EMAIL_COLORS.text,
    fontFamily: FONT_TEXT,
    fontSize: '15px',
    lineHeight: '16px',
    fontWeight: 600,
    textDecoration: 'none',
  },
  link: { color: EMAIL_COLORS.link, textDecoration: 'underline' },
  hr: { borderColor: EMAIL_COLORS.border, margin: '28px 0 20px' },
  footer: { margin: '0 0 8px', fontSize: '13px', lineHeight: '20px', color: EMAIL_COLORS.muted },
  list: { margin: '0 0 16px', paddingLeft: '20px' },
  listItem: { margin: '0 0 8px', fontSize: '15px', lineHeight: '24px' },
} satisfies Record<string, CSSProperties>;

export function EmailButton({
  href,
  children,
  secondary = false,
  testId,
}: Readonly<{ href: string; children: ReactNode; secondary?: boolean; testId?: string }>) {
  // A plain anchor keeps the computed styles the visual tests measure (background, radius).
  return (
    <a
      href={href}
      style={secondary ? styles.secondaryButton : styles.button}
      {...(testId === undefined ? {} : { 'data-testid': testId })}
    >
      {children}
    </a>
  );
}

export function EmailLayout({
  frame,
  category,
  preview,
  children,
}: Readonly<{
  frame: EmailFrame;
  category: EmailCategory;
  preview: string;
  children: ReactNode;
}>) {
  const { tone, appUrl } = frame;
  return (
    <Html lang="fr" dir="ltr">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.card}>
          <Section>
            <span data-testid="email-logo" style={styles.logoMark} aria-hidden="true" />
            <span style={styles.logoText}>Learny</span>
          </Section>
          {children}
          <Hr style={styles.hr} />
          <Text style={styles.footer}>
            {t(tone, {
              vous: 'Vous recevez cet e-mail parce que vous avez un compte Learny.',
              tu: 'Tu reçois cet e-mail parce que tu as un compte Learny.',
            })}
          </Text>
          <Text style={styles.footer}>
            <Link
              href={`${appUrl}${PREFERENCES_PATH}`}
              style={styles.link}
              data-testid="email-preferences-link"
            >
              Gérer mes notifications
            </Link>
            {category === 'service' && frame.unsubscribeUrl !== null ? (
              <>
                {' · '}
                <Link href={frame.unsubscribeUrl} style={styles.link}>
                  Se désabonner des e-mails
                </Link>
              </>
            ) : null}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export function EmailTitle({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Heading as="h1" style={styles.title}>
      {children}
    </Heading>
  );
}

export function EmailText({
  children,
  muted = false,
}: Readonly<{ children: ReactNode; muted?: boolean }>) {
  return <Text style={muted ? styles.muted : styles.text}>{children}</Text>;
}

/** Frame of the preview server and the snapshot tests. */
export const PREVIEW_FRAME: EmailFrame = {
  tone: 'vous',
  appUrl: 'http://localhost:3000',
  unsubscribeUrl: 'http://localhost:3000/api/v1/email/unsubscribe?token=apercu',
};
