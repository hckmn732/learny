import { describe, expect, it } from 'vitest';

import {
  REFERENCE_NOW,
  SAP_AVAILABILITY,
  SAP_CHAPTERS,
  SAP_FORMATION,
  SAP_GAPS_AT_REFERENCE,
  SAP_LINKS,
  SAP_MASTERY_AT_REFERENCE,
  SAP_MODULES,
  SAP_NOTIONS,
} from './sap-reference';

describe('[SPEC-401] jeu de référence SAP', () => {
  it('contient 7 modules, 24 chapitres et 48 notions (CA-6)', () => {
    expect(SAP_MODULES).toHaveLength(7);
    expect(SAP_CHAPTERS).toHaveLength(24);
    expect(SAP_NOTIONS).toHaveLength(48);
    expect(new Set(SAP_MODULES.map((module) => module.moduleId)).size).toBe(7);
    expect(new Set(SAP_CHAPTERS.map((chapter) => chapter.chapterId)).size).toBe(24);
    expect(new Set(SAP_NOTIONS.map((notion) => notion.notionId)).size).toBe(48);
  });

  it('rattache chaque notion à exactement un chapitre de son module (CA-6)', () => {
    for (const notion of SAP_NOTIONS) {
      const module = SAP_MODULES.find((candidate) => candidate.moduleId === notion.moduleId);
      expect(module, notion.notionId).toBeDefined();
      const chapter = module?.chapters.find(
        (candidate) => candidate.chapterId === notion.chapterId,
      );
      expect(chapter, notion.notionId).toBeDefined();
      expect(chapter?.moduleId).toBe(notion.moduleId);
      expect(module?.position).toBe(notion.modulePosition);
    }
  });

  it('applique le rattachement explicite du module 3', () => {
    const module = SAP_MODULES.find((candidate) => candidate.position === 3);
    expect(module?.title).toBe('Comptabilité générale');
    const byChapter = new Map<string, string[]>();
    for (const notion of SAP_NOTIONS.filter((candidate) => candidate.moduleId === 'sap-m3')) {
      byChapter.set(notion.chapterId, [
        ...(byChapter.get(notion.chapterId) ?? []),
        notion.notionId,
      ]);
    }
    expect(byChapter.get('sap-m3-c1')?.sort()).toEqual(['n-compte', 'n-partie']);
    expect(byChapter.get('sap-m3-c2')?.sort()).toEqual([
      'n-cle',
      'n-dates',
      'n-entete',
      'n-equilibre',
      'n-piece',
      'n-poste',
      'n-type',
    ]);
    expect(byChapter.get('sap-m3-c3')).toEqual(['n-acdoca']);
    expect(byChapter.get('sap-m3-c4')).toEqual(['n-ledgers']);
  });

  it('décrit les modules de la maquette', () => {
    expect(SAP_MODULES.map((module) => module.moduleId)).toEqual([
      'sap-m1',
      'sap-m2',
      'sap-m3',
      'sap-m4',
      'sap-m5',
      'sap-m6',
      'sap-m7',
    ]);
    expect(SAP_MODULES.map((module) => module.chapters.length)).toEqual([3, 3, 4, 4, 4, 3, 3]);
    expect(SAP_MODULES.map((module) => module.hours)).toEqual([15, 10, 25, 25, 25, 25, 25]);
    expect(SAP_MODULES.every((module) => module.threshold === 80)).toBe(true);
    expect(SAP_FORMATION).toMatchObject({
      formationId: 'sap',
      title: 'SAP S/4HANA Finance',
      startDate: '2026-11-02',
      endDate: '2026-12-11',
      objectives: ['operational', 'exam'],
      tz: 'Europe/Paris',
    });
    expect(SAP_AVAILABILITY).toEqual({
      hoursPerDay: 5,
      studyDays: [1, 2, 3, 4, 5],
      preferredSlots: ['matin', 'apres_midi'],
    });
  });

  it('ne crée aucun lien réflexif et garde les 59 liens de la maquette', () => {
    expect(SAP_LINKS).toHaveLength(59);
    expect(SAP_LINKS.every((link) => link.fromNotionId !== link.toNotionId)).toBe(true);
    const ids = new Set(SAP_NOTIONS.map((notion) => notion.notionId));
    for (const link of SAP_LINKS) {
      expect(ids.has(link.fromNotionId), link.fromNotionId).toBe(true);
      expect(ids.has(link.toNotionId), link.toNotionId).toBe(true);
    }
    expect(SAP_LINKS.filter((link) => link.kind === 'confusion')).toHaveLength(1);
    expect(SAP_LINKS.filter((link) => link.kind === 'tutor')).toHaveLength(4);
    expect(SAP_LINKS.filter((link) => link.kind === 'prerequisite')).toHaveLength(54);
  });

  it('reprend la maîtrise et les quatre lacunes de la carte', () => {
    expect(Object.keys(SAP_MASTERY_AT_REFERENCE)).toHaveLength(48);
    expect(SAP_MASTERY_AT_REFERENCE['n-cle']).toBe(35);
    expect(SAP_MASTERY_AT_REFERENCE['n-ledgers']).toBe(28);
    expect(SAP_MASTERY_AT_REFERENCE['n-equilibre']).toBe(55);
    expect(SAP_MASTERY_AT_REFERENCE['n-variante']).toBe(60);
    expect(SAP_MASTERY_AT_REFERENCE['n-fourn']).toBeNull();
    expect(SAP_GAPS_AT_REFERENCE).toEqual([
      { notionId: 'n-variante', nature: 'forgetting', confusedWith: null, mastery: 60 },
      { notionId: 'n-cle', nature: 'confusion', confusedWith: 'n-type', mastery: 35 },
      { notionId: 'n-equilibre', nature: 'application', confusedWith: null, mastery: 55 },
      { notionId: 'n-ledgers', nature: 'misunderstanding', confusedWith: null, mastery: 28 },
    ]);
    expect(REFERENCE_NOW).toBe('2026-11-11T12:20:00.000Z');
  });

  it('garde un ordre stable des notions par module', () => {
    for (const module of SAP_MODULES) {
      const notions = SAP_NOTIONS.filter((notion) => notion.moduleId === module.moduleId);
      expect(notions.map((notion) => notion.position)).toEqual(
        notions.map((_notion, index) => index),
      );
      expect(notions.every((notion) => notion.modulePosition === module.position)).toBe(true);
      expect(notions.length).toBeGreaterThan(0);
    }
  });
});
