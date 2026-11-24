'use client';

import type { ResourceRole } from '@learny/contracts';
import { fr } from '@learny/i18n/fr/simple';
import { Button } from '@learny/ui';

import { RemoveIcon } from './icons';
import { ROLE_ORDER, type FileStatus } from './simple-mode';
import { formatSize } from './simple-upload';

const t = fr.simple;

export interface SimpleFileEntry {
  id: string;
  name: string;
  sizeBytes: number;
  pages: number | null;
  role: ResourceRole;
  status: FileStatus;
  progress: number;
  message: string | null;
}

export interface SimpleLinkEntry {
  resourceId: string;
  title: string;
  role: ResourceRole;
  status: string;
}

function roleLabel(role: ResourceRole): string {
  return t.roles[role];
}

function RoleSelect({
  index,
  role,
  onChange,
}: {
  index: number;
  role: ResourceRole;
  onChange: (role: ResourceRole) => void;
}) {
  return (
    <select
      aria-label={t.depot.file.roleLabel(roleLabel(role))}
      className="cursor-pointer rounded-9 border border-solid border-border-strong bg-surface px-10 py-6 text-13 font-500"
      data-testid={`simple-role-${String(index)}`}
      onChange={(event) => {
        onChange(event.target.value as ResourceRole);
      }}
      value={role}
    >
      {ROLE_ORDER.map((option) => (
        <option key={option} value={option}>
          {roleLabel(option)}
        </option>
      ))}
    </select>
  );
}

export interface SimpleFileListProps {
  files: readonly SimpleFileEntry[];
  links: readonly SimpleLinkEntry[];
  onChangeRole: (id: string, role: ResourceRole) => void;
  onChangeLinkRole: (resourceId: string, role: ResourceRole) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onRemoveLink: (resourceId: string) => void;
}

/**
 * SPEC-4002 EF-2 — la liste des documents déposés (SCR-21) : nom, pages et taille, sélecteur de
 * rôle (« Cours », « Exercices », « Annales », « Autre support »), progression du téléversement,
 * message d'erreur de l'API et bouton « Retirer » sur chaque ligne (CL-1).
 */
export function SimpleFileList({
  files,
  links,
  onChangeRole,
  onChangeLinkRole,
  onRemove,
  onRetry,
  onRemoveLink,
}: SimpleFileListProps) {
  return (
    <ul className="m-0 flex list-none flex-col gap-8 p-0" data-testid="simple-file-list">
      {files.map((entry, index) => (
        <li
          className="flex flex-wrap items-center gap-12 rounded-14 border border-solid border-border bg-surface px-14 py-12"
          data-status={entry.status}
          data-testid={`simple-file-${String(index)}`}
          key={entry.id}
        >
          <span
            aria-hidden="true"
            className="flex size-38 shrink-0 items-center justify-center rounded-8 bg-orange-soft text-10 font-700 text-orange-ink"
          >
            {entry.name.split('.').at(-1)?.slice(0, 3).toUpperCase() ?? 'DOC'}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="truncate text-14 font-600">{entry.name}</span>
            <span className="text-12 text-ink-muted">
              {t.depot.file.meta(entry.pages, formatSize(entry.sizeBytes))}
              {entry.status === 'ready' ? ` · ${t.depot.file.statuses.ready}` : ''}
            </span>
            {entry.status === 'failed' ? (
              <span className="text-12 font-600 text-orange-ink" role="alert">
                {entry.message ?? t.depot.file.statuses.failed}
              </span>
            ) : null}
            {entry.status === 'uploading' || entry.status === 'processing' ? (
              <span
                aria-label={t.depot.file.progressLabel(entry.name)}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={entry.progress}
                className="h-6 w-full overflow-hidden rounded-full bg-surface-muted"
                role="progressbar"
              >
                <span
                  className="block h-full rounded-full bg-lime"
                  style={{ width: `${String(entry.progress)} %` }}
                />
              </span>
            ) : null}
          </div>
          <RoleSelect
            index={index}
            onChange={(role) => {
              onChangeRole(entry.id, role);
            }}
            role={entry.role}
          />
          {entry.status === 'failed' ? (
            <Button
              onClick={() => {
                onRetry(entry.id);
              }}
              size="md"
              type="button"
              variant="outline"
            >
              {t.depot.file.retry}
            </Button>
          ) : null}
          <button
            aria-label={t.depot.file.remove}
            className="cursor-pointer border-0 bg-transparent p-4 text-ink-muted"
            data-testid={`simple-file-remove-${String(index)}`}
            onClick={() => {
              onRemove(entry.id);
            }}
            type="button"
          >
            <RemoveIcon />
          </button>
        </li>
      ))}

      {links.map((entry, offset) => {
        const index = files.length + offset;
        return (
          <li
            className="flex flex-wrap items-center gap-12 rounded-14 border border-solid border-border bg-surface px-14 py-12"
            data-status={entry.status}
            data-testid={`simple-file-${String(index)}`}
            key={entry.resourceId}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="truncate text-14 font-600">{entry.title}</span>
              <span className="text-12 text-ink-muted">
                {t.depot.file.meta(null, formatSize(0))}
              </span>
            </span>
            <RoleSelect
              index={index}
              onChange={(role) => {
                onChangeLinkRole(entry.resourceId, role);
              }}
              role={entry.role}
            />
            <button
              aria-label={t.depot.file.remove}
              className="cursor-pointer border-0 bg-transparent p-4 text-ink-muted"
              onClick={() => {
                onRemoveLink(entry.resourceId);
              }}
              type="button"
            >
              <RemoveIcon />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
