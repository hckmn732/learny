import { describe, expect, it } from 'vitest';

import {
  ACCESSIBILITY_AUDIT_DATE,
  AUDITED_PAGES,
  renderAccessibilityDeclaration,
  TO_COMPLETE,
} from '../../lib/accessibility-declaration';

describe('[SPEC-803] déclaration d’accessibilité', () => {
  it('remplace les variables légales fournies par la configuration', () => {
    const markdown = renderAccessibilityDeclaration({
      entityName: 'Learny SAS',
      contactEmail: 'accessibilite@learny.test',
    });
    expect(markdown).toContain('Éditeur : Learny SAS.');
    expect(markdown).toContain('accessibilite@learny.test');
    expect(markdown).not.toContain('{{LEGAL_ENTITY_NAME}}');
    expect(markdown).not.toContain('{{LEGAL_CONTACT_EMAIL}}');
    expect(markdown).toContain(ACCESSIBILITY_AUDIT_DATE);
  });

  it('affiche « [à compléter] » quand l’identité légale est absente (CL-9)', () => {
    const markdown = renderAccessibilityDeclaration();
    expect(markdown).toContain(`Éditeur : ${TO_COMPLETE}.`);
    expect(markdown).toContain(TO_COMPLETE);
    expect(markdown).not.toContain('Learny SAS');
  });

  it('contient les sections d’EF-10 dans l’ordre attendu', () => {
    const markdown = renderAccessibilityDeclaration();
    const sections = [
      '## État de conformité',
      '## Résultats des tests',
      '## Contenus non accessibles',
      '## Établissement de cette déclaration',
      '## Retour d’information et contact',
      '## Voies de recours',
    ];
    const positions = sections.map((section) => markdown.indexOf(section));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(markdown).toContain('partiellement conforme');
    expect(markdown).toContain('Défenseur des droits');
    expect(markdown).toContain('Libre réponse 71120, 75342 Paris CEDEX 07');
    expect(AUDITED_PAGES.length).toBeGreaterThan(10);
  });
});
