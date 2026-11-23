// Vitest [SPEC-3102] — web hand-off (EF-5, ADR-3002 § 3).
import { describe, expect, it } from 'vitest';

import { fr } from '@learny/i18n';

import { openOnWeb, WEB_CONTINUE_LABEL, webBaseUrl, webUrl } from './web';

describe('[SPEC-3102] renvois « Continuer sur le web »', () => {
  it('compose une URL absolue à partir du chemin interne et de la base configurée (EF-5)', () => {
    expect(webUrl('/formations/nouvelle', 'https://app.learny.fr')).toBe(
      'https://app.learny.fr/formations/nouvelle',
    );
    expect(webUrl('/premiers-pas/ia', 'https://app.learny.fr/')).toBe(
      'https://app.learny.fr/premiers-pas/ia',
    );
  });

  it('refuse un chemin qui n’est pas interne : jamais d’URL externe construite (ADR-3002)', () => {
    expect(() => webUrl('https://evil.example/x', 'https://app.learny.fr')).toThrow();
    expect(() => webUrl('formations', 'https://app.learny.fr')).toThrow();
  });

  it('ouvre le chemin avec le libellé exact « Continuer sur le web » et rend l’URL (EF-5)', async () => {
    const opened: string[] = [];
    const url = await openOnWeb('/formations/nouvelle', {
      baseUrl: 'https://app.learny.fr',
      open: (target) => {
        opened.push(target);
        return Promise.resolve(undefined);
      },
    });
    expect(opened).toEqual(['https://app.learny.fr/formations/nouvelle']);
    expect(url).toBe('https://app.learny.fr/formations/nouvelle');
    expect(WEB_CONTINUE_LABEL).toBe(fr.mobile.shell.web.continue);
    expect(WEB_CONTINUE_LABEL).toBe('Continuer sur le web');
  });

  it('ne renvoie rien quand la configuration est invalide (base vide)', () => {
    // `configResult` du build de test est valide ; la base explicite couvre le cas dégradé.
    expect(webUrl('/x', '')).toBe('/x');
    expect(typeof webBaseUrl()).toBe('string');
  });
});
