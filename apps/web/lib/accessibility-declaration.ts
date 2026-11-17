import fs from 'node:fs';
import path from 'node:path';

// Declaration of accessibility (SPEC-803 EF-10, ADR-0204, ADR-0045). The Markdown template lives
// in apps/web/content/legal so it is versioned with the other legal pages (SPEC-806). Legal
// values come from the validated server configuration; when absent the page shows « [à compléter] »
// and never invents an identity.

export const TO_COMPLETE = '[à compléter]';

/** Date of the audit, aligned with docs/accessibility/audit-v1.md. */
export const ACCESSIBILITY_AUDIT_DATE = '2026-11-17';

/** Every screen family of the responsive matrix, plus the dynamic states of ET-1. */
export const AUDITED_PAGES = [
  'inscription, connexion et vérification',
  'premiers pas',
  'accueil, menu, notifications et compte',
  'nouvelle formation et cadrage',
  'programme, module et cours avec tuteur',
  'exercice pratique',
  'quiz de validation, résultat et remédiation',
  'quiz global',
  'examen blanc, épreuve et résultats',
  'agenda',
  'lacunes',
  'carte des notions et panneau de détail',
  'paramètres',
  'bilan, groupe et invitation',
  'recherche',
  'pages système (introuvable, hors-ligne, accès refusé)',
  'déclaration d’accessibilité',
  'dialogues de confirmation, notifications et états d’erreur des formulaires',
] as const;

export interface LegalIdentity {
  entityName?: string | undefined;
  contactEmail?: string | undefined;
}

function templatePath(): string {
  const candidates = [
    path.join(process.cwd(), 'apps/web/content/legal/accessibilite.md'),
    path.join(process.cwd(), 'content/legal/accessibilite.md'),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (found === undefined) {
    throw new Error('Gabarit de la déclaration d’accessibilité introuvable');
  }
  return found;
}

function valueOrPlaceholder(value: string | undefined): string {
  return value === undefined || value.trim() === '' ? TO_COMPLETE : value;
}

/** Replaces the template placeholders; never invents a legal identity (CL-9). */
export function renderAccessibilityDeclaration(identity: LegalIdentity = {}): string {
  return fs
    .readFileSync(templatePath(), 'utf8')
    .replaceAll('{{AUDIT_DATE}}', ACCESSIBILITY_AUDIT_DATE)
    .replaceAll('{{AUDITED_PAGES}}', AUDITED_PAGES.join(', '))
    .replaceAll('{{LEGAL_ENTITY_NAME}}', valueOrPlaceholder(identity.entityName))
    .replaceAll('{{LEGAL_CONTACT_EMAIL}}', valueOrPlaceholder(identity.contactEmail));
}
