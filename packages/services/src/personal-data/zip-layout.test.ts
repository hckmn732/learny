import { describe, expect, it } from 'vitest';

import {
  archiveSlug,
  buildArchiveEntries,
  buildSettingsJson,
  formatLongDate,
  formatSizeLabel,
  moduleFolder,
  normalizeArchiveName,
} from './zip-layout';

const NOW = new Date('2026-11-11T12:20:00Z');

function namesOf(...entries: Parameters<typeof buildArchiveEntries>[0][]): string[] {
  return entries.flatMap((model) => buildArchiveEntries(model).map((entry) => entry.name));
}

describe("[SPEC-211] arborescence de l'export", () => {
  it('CA-1 — slugs, numérotation des modules et fichiers fixes', () => {
    expect(archiveSlug('SAP S/4HANA — Finance')).toBe('sap-s-4hana-finance');
    expect(archiveSlug('Élève')).toBe('eleve');
    expect(moduleFolder(1, 'Comptabilité générale')).toBe('01-comptabilite-generale');
    expect(moduleFolder(12, 'Module')).toBe('12-module');

    const names = buildArchiveEntries({
      readme: 'README',
      settings: { profile: {} },
      results: {},
      conversations: {},
      formations: [
        {
          title: 'SAP S/4HANA Finance',
          programme: { formation: { title: 'SAP' } },
          modules: [
            {
              position: 1,
              title: 'Comptabilité générale',
              courseMarkdown: '# Cours\n',
              apports: [{ name: 'Guide FI.pdf', storagePath: 'user/resource/Guide FI.pdf' }],
            },
          ],
        },
      ],
    }).map((entry) => entry.name);

    expect(names).toEqual([
      'README.txt',
      'settings.json',
      'results.json',
      'conversations.json',
      'formations/sap-s-4hana-finance/programme.json',
      'formations/sap-s-4hana-finance/01-comptabilite-generale/cours.md',
      'apports/sap-s-4hana-finance/01-comptabilite-generale/Guide FI.pdf',
    ]);
  });

  it('CA-1 — collisions suffixées -2 puis -3, sans écraser un fichier', () => {
    const names = namesOf({
      readme: '',
      settings: {},
      results: {},
      conversations: {},
      formations: [
        {
          title: 'Formation',
          programme: {},
          modules: [
            {
              position: 1,
              title: 'Module',
              courseMarkdown: null,
              apports: [
                { name: 'notes.txt', text: 'a' },
                { name: 'notes.txt', text: 'b' },
                { name: 'notes.txt', text: 'c' },
              ],
            },
          ],
        },
      ],
    });
    expect(names).toContain('apports/formation/01-module/notes.txt');
    expect(names).toContain('apports/formation/01-module/notes-2.txt');
    expect(names).toContain('apports/formation/01-module/notes-3.txt');
    expect(new Set(names).size).toBe(names.length);
  });

  it('CL-10 — un nom hostile reste dans apports/', () => {
    expect(normalizeArchiveName('../../etc/passwd')).toBe('etc-passwd');
    expect(normalizeArchiveName('..\\..\\windows\\system32')).toBe('windows-system32');
    expect(normalizeArchiveName('a\u0000b.txt')).toBe('ab.txt');
    expect(normalizeArchiveName('')).toBe('fichier');
    expect(normalizeArchiveName('C:secret?.pdf')).toBe('C-secret-.pdf');
    const names = namesOf({
      readme: '',
      settings: {},
      results: {},
      conversations: {},
      formations: [
        {
          title: 'Formation',
          programme: {},
          modules: [
            {
              position: 1,
              title: 'Module',
              courseMarkdown: null,
              apports: [{ name: '../../etc/passwd', text: 'x' }],
            },
          ],
        },
      ],
    });
    expect(names).toContain('apports/formation/01-module/etc-passwd');
    expect(names.every((name) => !name.includes('..') && !name.startsWith('/'))).toBe(true);
  });

  it('CA-1 — settings.json ne contient ni clé d’IA ni secret', () => {
    const settings = buildSettingsJson({
      profile: { email: 'eleve@test.learny.test', timezone: 'Europe/Paris' },
      studyPreferences: { hoursPerDay: 2 },
      notificationSettings: { channelEmail: true },
      automations: [
        { key: 'reprise', enabled: true, params: { apiKey: 'secret', nested: { token: 'x' } } },
      ],
    });
    const serialised = JSON.stringify(settings);
    expect(serialised).not.toContain('apiKey');
    expect(serialised).not.toContain('token');
    expect(serialised).toContain('eleve@test.learny.test');
    expect(settings.automations).toEqual([
      { key: 'reprise', enabled: true, params: { nested: {} } },
    ]);
  });

  it('CA-1 — taille et date locales de l’e-mail', () => {
    expect(formatSizeLabel(12_400_000)).toBe('12,4 Mo');
    expect(formatSizeLabel(1024)).toBe('1 Ko');
    expect(formatSizeLabel(980)).toBe('980 o');
    expect(formatLongDate(new Date('2026-11-18T12:20:00Z'), 'Europe/Paris')).toBe(
      'mercredi 18 novembre à 13:20',
    );
    expect(formatLongDate(NOW, 'Europe/Paris')).toBe('mercredi 11 novembre à 13:20');
  });
});
