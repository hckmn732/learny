'use client';

// SPEC-1002 EF-5 — appel réel de GET /api/v1/health depuis le navigateur avec le paquet partagé.
// Le transport injectable d'EF-1 sert aussi à lire l'identifiant de requête de la réponse
// (l'en-tête x-request-id) sans modifier le client : c'est la démonstration vivante d'ADR-1007.
import { useState } from 'react';

import { createApiClient } from '@learny/api-client';
import type { HealthStatus } from '@learny/contracts';
import { AppError, isAppError } from '@learny/core';
import { fr } from '@learny/i18n/fr/sdd';
import { Button } from '@learny/ui';

const t = fr.sdd.spec1002;

// Client unique de la carte (portée module) : baseUrl '/api/v1', enveloppe fetch qui conserve
// l'identifiant de requête de la dernière réponse. Aucune relance 401 (le web n'utilise pas
// l'option, CL-3) ; aucun ref : l'identifiant vit à côté du client, hors du rendu.
let lastRequestId: string | null = null;
const cardClient = createApiClient({
  baseUrl: '/api/v1',
  fetch: async (input, init) => {
    const response = await fetch(input, init);
    lastRequestId = response.headers.get('x-request-id');
    return response;
  },
});

type Result =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'ok'; status: HealthStatus; requestId: string | null }
  | { kind: 'error'; code: string; detail: string };

export function Spec1002HealthCard() {
  const [result, setResult] = useState<Result>({ kind: 'idle' });

  async function call(): Promise<void> {
    setResult({ kind: 'pending' });
    try {
      // La route chargée dynamiquement : aucun registre Zod dans le JavaScript initial (SPEC-804).
      const body = await cardClient.api.health({});
      setResult({ kind: 'ok', status: body.status, requestId: lastRequestId });
    } catch (error) {
      const e = isAppError(error) ? error : new AppError('INTERNAL_ERROR', String(error));
      setResult({ kind: 'error', code: e.code, detail: e.detail });
    }
  }

  return (
    <div className="mt-4">
      <Button
        type="button"
        data-testid="spec-1002-call-api"
        disabled={result.kind === 'pending'}
        onClick={() => void call()}
      >
        {t.health.callApi}
      </Button>
      <div
        data-testid="spec-1002-health-result"
        role="status"
        aria-live="polite"
        className="mt-4 text-13"
      >
        {result.kind === 'idle' ? <p>{t.health.idle}</p> : null}
        {result.kind === 'pending' ? <p>{t.health.pending}</p> : null}
        {result.kind === 'ok' ? (
          <>
            <p data-testid="spec-1002-status">
              {t.health.status}
              {result.status}
            </p>
            <p className="font-mono text-12" data-testid="spec-1002-request-id">
              {t.health.requestId} : {result.requestId ?? '—'}
            </p>
          </>
        ) : null}
        {result.kind === 'error' ? (
          <p data-testid="spec-1002-error">{t.health.failed(result.code, result.detail)}</p>
        ) : null}
      </div>
    </div>
  );
}
