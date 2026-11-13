'use client';

import { useActionState, useState } from 'react';

import type { CredentialDto } from '@learny/contracts';
import { AlertDialog, Badge, Button, Card, ErrorState } from '@learny/ui';
import { colors } from '@learny/ui/tokens';

import { createDemoCredential, deleteDemoCredential } from '../../app/%5Fdev/sdd/spec-505-actions';
import type {
  DemoActionState,
  DemoProviderOption,
  DemoStorage,
} from '../../app/%5Fdev/sdd/spec-505-types';

const STATUS_LABELS: Record<CredentialDto['status'], string> = {
  untested: 'Non testé',
  qualified: 'Qualifié',
  failed: 'Échec du test',
};

export interface Spec505DemoProps {
  credentials: CredentialDto[];
  providers: DemoProviderOption[];
  storage: DemoStorage | null;
  rawJson: string;
  error: string | null;
}

const INITIAL: DemoActionState = { error: null };

export default function Spec505Demo({
  credentials,
  providers,
  storage,
  rawJson,
  error,
}: Readonly<Spec505DemoProps>) {
  const [provider, setProvider] = useState('openai');
  const [state, formAction, pending] = useActionState(createDemoCredential, INITIAL);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const selected = providers.find((entry) => entry.value === provider) ?? providers[0];
  const isLocal = selected?.keyOptional === true;

  return (
    <div className="mt-6 grid gap-6">
      {error === null ? null : (
        <ErrorState
          data-testid="cred-error"
          title="Démonstration indisponible"
          description={error}
        />
      )}

      <Card data-testid="cred-form-card" labelledBy="cred-form-title">
        <h2 id="cred-form-title" className="font-display text-xl font-600">
          Ajouter un fournisseur
        </h2>
        <form action={formAction} className="mt-4 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label htmlFor="cred-provider" className="grid gap-2 text-13 font-600">
              Fournisseur
              <select
                id="cred-provider"
                name="provider"
                data-testid="cred-provider"
                className="min-h-48 rounded-12 border border-solid border-border bg-surface px-14 text-15"
                value={provider}
                onChange={(event) => {
                  setProvider(event.target.value);
                }}
              >
                {providers.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="cred-model" className="grid gap-2 text-13 font-600">
              Nom du modèle
              <input
                id="cred-model"
                name="model"
                data-testid="cred-model"
                type="text"
                required
                placeholder="Tel qu’indiqué par le fournisseur"
                className="min-h-48 rounded-12 border border-solid border-border bg-surface px-14 text-15"
              />
            </label>
            {selected?.requiresBaseUrl === true ? (
              <label htmlFor="cred-baseurl" className="grid gap-2 text-13 font-600 sm:col-span-2">
                Adresse du point d’accès
                <input
                  id="cred-baseurl"
                  name="baseUrl"
                  data-testid="cred-baseurl"
                  type="url"
                  required
                  placeholder="https://… ou http://localhost:11434"
                  className="min-h-48 rounded-12 border border-solid border-border bg-surface px-14 text-15"
                />
              </label>
            ) : null}
            <label htmlFor="cred-key" className="grid gap-2 text-13 font-600 sm:col-span-2">
              Clé d’API {isLocal ? '(facultative)' : ''}
              <input
                id="cred-key"
                name="apiKey"
                data-testid="cred-key"
                type="password"
                required={!isLocal}
                autoComplete="off"
                placeholder="Collez votre clé"
                className="min-h-48 rounded-12 border border-solid border-border bg-surface px-14 font-mono text-15"
              />
            </label>
          </div>

          {selected === undefined ? null : (
            <p
              data-testid="cred-data-note"
              className="m-0 rounded-10 px-10 py-8 text-13 font-600"
              style={{
                backgroundColor: selected.outsideEu ? colors['orange-soft'] : colors['indigo-soft'],
                color: selected.outsideEu ? colors['orange-ink'] : colors['indigo-ink-strong'],
              }}
            >
              {selected.dataNote}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="lime" data-testid="cred-submit" loading={pending}>
              Enregistrer la clé
            </Button>
            {state.error === null ? null : (
              <p data-testid="cred-form-error" role="alert" className="m-0 text-13 text-danger">
                {state.error}
              </p>
            )}
          </div>
        </form>
      </Card>

      <Card data-testid="cred-list" labelledBy="cred-list-title">
        <h2 id="cred-list-title" className="font-display text-xl font-600">
          Mes fournisseurs
        </h2>
        {credentials.length === 0 ? (
          <p data-testid="cred-empty" className="mt-4 text-14 text-ink-muted">
            Aucun fournisseur enregistré.
          </p>
        ) : (
          <ul className="mt-4 grid list-none gap-3 p-0">
            {credentials.map((credential) => (
              <li
                key={credential.id}
                data-testid="cred-item"
                className="rounded-16 border border-solid border-border bg-surface p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 data-testid="cred-title" className="m-0 text-17 font-700">
                    {credential.providerLabel}
                  </h3>
                  <span className="flex flex-wrap gap-2">
                    <Badge data-testid="cred-status" tone="neutral">
                      {STATUS_LABELS[credential.status]}
                    </Badge>
                    {credential.outsideEu ? (
                      <Badge data-testid="cred-outside-eu" tone="orange">
                        Hors UE
                      </Badge>
                    ) : null}
                  </span>
                </div>
                <p className="m-0 mt-2 text-14 text-ink-muted">
                  Votre clé ·{' '}
                  <span data-testid="cred-masked" className="font-mono text-ink">
                    {credential.keyMasked ?? 'aucune clé'}
                  </span>
                </p>
                <p data-testid="cred-note" className="m-0 mt-2 text-13 text-ink-muted">
                  {credential.dataNote}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <AlertDialog
                    data-testid="cred-delete-dialog"
                    trigger={
                      <Button type="button" variant="outline" data-testid="cred-delete">
                        Supprimer la clé
                      </Button>
                    }
                    title={`Supprimer la clé ${credential.providerLabel} ?`}
                    description="La clé chiffrée et les affectations de tâches qui la référencent seront supprimées."
                    confirmLabel="Supprimer"
                    destructive
                    onConfirm={async () => {
                      const result = await deleteDemoCredential(credential.id);
                      setDeleteError(result.error);
                    }}
                  />
                  {deleteError === null ? null : (
                    <p
                      data-testid="cred-delete-error"
                      role="alert"
                      className="m-0 text-13 text-danger"
                    >
                      {deleteError}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card data-testid="cred-storage" labelledBy="cred-storage-title">
        <h2 id="cred-storage-title" className="font-display text-xl font-600">
          Stockage
        </h2>
        {storage === null ? (
          <p data-testid="cred-storage-empty" className="mt-4 text-14 text-ink-muted">
            Aucun chiffré à afficher.
          </p>
        ) : (
          <dl className="mt-4 grid gap-2 text-14">
            <div className="flex flex-wrap gap-2">
              <dt className="font-600">Longueur du chiffré</dt>
              <dd data-testid="cred-storage-bytes" className="m-0 font-mono">
                {storage.bytes} octets
              </dd>
            </div>
            <div className="flex flex-wrap gap-2">
              <dt className="font-600">IV (8 premiers octets)</dt>
              <dd data-testid="cred-storage-iv" className="m-0 font-mono">
                {storage.ivHex}
              </dd>
            </div>
            <p className="m-0 text-13 text-ink-muted">
              Le chiffré contient l’IV, l’étiquette d’authentification et le texte chiffré. La clé
              n’est jamais stockée en clair et n’est jamais renvoyée au navigateur.
            </p>
          </dl>
        )}
      </Card>

      <Card data-testid="cred-raw-card" labelledBy="cred-raw-title">
        <h2 id="cred-raw-title" className="font-display text-xl font-600">
          Réponse brute de l’API
        </h2>
        <pre
          data-testid="cred-raw-json"
          className="mt-4 overflow-x-auto rounded-12 bg-canvas p-4 font-mono text-13"
        >
          {rawJson}
        </pre>
      </Card>
    </div>
  );
}
