// Clés d'IA personnelles (zone C, écran `profil/cles-ia`).
//
// La couche API existe (`me.ai.credentials.*` d'`api/openapi.yaml`, contrats de SPEC-505/SPEC-506) :
// ce module ne fait que la transporter. Aucune clé ne revient du serveur — seul le masque
// (`keyMasked`) est affiché. Les écritures idempotentes passent par le registre de clés de
// l'application, comme `data/task-models.ts` et `data/attempts.ts`.
import { useQuery } from '@tanstack/react-query';

import type {
  AiCredentialCreateBody,
  AiCredentialDiscoverBody,
  AiCredentialDiscoverDto,
  CredentialDto,
  CredentialListDto,
} from '@learny/contracts';

import { idempotencyRegistry } from '../../../api/idempotency';
import { requireApiClient } from '../../../api/registry';

/** Clé de cache de la liste : une seule par utilisateur (le persister est déjà nominatif). */
export const AI_CREDENTIALS_KEY = ['mr', 'ai-credentials'] as const;

export type CredentialsStatus = 'loading' | 'error' | 'ready';

export interface CredentialsQuery {
  readonly status: CredentialsStatus;
  readonly data: CredentialListDto | null;
  readonly refetch: () => Promise<void>;
}

/** Liste des identifiants de l'apprenant, du plus ancien au plus récent. */
export function useAiCredentials(): CredentialsQuery {
  const query = useQuery({
    queryKey: AI_CREDENTIALS_KEY,
    queryFn: () => requireApiClient().api.meAiCredentialsList({}),
    retry: 1,
  });
  return {
    status: query.isError ? 'error' : query.data === undefined ? 'loading' : 'ready',
    data: query.data ?? null,
    refetch: async () => {
      await query.refetch();
    },
  };
}

/** Découvre les modèles d'un fournisseur ; c'est le test de la clé (aucune écriture). */
export async function discoverCredential(
  body: AiCredentialDiscoverBody,
): Promise<AiCredentialDiscoverDto> {
  return requireApiClient().api.meAiCredentialsDiscover({ body });
}

/** Enregistre la clé chiffrée côté serveur et renvoie son masque. */
export async function createCredential(body: AiCredentialCreateBody): Promise<CredentialDto> {
  const intent = `mr-ai-credential:${body.provider}`;
  try {
    const created = await requireApiClient().api.meAiCredentialsCreate(
      { body },
      { idempotencyKey: idempotencyRegistry.keyFor(intent) },
    );
    idempotencyRegistry.resolve(intent);
    return created;
  } catch (cause) {
    idempotencyRegistry.resolve(intent);
    throw cause;
  }
}

/** Supprime la clé et les affectations de tâches qui la référencent (`DELETE`, 204). */
export async function deleteCredential(id: string): Promise<void> {
  await requireApiClient().api.meAiCredentialsDelete({ params: { id } });
}