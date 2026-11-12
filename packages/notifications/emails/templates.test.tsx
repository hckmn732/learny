// Templates of the e-mail service (SPEC-204 §12): the 8 × 2 renderings, the preferences link of
// BR-NOT-08, the plain-text snapshots, the lexical control of the `tu` tone (CL-9) and the
// escaping of injected content (CL-7).
import { describe, expect, it } from 'vitest';

import { fixtureFor, FIXTURE_USER } from '../emails/fixtures';
import { EMAIL_TEMPLATE_KEYS, type EmailProps, type EmailTemplateKey } from '../emails/schemas';
import { TONES, type Tone } from '../emails/tone';
import { renderEmail, UNSUBSCRIBE_PATH } from '../src/email/render';
import { EMAIL_TEMPLATES } from '../src/email/templates';

const APP_URL = 'https://learny.example';
const LINK_SECRET = 'learny-test-only-email-link-secret-000000';
const USER_ID = '3f9a2f0e-1c4b-4c5d-8e9f-0a1b2c3d4e5f';

const SUBJECTS: Record<EmailTemplateKey, Record<Tone, string>> = {
  welcome: { vous: 'Bienvenue sur Learny', tu: 'Bienvenue sur Learny' },
  daily_digest: {
    vous: 'Votre programme du mercredi 11 novembre',
    tu: 'Ton programme du mercredi 11 novembre',
  },
  reminder: {
    vous: 'Quiz de validation à 14:00',
    tu: 'Quiz de validation à 14:00',
  },
  weekly_review: {
    vous: 'Votre bilan de la semaine du 2 novembre au 8 novembre',
    tu: 'Ton bilan de la semaine du 2 novembre au 8 novembre',
  },
  ai_task_failed: {
    vous: 'Le tuteur n’a pas pu terminer : rédaction du cours',
    tu: 'Le tuteur n’a pas pu terminer : rédaction du cours',
  },
  export_ready: { vous: 'Votre export Learny est prêt', tu: 'Ton export Learny est prêt' },
  deletion_scheduled: {
    vous: 'Suppression de votre compte programmée le vendredi 11 décembre 2026',
    tu: 'Suppression de ton compte programmée le vendredi 11 décembre 2026',
  },
  deletion_completed: {
    vous: 'Votre compte Learny a été supprimé',
    tu: 'Ton compte Learny a été supprimé',
  },
};

const CATEGORIES: Record<EmailTemplateKey, 'service' | 'transactional'> = {
  welcome: 'service',
  daily_digest: 'service',
  reminder: 'service',
  weekly_review: 'service',
  ai_task_failed: 'service',
  export_ready: 'transactional',
  deletion_scheduled: 'transactional',
  deletion_completed: 'transactional',
};

function render(key: EmailTemplateKey, tone: Tone) {
  return renderEmail(key, fixtureFor(key, tone) as EmailProps<EmailTemplateKey>, {
    tone,
    userId: USER_ID,
    appUrl: APP_URL,
    linkSecret: LINK_SECRET,
  });
}

describe('[SPEC-204] gabarits', () => {
  it('CA-1 — les 8 gabarits se rendent dans les 2 tons, en HTML et en texte', async () => {
    expect(EMAIL_TEMPLATE_KEYS).toHaveLength(8);
    for (const key of EMAIL_TEMPLATE_KEYS) {
      expect(EMAIL_TEMPLATES[key].category).toBe(CATEGORIES[key]);
      for (const tone of TONES) {
        const rendered = await render(key, tone);
        expect(rendered.html, `${key}/${tone} HTML`).toContain('<!DOCTYPE html');
        expect(rendered.html, `${key}/${tone} langue`).toContain('lang="fr"');
        expect(rendered.text.trim(), `${key}/${tone} texte`).not.toBe('');
        // Plain text, not a stripped HTML fragment.
        expect(rendered.text, `${key}/${tone} texte brut`).not.toContain('<div');
        expect(rendered.text, `${key}/${tone} texte brut`).not.toContain('<table');
        expect(rendered.subject).toBe(SUBJECTS[key][tone]);
      }
    }
  });

  it('CA-1 / BR-NOT-08 — le pied contient toujours « Gérer mes notifications »', async () => {
    for (const key of EMAIL_TEMPLATE_KEYS) {
      for (const tone of TONES) {
        const rendered = await render(key, tone);
        expect(rendered.text, `${key}/${tone}`).toContain('Gérer mes notifications');
        expect(rendered.html, `${key}/${tone}`).toContain(`${APP_URL}/parametres#notifications`);
      }
    }
  });

  it('CA-2 — List-Unsubscribe seulement sur les e-mails de service', async () => {
    for (const key of EMAIL_TEMPLATE_KEYS) {
      const rendered = await render(key, 'vous');
      if (CATEGORIES[key] === 'service') {
        expect(rendered.headers['List-Unsubscribe'], key).toMatch(
          new RegExp(`^<${APP_URL}${UNSUBSCRIBE_PATH}\\?token=[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+>$`),
        );
        expect(rendered.headers['List-Unsubscribe-Post'], key).toBe('List-Unsubscribe=One-Click');
        expect(rendered.text, key).toContain('Se désabonner des e-mails');
      } else {
        expect(rendered.headers['List-Unsubscribe'], key).toBeUndefined();
        expect(rendered.headers['List-Unsubscribe-Post'], key).toBeUndefined();
        expect(rendered.text, key).not.toContain('Se désabonner des e-mails');
      }
      expect(rendered.tags).toEqual([
        { name: 'template', value: key },
        { name: 'category', value: CATEGORIES[key] },
      ]);
    }
  });

  it('CA-3 — aucune variante tu ne contient « vous », « votre » ou « vos »', async () => {
    for (const key of EMAIL_TEMPLATE_KEYS) {
      const rendered = await render(key, 'tu');
      expect(rendered.text, `${key}/tu`).not.toMatch(/\b(vous|votre|vos)\b/i);
      expect(rendered.subject, `${key}/tu`).not.toMatch(/\b(vous|votre|vos)\b/i);
      // The same templates in `vous` do use the polite form: the control is not vacuous.
      if (key !== 'reminder') {
        expect((await render(key, 'vous')).text, `${key}/vous`).toMatch(/\b(vous|votre|vos)\b/i);
      }
    }
  });

  it('CL-7 — le contenu injecté est échappé par React', async () => {
    const props = {
      ...fixtureFor('daily_digest', 'vous'),
      activities: [
        {
          time: '09:00',
          title: '<script>alert(1)</script>',
          detail: 'Détail <b>gras</b>',
          formationTitle: 'Formation <img src=x onerror=alert(1)>',
        },
      ],
    };
    const rendered = await renderEmail('daily_digest', props, {
      tone: 'vous',
      userId: USER_ID,
      appUrl: APP_URL,
      linkSecret: LINK_SECRET,
    });
    expect(rendered.html).not.toContain('<script>alert(1)</script>');
    expect(rendered.html).not.toContain('<img src=x');
    expect(rendered.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(rendered.text).toContain('<script>alert(1)</script>');
  });

  it('CL-4 — prénom absent : « Bienvenue ! » et « Bonjour, » sans espace superflu', async () => {
    const welcome = await renderEmail(
      'welcome',
      { firstName: null },
      { tone: 'vous', userId: USER_ID, appUrl: APP_URL, linkSecret: LINK_SECRET },
    );
    expect(welcome.html).toContain('Bienvenue !');
    expect(welcome.html).not.toContain('Bienvenue, ');

    const digest = await renderEmail(
      'daily_digest',
      { ...fixtureFor('daily_digest', 'vous'), firstName: null },
      { tone: 'vous', userId: USER_ID, appUrl: APP_URL, linkSecret: LINK_SECRET },
    );
    expect(digest.html).toContain('Bonjour,');
    expect(digest.html).not.toContain('Bonjour ,');
  });

  it('CL-8 — 20 activités sont toutes listées', async () => {
    const activities = Array.from({ length: 20 }, (_, index) => ({
      time: `${String(9 + Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`,
      title: `Activité ${String(index + 1)}`,
      detail: 'Détail',
      formationTitle: FIXTURE_USER.formationTitle,
    }));
    const rendered = await renderEmail(
      'daily_digest',
      { ...fixtureFor('daily_digest', 'vous'), activities },
      { tone: 'vous', userId: USER_ID, appUrl: APP_URL, linkSecret: LINK_SECRET },
    );
    for (const activity of activities) {
      expect(rendered.text).toContain(activity.title);
    }
  });

  it('instantanés texte des 16 combinaisons', async () => {
    for (const key of EMAIL_TEMPLATE_KEYS) {
      for (const tone of TONES) {
        const rendered = await render(key, tone);
        expect(rendered.text).toMatchSnapshot(`${key} ${tone}`);
      }
    }
  });
});
