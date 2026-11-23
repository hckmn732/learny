// Vitest [SPEC-3303] — réducteur du flux du tuteur (CA-1, CA-4, ET-2, CL-5).
//
// The stream of `@learny/api-client` is replayed part by part: the typing indicator, the growing
// text, the sources, the follow-ups, the « Teste-moi » part, then the interruption and the stop
// that keep the partial text. The coalescer proves that a frame groups several fragments without
// losing one (CL-5).
import { describe, expect, it } from 'vitest';

import type { TutorReplyPart } from '@learny/api-client';

import {
  applyPart,
  EMPTY_TURN,
  FragmentCoalescer,
  isStreaming,
  isTurnVisible,
  markDone,
  markError,
  markInterrupted,
  type TutorTurn,
} from './stream-state';

const SOURCE = { label: 'Chapitre 2 · L’en-tête de pièce' };
const FOLLOW_UP = { key: 'example', label: 'Un exemple concret' } as const;

function replay(parts: readonly TutorReplyPart[]): TutorTurn {
  return parts.reduce(applyPart, EMPTY_TURN);
}

describe('[SPEC-3303] flux du tuteur : fragments, sources et suites', () => {
  it('affiche l’indicateur de frappe avant le premier fragment (EF-3)', () => {
    const typing: TutorTurn = { ...EMPTY_TURN, status: 'typing' };
    expect(isTurnVisible(typing)).toBe(true);
    expect(isStreaming(typing)).toBe(true);
    expect(typing.text).toBe('');
  });

  it('ajoute les fragments dans l’ordre et passe en diffusion (CA-1)', () => {
    const turn = replay([
      { type: 'text-delta', id: 'tutor', delta: 'La date de pièce ' },
      { type: 'text-delta', id: 'tutor', delta: 'fixe la période.' },
    ]);
    expect(turn.text).toBe('La date de pièce fixe la période.');
    expect(turn.status).toBe('streaming');
    expect(isStreaming(turn)).toBe(true);
  });

  it('porte les sources et les suites reçues en données (CA-1, BR-TUT-03)', () => {
    const turn = replay([
      { type: 'text-delta', id: 'tutor', delta: 'Réponse.' },
      { type: 'data-sources', data: { sources: [SOURCE] } },
      { type: 'data-follow-ups', data: { followUps: [FOLLOW_UP] } },
    ]);
    expect(turn.sources).toEqual([SOURCE]);
    expect(turn.followUps).toEqual([FOLLOW_UP]);
    expect(markDone(turn).status).toBe('done');
  });

  it('porte l’état « Teste-moi » et termine la réponse (BR-TUT-04)', () => {
    const turn = replay([
      { type: 'text-delta', id: 'self-test', delta: 'Une question, sans regarder le cours : …' },
      { type: 'data-self-test', data: { status: 'pending' } },
    ]);
    expect(turn.selfTest).toEqual({ status: 'pending' });
    expect(turn.status).toBe('done');
  });

  it('conserve le texte partiel quand le flux est interrompu (CA-4, ET-2)', () => {
    const partial = replay([{ type: 'text-delta', id: 'tutor', delta: 'La date de pièce' }]);
    const interrupted = markInterrupted(partial);
    expect(interrupted.status).toBe('interrupted');
    expect(interrupted.text).toBe('La date de pièce');
    expect(isStreaming(interrupted)).toBe(false);
    // L'arrêt pendant l'indicateur de frappe marque la bulle ; c'est le contrôleur qui n'ajoute
    // aucun message tant qu'aucun fragment n'est arrivé (CL-2).
    expect(markInterrupted({ ...EMPTY_TURN, status: 'typing' }).status).toBe('interrupted');
    // Un état jamais démarré n'est pas transformé en bulle.
    expect(markInterrupted(EMPTY_TURN).status).toBe('idle');
  });

  it('retient le code d’une erreur typée (EF-7)', () => {
    const failed = markError({ ...EMPTY_TURN, status: 'typing' }, 'AI_UNAVAILABLE');
    expect(failed.status).toBe('error');
    expect(failed.code).toBe('AI_UNAVAILABLE');
  });
});

describe('[SPEC-3303] regroupement des fragments par trame', () => {
  it('regroupe les fragments d’une même trame en une seule mise à jour (CL-5)', () => {
    const frames: (() => void)[] = [];
    const written: string[] = [];
    const coalescer = new FragmentCoalescer(
      (text) => written.push(text),
      (run) => {
        frames.push(run);
      },
    );

    coalescer.push('La date de pièce ');
    coalescer.push('fixe la période');
    coalescer.push(', la date de saisie trace l’enregistrement.');
    expect(written).toEqual([]);
    expect(frames).toHaveLength(1);

    frames[0]?.();
    expect(written).toEqual([
      'La date de pièce fixe la période, la date de saisie trace l’enregistrement.',
    ]);

    // Une seconde trame ne réécrit que ses propres fragments.
    coalescer.push(' Suite.');
    expect(frames).toHaveLength(2);
    frames[1]?.();
    expect(written).toEqual([
      'La date de pièce fixe la période, la date de saisie trace l’enregistrement.',
      ' Suite.',
    ]);
  });

  it('écrit les fragments en attente à la fin du flux sans doublon (CL-1, CL-5)', () => {
    const written: string[] = [];
    const coalescer = new FragmentCoalescer(
      (text) => written.push(text),
      () => undefined,
    );
    coalescer.push('Texte partiel');
    expect(coalescer.pending).toBe('Texte partiel');
    coalescer.flush();
    expect(written).toEqual(['Texte partiel']);
    expect(coalescer.pending).toBe('');
    // Un second flush ne réécrit rien (l’arrêt puis la fin du flux ne dupliquent pas le texte).
    coalescer.flush();
    expect(written).toEqual(['Texte partiel']);
  });
});
