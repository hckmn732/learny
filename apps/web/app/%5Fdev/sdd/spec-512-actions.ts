'use server';

// Server actions of the SPEC-512 demonstration (ADR-0049). They only touch the isolated demo
// learner of `sdd-512-demo@test.learny.test`; the product code never calls them.
import { clock } from '@learny/core';
import { decideResourceSuggestion, suggestResource } from '@learny/tutor';

import { demoSuggestionContext } from './spec-512-data';

export interface SuggestionState {
  status: 'idle' | 'pending' | 'imported' | 'dismissed' | 'error';
  id: string | null;
  message: string;
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function suggestFromSearch(
  _previous: SuggestionState,
  formData: FormData,
): Promise<SuggestionState> {
  const demo = await demoSuggestionContext();
  const result = await suggestResource(
    { userId: demo.userId, db: demo.db, clock },
    {
      chapterId: demo.chapterId,
      title: text(formData, 'title'),
      url: text(formData, 'url'),
      reason: text(formData, 'reason'),
    },
  );
  if (!result.ok) {
    return { status: 'error', id: null, message: `${result.error.code} · ${result.error.detail}` };
  }
  return {
    status: result.value.status,
    id: result.value.id,
    message:
      result.value.status === 'pending'
        ? 'Suggestion en attente de votre import : aucun contenu n’est encore entré dans le chapitre.'
        : 'Cette suggestion a déjà reçu une décision.',
  };
}

export async function decideSuggestion(
  _previous: SuggestionState,
  formData: FormData,
): Promise<SuggestionState> {
  const demo = await demoSuggestionContext();
  const result = await decideResourceSuggestion(
    { userId: demo.userId, db: demo.db, clock },
    text(formData, 'id'),
    text(formData, 'decision'),
  );
  if (!result.ok) {
    return { status: 'error', id: null, message: `${result.error.code} · ${result.error.detail}` };
  }
  return {
    status: result.value.status,
    id: result.value.id,
    message:
      result.value.status === 'imported'
        ? 'Ressource importée dans le chapitre. Aucun contenu de cours n’a été créé : l’import est votre décision.'
        : 'Suggestion ignorée : elle ne sera pas ajoutée au chapitre.',
  };
}
