import { NextRequest, type NextResponse } from 'next/server';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { proxy } from '../../proxy';

const ENABLED = { ENABLE_SDD_PAGES: 'true', APP_ENV: 'test' };

function statusOf(path: string): number {
  return (proxy(new NextRequest(`http://localhost${path}`)) as NextResponse).status;
}

async function render(path: string, params: Record<string, string> = {}): Promise<string> {
  if (path === '/_dev/bricks') {
    const { default: Page } = await import('../../app/%5Fdev/bricks/page');
    return renderToStaticMarkup(await Page({ searchParams: Promise.resolve(params) }));
  }
  if (path === '/_dev/bricks/jeux') {
    const { default: Page } = await import('../../app/%5Fdev/bricks/jeux/page');
    return renderToStaticMarkup(await Page({ searchParams: Promise.resolve(params) }));
  }
  const pageModule =
    path === '/_dev/bricks/quiz'
      ? await import('../../app/%5Fdev/bricks/quiz/page')
      : path === '/_dev/bricks/exercice'
        ? await import('../../app/%5Fdev/bricks/exercice/page')
        : await import('../../app/%5Fdev/bricks/examen/page');
  const Page = pageModule.default;
  return renderToStaticMarkup(Page());
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('[SPEC-503] galerie des briques', () => {
  it('répond 404 si ENABLE_SDD_PAGES est faux et 200 sinon (ET-5)', () => {
    vi.stubEnv('ENABLE_SDD_PAGES', 'false');
    vi.stubEnv('APP_ENV', 'test');
    for (const path of ['/_dev/bricks', '/_dev/bricks/quiz', '/_dev/bricks/jeux']) {
      expect(statusOf(path), path).toBe(404);
    }
    vi.stubEnv('ENABLE_SDD_PAGES', ENABLED.ENABLE_SDD_PAGES);
    for (const path of [
      '/_dev/bricks',
      '/_dev/bricks/quiz',
      '/_dev/bricks/jeux',
      '/_dev/bricks/exercice',
      '/_dev/bricks/examen',
    ]) {
      expect(statusOf(path), path).toBe(200);
    }
  });

  it('rend les treize sections et filtre par type et état (ET-5)', async () => {
    vi.stubEnv('ENABLE_SDD_PAGES', 'true');
    vi.stubEnv('APP_ENV', 'test');
    const html = await render('/_dev/bricks');
    for (const type of [
      'text',
      'resource_excerpt',
      'choice_question',
      'open_question',
      'cloze',
      'matching',
      'ordering',
      'categorization',
      'recall_card',
      'instruction',
      'scripted_dialogue',
      'timer',
      'scoring',
    ]) {
      expect(html).toContain(`data-testid="gallery-${type}"`);
    }
    const filtered = await render('/_dev/bricks', {
      type: 'choice_question',
      state: 'corrected-ko',
    });
    expect(filtered).toContain('data-testid="gallery-choice_question"');
    expect(filtered).not.toContain('data-testid="gallery-cloze"');
    expect(filtered).toContain('data-testid="gallery-choice_question-corrected-ko"');
  });

  it('reproduit les textes exacts des quatre maquettes (ET-5, CA-5)', async () => {
    vi.stubEnv('ENABLE_SDD_PAGES', 'true');
    vi.stubEnv('APP_ENV', 'test');
    const quiz = await render('/_dev/bricks/quiz');
    expect(quiz).toContain('Quel élément classe l’ensemble d’une pièce comptable ?');
    expect(quiz).toContain('Correction immédiate · nouvelles questions à chaque tentative');
    expect(quiz).toContain('Vérifier');

    const games = await render('/_dev/bricks/jeux', { jeu: '5' });
    expect(games).toContain('Dans SAP Fiori');
    expect(games).toContain('Trou 1 sur 2');
    expect(games).toContain('Vérifier');

    const exercise = await render('/_dev/bricks/exercice');
    expect(exercise).toContain('Saisir une pièce équilibrée');
    expect(exercise).toContain('Votre saisie');
    expect(exercise).toContain('Expliquez avec vos mots');
    expect(exercise).toContain('Pas encore de montant');
    expect(exercise).toContain('Ajouter un poste');

    const exam = await render('/_dev/bricks/examen');
    expect(exam).toContain('Question 1 sur 20');
    expect(exam).toContain('Le Launchpad SAP Fiori');
    expect(exam).toContain('40:00');
  });
});
