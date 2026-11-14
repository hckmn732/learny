// Unit tests of the demonstration fixtures (SPEC-115 §12, CA-1, CA-2, CA-4, CL-4, CL-5).
// Pure: no database. The mockups are read, never modified; a changed mockup without a fixture
// update fails the correspondence test (CL-4).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  allDemoSources,
  DEMO_AGENDA,
  DEMO_AGENDA_DAYS,
  DEMO_AUTOMATION_ACTIONS,
  DEMO_DAILY_ACTIVITY,
  DEMO_EXPECTED,
  DEMO_FORMATIONS,
  DEMO_LOCAL_TIME,
  DEMO_NOTIFICATIONS,
  DEMO_NOTION_LINKS,
  DEMO_NOTIFICATION_SETTINGS,
  DEMO_NOW_ISO,
  DEMO_PROFILE,
  DEMO_TIME_ZONE,
  DEMO_USERS,
  demoFixtureFingerprint,
  demoFormationId,
  demoId,
  demoModuleId,
  demoNotionId,
  demoUserId,
  parisInstant,
  SAP_CHAPTER_COUNT,
  SAP_MODULE_COUNT,
  SAP_NOTION_COUNT,
} from './demo-fixtures';
import { assertDemoEnvironment, demoNow, describeSeedFailure } from './demo-guard';

const MAQUETTES = fileURLToPath(new URL('../../../../design/maquettes/', import.meta.url));

function mockup(file: string): string {
  return readFileSync(`${MAQUETTES}${file}`, 'utf8');
}

describe('[SPEC-115] demo fixtures', () => {
  it('CA-1 — les UUID v5 sont stables, distincts et réservés à la démonstration', () => {
    const alex = demoUserId('alex');
    expect(alex).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(demoUserId('alex')).toBe(alex);
    expect(demoUserId('camille')).not.toBe(alex);
    expect(demoFormationId('sap')).not.toBe(demoFormationId('agile'));
    expect(demoModuleId('sap', 3)).not.toBe(demoModuleId('sap', 2));
    expect(demoNotionId('sap:m3:c2:n4')).toBe(demoId('notion', 'sap:m3:c2:n4'));

    const ids = [
      ...DEMO_USERS.map((user) => demoUserId(user.key)),
      ...DEMO_FORMATIONS.map((formation) => demoFormationId(formation.key)),
      ...DEMO_FORMATIONS.flatMap((formation) =>
        formation.modules.flatMap((module) => [
          demoModuleId(formation.key, module.position),
          ...module.notions.map((notion) => demoNotionId(notion.key)),
        ]),
      ),
    ];
    expect(new Set(ids).size).toBe(ids.length);

    expect(DEMO_PROFILE.userId).toBe(alex);
    expect(DEMO_PROFILE.timezone).toBe('Europe/Paris');
    expect(demoUserId('alex')).toBe('3b69c7a7-b1f5-597a-b199-999de11ffdfd');
  });

  it('CA-1 — trois comptes fictifs, domaine réservé, aucun mot de passe', () => {
    expect(DEMO_USERS).toHaveLength(3);
    expect(DEMO_USERS.map((user) => user.key)).toEqual(['alex', 'camille', 'hugo']);
    for (const user of DEMO_USERS) {
      expect(user.email.endsWith('@demo.learny.test')).toBe(true);
      expect(user.firstName.length).toBeGreaterThan(0);
      expect(user.lastName.length).toBeGreaterThan(0);
    }
    const serialized = JSON.stringify({ DEMO_USERS, DEMO_PROFILE });
    expect(serialized).not.toMatch(/password|mot de passe|secret|api[_-]?key/i);
  });

  it('CA-1 — SAP possède 7 modules, 24 chapitres et 48 notions', () => {
    const sap = DEMO_FORMATIONS[0];
    expect(sap?.title).toBe('SAP S/4HANA Finance');
    expect(sap?.status).toBe('active');
    expect(SAP_MODULE_COUNT).toBe(7);
    expect(SAP_CHAPTER_COUNT).toBe(24);
    expect(SAP_NOTION_COUNT).toBe(48);
    expect(DEMO_EXPECTED.sapModules).toBe(7);
    expect(DEMO_EXPECTED.sapNotions).toBe(48);

    const positions = sap?.modules.map((module) => module.position) ?? [];
    expect(positions).toEqual([1, 2, 3, 4, 5, 6, 7]);

    const labels = sap?.modules.flatMap((module) => module.notions.map((notion) => notion.label));
    expect(labels).toHaveLength(48);
    expect(new Set(labels).size).toBe(48);
    expect(labels).toEqual(expect.arrayContaining(['Clé de comptabilisation', 'Type de pièce']));
  });

  it('CA-1 — cinq formations, trois actives ou proposées et deux terminées', () => {
    expect(DEMO_FORMATIONS).toHaveLength(5);
    expect(
      DEMO_FORMATIONS.filter(
        (formation) => formation.status === 'active' || formation.status === 'programme_proposed',
      ).map((formation) => formation.title),
    ).toEqual([
      'SAP S/4HANA Finance',
      'Gestion de projet agile',
      "Python pour l'analyse de données",
    ]);
    expect(
      DEMO_FORMATIONS.filter((formation) => formation.status === 'completed').map(
        (formation) => formation.title,
      ),
    ).toEqual(["Excel pour l'analyse financière", 'Anglais professionnel B2']);
    expect(DEMO_FORMATIONS[2]?.modules).toHaveLength(8);
    expect(DEMO_FORMATIONS[1]?.group).toBe(true);
    expect(DEMO_FORMATIONS[3]?.maintenanceMode).toBe('light');
    expect(DEMO_FORMATIONS[4]?.maintenanceMode).toBe('stopped');
  });

  it('CA-1 — quatre lacunes et quatorze notions à revoir, cohérentes avec la carte', () => {
    const sap = DEMO_FORMATIONS[0];
    const notions = sap?.modules.flatMap((module) => module.notions) ?? [];
    const gaps = notions.filter((notion) => notion.gap !== undefined);
    const inReview = notions.filter((notion) => notion.inReview === true);
    expect(gaps).toHaveLength(4);
    expect(gaps.map((notion) => notion.label)).toEqual([
      'Variante d’exercice',
      'Clé de comptabilisation',
      'Équilibre d’une pièce',
      'Ledgers parallèles',
    ]);
    expect(gaps.map((notion) => notion.gap?.nature)).toEqual([
      'forgetting',
      'confusion',
      'application',
      'misunderstanding',
    ]);
    expect(inReview).toHaveLength(14);
    expect(DEMO_EXPECTED.dueNotions).toBe(18);
    expect(DEMO_EXPECTED.reviewNotions).toBe(14);
    expect(DEMO_EXPECTED.gaps).toBe(4);
    expect(DEMO_NOTION_LINKS).toHaveLength(59);
    expect(DEMO_NOTION_LINKS.filter((link) => link.personal)).toHaveLength(5);
  });

  it('CA-1 — agenda du 9 au 13 novembre, 22 créneaux et statuts visibles', () => {
    expect(DEMO_AGENDA_DAYS.map((day) => day.date)).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
    ]);
    expect(DEMO_AGENDA).toHaveLength(22);
    expect(DEMO_EXPECTED.agendaSlots).toBe(23);
    expect(DEMO_EXPECTED.agendaDays).toBe(5);
    expect(DEMO_AGENDA.filter((slot) => slot.status === 'done')).toHaveLength(10);
    expect(DEMO_AGENDA.some((slot) => slot.kind === 'buffer' && slot.title.includes('Marge'))).toBe(
      true,
    );
    expect(DEMO_AGENDA.filter((slot) => slot.formation === 'agile')).toHaveLength(2);
    for (const slot of DEMO_AGENDA) {
      expect(slot.start < slot.end).toBe(true);
      expect(slot.source.screen).toBe('SCR-12');
    }
  });

  it('CA-1 — notifications et journal d’automatismes conformes aux maquettes', () => {
    expect(DEMO_NOTIFICATIONS).toHaveLength(8);
    expect(DEMO_EXPECTED.unreadNotifications).toBe(3);
    expect(DEMO_NOTIFICATIONS.filter((notification) => !notification.read)).toHaveLength(3);
    expect(DEMO_NOTIFICATIONS[0]?.title).toBe('Quiz de validation à 14:00');
    expect(DEMO_NOTIFICATIONS[0]?.body).toContain('tentative 2');
    expect(DEMO_NOTIFICATIONS[7]?.title).toBe('Bilan de la semaine');
    expect(DEMO_AUTOMATION_ACTIONS).toHaveLength(7);
    expect(DEMO_AUTOMATION_ACTIONS[0]?.status).toBe('pending_consent');
    expect(DEMO_AUTOMATION_ACTIONS[0]?.requiresConsent).toBe(true);
    expect(DEMO_AUTOMATION_ACTIONS[3]?.summary).toContain('18 notions étaient dues : 4 reportées');
    expect(DEMO_DAILY_ACTIVITY).toHaveLength(12);
    expect(DEMO_DAILY_ACTIVITY.at(-1)?.day).toBe('2026-11-11');
  });

  it('CA-4 / CL-5 — l’instant figé est 13:20 à Paris, pas seulement la date UTC', () => {
    const now = demoNow({ CLOCK_FIXED_AT: DEMO_NOW_ISO });
    expect(now.toISOString()).toBe('2026-11-11T12:20:00.000Z');
    const local = new Intl.DateTimeFormat('fr-FR', {
      timeZone: DEMO_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);
    expect(local).toBe(DEMO_LOCAL_TIME);
    expect(parisInstant('2026-11-11', '13:20')).toBe('2026-11-11T12:20:00.000Z');
    expect(parisInstant('2026-11-11', '09:00')).toBe('2026-11-11T08:00:00.000Z');
    expect(parisInstant('2026-11-13', '17:30')).toBe('2026-11-13T16:30:00.000Z');
    expect(DEMO_NOTIFICATION_SETTINGS.quietStart).toBe('21:00:00');
    expect(DEMO_NOTIFICATION_SETTINGS.quietEnd).toBe('08:00:00');
  });

  it('CA-4 / CL-4 — chaque valeur critique cite un écran et une maquette existante', () => {
    const sources = allDemoSources();
    expect(sources.length).toBeGreaterThan(30);
    for (const { label, source } of sources) {
      expect(source.screen, label).toMatch(/^(SCR-\d{2}|fixture)$/);
      expect(source.file.endsWith('.dc.html'), label).toBe(true);
      expect(existsSync(`${MAQUETTES}${source.file}`), `${label} → ${source.file}`).toBe(true);
      expect(source.element.length, label).toBeGreaterThan(3);
    }
  });

  it('CA-4 / CL-4 — les titres et nombres du programme correspondent à Programme.dc.html', () => {
    const html = mockup('Programme.dc.html');
    const modules = [...html.matchAll(/n: \d+, titre: '([^']+)'/g)].map((match) => match[1]);
    expect(modules).toHaveLength(7);
    expect(modules).toEqual(DEMO_FORMATIONS[0]?.modules.map((module) => module.title));
    const chapterBlocks = [...html.matchAll(/chapitres: \[(.*?)\]/g)].map((match) =>
      [...(match[1] ?? '').matchAll(/'([^']+)'/g)].map((entry) => entry[1]),
    );
    const chapters = chapterBlocks.flat();
    expect(chapters).toHaveLength(24);
    expect(chapters).toEqual(
      DEMO_FORMATIONS[0]?.modules.flatMap((module) =>
        module.chapters.map((chapter) => chapter.title),
      ),
    );
    expect(html).toContain('7 modules');
    expect(html).toContain('24 chapitres');
    expect(html).toContain('150 h');
    expect(html).toContain('6 semaines');
    expect(html).toContain('80 %');
  });

  it('CA-4 / CL-4 — les 48 notions et leurs maîtrises correspondent à Carte.dc.html', () => {
    const html = mockup('Carte.dc.html');
    const block = /const N = \[(.*?)\n {4}\];/s.exec(html)?.[1];
    expect(block).toBeDefined();
    const rows = [
      ...(block ?? '').matchAll(/\['[^']+', '([^']+)', 'm\d', (null|\d+)(?:, '([^']+)')?\]/g),
    ].map((match) => ({
      label: match[1],
      mastery: match[2] === 'null' ? null : Number(match[2]),
      gap: match[3] ?? null,
    }));
    expect(rows).toHaveLength(48);
    const notions = DEMO_FORMATIONS[0]?.modules.flatMap((module) => module.notions) ?? [];
    expect(notions).toHaveLength(48);
    const byLabel = new Map(rows.map((row) => [row.label, row]));
    for (const notion of notions) {
      const row = byLabel.get(notion.label);
      expect(row, notion.label).toBeDefined();
      expect(row?.mastery, notion.label).toBe(notion.mastery);
    }
    expect(rows.map((row) => row.label).sort()).toEqual(
      notions.map((notion) => notion.label).sort(),
    );
    expect(notions.map((notion) => notion.mastery).filter((value) => value === null)).toHaveLength(
      21,
    );
    expect(rows.filter((row) => row.gap !== null).map((row) => row.gap)).toEqual([
      'Oubli',
      'Confusion',
      'Difficulté d’application',
      'Incompréhension',
    ]);
  });

  it('CA-4 / CL-4 — l’agenda, les notifications et les paramètres correspondent aux maquettes', () => {
    const main = mockup('Main.dc.html');
    for (const text of [
      'SAP S/4HANA Finance',
      'Gestion de projet agile',
      "Python pour l'analyse de données",
      "Excel pour l'analyse financière",
      'Anglais professionnel B2',
      '38 %',
      '83 %',
      '0 %',
      '88 %',
      '82 %',
      '12 jours',
      '14 notions',
      '3 formations',
      '13 h',
      '86 %',
      'Vous avez tout lu',
    ]) {
      expect(main, text).toContain(text);
    }
    for (const notification of DEMO_NOTIFICATIONS) {
      expect(main, notification.title).toContain(notification.title);
      expect(main, notification.body).toContain(notification.body);
    }

    const agenda = mockup('Agenda.dc.html');
    const week2 = /const week2 = \[(.*?)\n {4}\]\.map/s.exec(agenda)?.[1] ?? '';
    expect([...week2.matchAll(/id: '/g)]).toHaveLength(22);
    for (const slot of DEMO_AGENDA) {
      expect(agenda, slot.title).toContain(slot.title);
      expect(agenda, slot.meta).toContain(slot.meta);
    }

    const parametres = mockup('Parametres.dc.html');
    for (const text of [
      'Europe/Paris (UTC+1)',
      '21:00 – 08:00',
      ' h par jour',
      'Diagnostic au retour',
    ]) {
      expect(parametres, text).toContain(text);
    }
  });

  it('CA-2 — la garde refuse production, preview et tout hôte distant', () => {
    expect(assertDemoEnvironment({ APP_ENV: 'local' }).databaseUrl).toContain('127.0.0.1');
    expect(assertDemoEnvironment({ APP_ENV: 'test' }).fixedAt).toBe(DEMO_NOW_ISO);
    expect(() => assertDemoEnvironment({ APP_ENV: 'production' })).toThrow(/refusée/);
    expect(() => assertDemoEnvironment({ APP_ENV: 'preview' })).toThrow(/refusée/);
    expect(() =>
      assertDemoEnvironment({
        APP_ENV: 'local',
        DATABASE_URL: 'postgresql://learny:secret@db.example.com:5432/postgres',
      }),
    ).toThrow(/ni local ni de test/);
    expect(() =>
      assertDemoEnvironment({ APP_ENV: 'local', DATABASE_URL: 'mysql://127.0.0.1/learny' }),
    ).toThrow(/PostgreSQL/);
    expect(
      assertDemoEnvironment({
        APP_ENV: 'test',
        DATABASE_URL: 'postgresql://postgres:postgres@db.test:5432/postgres',
      }).databaseUrl,
    ).toContain('db.test');
  });

  it('CL-2 — une table absente produit un message nommant la dépendance', () => {
    const message = describeSeedFailure({
      code: '42P01',
      message: 'relation "public.notions" does not exist',
    });
    expect(message).toContain('dépendance manquante');
    expect(message).toContain('public.notions');
    expect(message).toContain('transaction est annulée');
    expect(describeSeedFailure({ code: '23514', message: 'seed_check_failed' })).toContain(
      'contrainte de cohérence',
    );
  });

  it('CL-1 / CA-2 — l’empreinte des fixtures est stable', () => {
    const first = demoFixtureFingerprint();
    const second = demoFixtureFingerprint();
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });
});
