import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { HtmlValidate } from 'html-validate';
import { describe, expect, it } from 'vitest';

// Mail templates of Supabase Auth (SPEC-202 ET-7, §14): valid HTML, French, the right link.
const root = resolve(import.meta.dirname, '../../../..');
const validator = new HtmlValidate({
  extends: ['html-validate:recommended'],
  // Mail clients ignore style sheets and rely on layout tables with legacy attributes: those
  // conventions are deliberate, structural validity (tags, attributes, ids) is still checked.
  rules: {
    'no-inline-style': 'off',
    'no-trailing-whitespace': 'off',
    'no-deprecated-attr': 'off',
    'prefer-tbody': 'off',
    'presentation-role-style': 'off',
    'void-style': 'off',
    'doctype-style': 'off',
    'wcag/h30': 'off',
  },
});

const TEMPLATES = [
  {
    file: 'magic-link.html',
    type: 'magiclink',
    button: 'Me connecter',
    sentence: 'Il est valable 1 heure et ne fonctionne qu’une fois.',
  },
  {
    file: 'confirmation.html',
    type: 'signup',
    button: 'Confirmer mon adresse',
    sentence: 'le lien est valable 1 heure.',
  },
] as const;

describe('[SPEC-202] gabarits des e-mails', () => {
  it.each(TEMPLATES)('$file is valid HTML', async ({ file }) => {
    const report = await validator.validateString(
      readFileSync(resolve(root, 'supabase/templates', file), 'utf8'),
    );
    expect(
      report.results.flatMap((result) => result.messages.map((m) => `${m.ruleId}: ${m.message}`)),
    ).toEqual([]);
  });

  it.each(TEMPLATES)(
    '$file carries the French copy, the verification link and the footer',
    ({ file, type, button, sentence }) => {
      const html = readFileSync(resolve(root, 'supabase/templates', file), 'utf8');
      expect(html).toContain('<html lang="fr">');
      expect(html).toContain(sentence);
      expect(html).toContain(`>${button}</a>`);
      expect(html).toContain(
        `{{ .SiteURL }}/api/v1/auth/callback?token_hash={{ .TokenHash }}&amp;type=${type}`,
      );
      expect(html).toContain('Vous n’êtes pas à l’origine de cette demande ? Ignorez ce message.');
      expect(html).toContain('{{ .SiteURL }}/parametres#notifications');
      expect(html).toContain('Gérer mes notifications');
      // Button: black #111113, white text, 12 px radius (SPEC-202 ET-7).
      expect(html).toContain('background:#111113;color:#FFFFFF;border-radius:12px');
      // No remote image, no tracking pixel.
      expect(html).not.toMatch(/<img\b/i);
    },
  );

  it('declares the two templates and their subjects in supabase/config.toml', () => {
    const config = readFileSync(resolve(root, 'supabase/config.toml'), 'utf8');
    expect(config).toContain('subject = "Votre lien de connexion à Learny"');
    expect(config).toContain('content_path = "./supabase/templates/magic-link.html"');
    expect(config).toContain('subject = "Confirmez votre adresse e-mail"');
    expect(config).toContain('content_path = "./supabase/templates/confirmation.html"');
    expect(config).toMatch(/minimum_password_length = 12\b/);
    expect(config).toMatch(/\[auth\.email\][^[]*enable_confirmations = true/s);
    expect(config).toMatch(/otp_expiry = 3600\b/);
    expect(config).toMatch(/max_frequency = "60s"/);
  });
});
