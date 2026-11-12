// Unit tests of the course JSON shapes, anchors and tutor-discussion schemas (SPEC-105 §12).
import { describe, expect, it } from 'vitest';

import {
  chapterSummaryFeedbackSchema,
  courseSectionAnchorSchema,
  courseSectionDataSchema,
  dontConfuseSchema,
  flashQuestionSchema,
  retainSchema,
  selfTestSchema,
  tutorMessageSourceSchema,
} from './courses.json-schemas';

const NOTION_ID = '6f1d0f2a-0000-4000-8000-000000000001';
const CHUNK_ID = '6f1d0f2a-0000-4000-8000-000000000002';
const RESOURCE_ID = '6f1d0f2a-0000-4000-8000-000000000003';

describe('[SPEC-105] schémas du cours', () => {
  it('associe un schéma de données à chaque type de section (ET-4)', () => {
    expect(courseSectionDataSchema('text').safeParse(null).success).toBe(true);
    expect(courseSectionDataSchema('text').safeParse({ question: 'x' }).success).toBe(false);
    expect(courseSectionDataSchema('tutor_completed').safeParse(null).success).toBe(true);
    expect(courseSectionDataSchema('summary_prompt').safeParse(null).success).toBe(true);
    expect(courseSectionDataSchema('summary_prompt').safeParse('texte').success).toBe(false);
  });

  it('borne la question éclair et sa réponse', () => {
    expect(
      flashQuestionSchema.safeParse({ question: 'Quelle est la clé ?', answer: '40 = débit' })
        .success,
    ).toBe(true);
    expect(flashQuestionSchema.safeParse({ question: 'a'.repeat(501), answer: 'ok' }).success).toBe(
      false,
    );
    expect(
      flashQuestionSchema.safeParse({ question: 'ok', answer: 'a'.repeat(1001) }).success,
    ).toBe(false);
    expect(flashQuestionSchema.safeParse({ question: '', answer: 'ok' }).success).toBe(false);
    expect(
      flashQuestionSchema.safeParse({ question: 'ok', answer: 'ok', inconnu: true }).success,
    ).toBe(false);
  });

  it('borne les deux côtés de « ne pas confondre »', () => {
    const side = { title: 'Débit', body: 'À gauche', example: 'Compte 401' };
    expect(dontConfuseSchema.safeParse({ left: side, right: side }).success).toBe(true);
    expect(
      dontConfuseSchema.safeParse({ left: { ...side, title: 'a'.repeat(81) }, right: side })
        .success,
    ).toBe(false);
    expect(
      dontConfuseSchema.safeParse({ left: { ...side, body: 'a'.repeat(401) }, right: side })
        .success,
    ).toBe(false);
    expect(
      dontConfuseSchema.safeParse({ left: { ...side, example: 'a'.repeat(201) }, right: side })
        .success,
    ).toBe(false);
    expect(dontConfuseSchema.safeParse({ left: side }).success).toBe(false);
  });

  it('exige de 3 à 7 points dans « à retenir » et borne le diagramme', () => {
    expect(retainSchema.safeParse({ points: ['un', 'deux'] }).success).toBe(false);
    expect(retainSchema.safeParse({ points: ['un', 'deux', 'trois'] }).success).toBe(true);
    expect(retainSchema.safeParse({ points: Array<string>(7).fill('point') }).success).toBe(true);
    expect(retainSchema.safeParse({ points: Array<string>(8).fill('point') }).success).toBe(false);
    expect(retainSchema.safeParse({ points: ['un', 'deux', 'a'.repeat(201)] }).success).toBe(false);
    expect(
      retainSchema.safeParse({
        points: ['un', 'deux', 'trois'],
        mnemonic: 'a'.repeat(301),
      }).success,
    ).toBe(false);
    expect(
      retainSchema.safeParse({
        points: ['un', 'deux', 'trois'],
        mnemonic: 'DAC',
        diagram: {
          blocks: [{ id: 'a', label: 'Actif' }],
          arrows: [{ from: 'a', to: 'b', label: 'augmente' }],
        },
      }).success,
    ).toBe(true);
    expect(
      retainSchema.safeParse({
        points: ['un', 'deux', 'trois'],
        diagram: { blocks: Array<{ id: string; label: string }>(9).fill({ id: 'a', label: 'A' }) },
      }).success,
    ).toBe(false);
    expect(
      retainSchema.safeParse({
        points: ['un', 'deux', 'trois'],
        diagram: { blocks: [] },
      }).success,
    ).toBe(false);
  });

  it('valide le retour du tuteur sur un résumé de chapitre', () => {
    expect(
      chapterSummaryFeedbackSchema.safeParse({
        verdict: 'partial',
        message: 'Il manque la contrepartie.',
        missing: ['contrepartie'],
      }).success,
    ).toBe(true);
    expect(
      chapterSummaryFeedbackSchema.safeParse({ verdict: 'bon', message: '', missing: [] }).success,
    ).toBe(false);
    expect(
      chapterSummaryFeedbackSchema.safeParse({
        verdict: 'good',
        message: 'a'.repeat(1001),
        missing: [],
      }).success,
    ).toBe(false);
    expect(
      chapterSummaryFeedbackSchema.safeParse({
        verdict: 'good',
        message: 'ok',
        missing: Array<string>(11).fill('manque'),
      }).success,
    ).toBe(false);
  });

  it('valide une source de message et le test personnel du tuteur', () => {
    expect(
      tutorMessageSourceSchema.safeParse({
        chunkId: CHUNK_ID,
        resourceId: RESOURCE_ID,
        label: 'Guide FI, p. 4',
        location: { page: 4, charStart: 10, charEnd: 48 },
      }).success,
    ).toBe(true);
    // ADR-0039 — after the deletion of the source, only the label remains.
    expect(tutorMessageSourceSchema.safeParse({ label: 'Guide FI, p. 4' }).success).toBe(true);
    expect(tutorMessageSourceSchema.safeParse({ label: 'a'.repeat(121) }).success).toBe(false);
    expect(
      tutorMessageSourceSchema.safeParse({ label: 'ok', chunkId: 'pas-un-uuid' }).success,
    ).toBe(false);

    expect(
      selfTestSchema.safeParse({
        question: 'Quelle est la contrepartie ?',
        notionId: NOTION_ID,
        expected: 'Le crédit',
        answer: 'Le débit',
        correct: false,
        answeredAt: '2026-11-11T12:20:00Z',
      }).success,
    ).toBe(true);
    expect(selfTestSchema.safeParse({ question: 'Sans notion', notionId: 'x' }).success).toBe(
      false,
    );
    expect(
      selfTestSchema.safeParse({
        question: 'Sans notion',
        notionId: NOTION_ID,
        answeredAt: 'hier',
      }).success,
    ).toBe(false);
  });

  it('accepte les ancres conformes et refuse les autres (EF-3, CL-3)', () => {
    for (const anchor of ['a', 'postes-et-cles', 'section-1-2', 'compte401', '0']) {
      expect(courseSectionAnchorSchema.safeParse(anchor).success, anchor).toBe(true);
    }
    for (const anchor of [
      'Postes-Et-Cles',
      'postes_et_cles',
      '-debut',
      'fin-',
      'deux--tirets',
      '',
    ]) {
      expect(courseSectionAnchorSchema.safeParse(anchor).success, anchor).toBe(false);
    }
    expect(courseSectionAnchorSchema.safeParse('a'.repeat(80)).success).toBe(true);
    expect(courseSectionAnchorSchema.safeParse('a'.repeat(81)).success).toBe(false);
  });
});
