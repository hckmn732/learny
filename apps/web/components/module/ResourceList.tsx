'use client';

import { useState } from 'react';

import type { ResourceListItem } from '@learny/contracts';
import { cn } from '@learny/ui';

import { fr } from '../../messages/fr';

const t = fr.module;

const STATUS_STYLE: Record<ResourceListItem['status'], string> = {
  queued: 'bg-surface-muted text-ink-secondary',
  processing: 'bg-indigo-soft text-indigo-ink-strong',
  ready: 'bg-green-soft text-green-ink',
  failed: 'bg-orange-soft text-orange-ink',
};

const KIND_STYLE: Record<ResourceListItem['kind'], string> = {
  pdf: 'bg-excerpt-pdf-soft text-excerpt-pdf',
  image: 'bg-surface-muted text-ink-secondary',
  web: 'bg-excerpt-web-soft text-excerpt-web',
  youtube: 'bg-excerpt-video-soft text-excerpt-video',
  note: 'bg-excerpt-note-soft text-excerpt-note',
  exam_guide: 'bg-excerpt-pdf-soft text-excerpt-pdf',
  audio: 'bg-excerpt-audio-soft text-excerpt-audio',
  video: 'bg-excerpt-video-soft text-excerpt-video',
};

const KIND_LABEL: Record<ResourceListItem['kind'], string> = {
  pdf: 'PDF',
  image: 'Image',
  web: 'Page web',
  youtube: 'YouTube',
  note: 'Note',
  exam_guide: 'Guide d’examen',
  audio: 'Audio',
  video: 'Vidéo',
};

function formatSize(bytes: number | null): string | null {
  if (bytes === null) return null;
  if (bytes < 1024 * 1024) return `${String(Math.max(1, Math.round(bytes / 1024)))} ko`;
  return `${String(Math.round(bytes / (1024 * 1024)))} Mo`;
}

function metaOf(resource: ResourceListItem): string {
  const parts: string[] = [KIND_LABEL[resource.kind]];
  if (resource.pages !== null) parts.push(`${String(resource.pages)} pages`);
  const size = formatSize(resource.sizeBytes);
  if (size !== null) parts.push(size);
  if (resource.kind === 'note') parts.push('Brouillon');
  return parts.join(' · ');
}

export interface ResourceListProps {
  resources: readonly ResourceListItem[];
  onRetry: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  busyId?: string | null;
}

/**
 * BR-APP-07, BR-APP-10 — the list of the chapter's apports. The processing status is always
 * written in words and carries `data-status`; a failure shows its readable reason and a real
 * « Réessayer » button. Rename edits only the title; delete is an explicit action. No audio or
 * video file can appear here in V1: the creation offers never produce one (ADR-0008).
 */
export function ResourceList({
  resources,
  onRetry,
  onRename,
  onDelete,
  busyId = null,
}: ResourceListProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState('');

  if (resources.length === 0) {
    return (
      <p className="m-0 rounded-18 bg-surface-subtle px-16 py-14 text-14 text-ink-muted">
        {t.emptyResources}
      </p>
    );
  }

  return (
    <ul className="m-0 flex list-none flex-col gap-8 p-0" data-testid="resource-list">
      {resources.map((resource) => {
        const busy = busyId === resource.id;
        const failed = resource.status === 'failed';
        const isEditing = editing === resource.id;
        return (
          <li
            className="flex flex-wrap items-center gap-14 rounded-18 bg-surface-subtle px-14 py-12"
            data-resource-id={resource.id}
            data-testid="resource-item"
            key={resource.id}
          >
            <span
              aria-hidden="true"
              className={cn(
                'inline-flex h-40 w-40 shrink-0 items-center justify-center rounded-12',
                KIND_STYLE[resource.kind],
              )}
            >
              <svg
                fill="none"
                height="18"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
                viewBox="0 0 24 24"
                width="18"
              >
                {resource.kind === 'note' ? (
                  <path d="M4 20h4L19 9l-4-4L4 16z" />
                ) : resource.kind === 'web' || resource.kind === 'youtube' ? (
                  <>
                    <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
                    <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
                  </>
                ) : (
                  <>
                    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                    <path d="M14 3v6h6" />
                  </>
                )}
              </svg>
            </span>
            <span className="flex min-w-0 flex-1 basis-240 flex-col gap-2">
              {isEditing ? (
                <form
                  className="flex flex-wrap items-center gap-8"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const next = title.trim();
                    if (next === '' || next === resource.title) {
                      setEditing(null);
                      return;
                    }
                    onRename(resource.id, next);
                    setEditing(null);
                  }}
                >
                  <label className="sr-only" htmlFor={`resource-title-${resource.id}`}>
                    {t.renameLabel}
                  </label>
                  <input
                    className="min-h-36 min-w-0 flex-1 basis-180 rounded-10 border border-border-strong bg-surface px-10 text-14 text-ink"
                    id={`resource-title-${resource.id}`}
                    maxLength={200}
                    onChange={(event) => {
                      setTitle(event.target.value);
                    }}
                    value={title}
                  />
                  <button
                    className="min-h-36 cursor-pointer rounded-10 bg-ink px-12 text-13 font-700 text-white"
                    type="submit"
                  >
                    {t.save}
                  </button>
                  <button
                    className="min-h-36 cursor-pointer rounded-10 border border-border-strong bg-surface px-12 text-13 font-600 text-ink"
                    onClick={() => {
                      setEditing(null);
                    }}
                    type="button"
                  >
                    {t.cancel}
                  </button>
                </form>
              ) : (
                <>
                  <span className="break-words text-14 font-600">{resource.title}</span>
                  <span className="text-13 text-ink-muted">{metaOf(resource)}</span>
                  {failed && resource.errorMessage !== null ? (
                    <span className="text-13 text-orange-ink-strong" role="alert">
                      {resource.errorMessage}
                    </span>
                  ) : null}
                </>
              )}
            </span>
            {isEditing ? null : (
              <span className="flex flex-wrap items-center gap-8">
                <span
                  className={cn(
                    'rounded-full px-10 py-4 text-12 font-700',
                    STATUS_STYLE[resource.status],
                  )}
                  data-status={resource.status}
                  data-testid="resource-status"
                >
                  {t.status[resource.status]}
                </span>
                {failed ? (
                  <button
                    className="min-h-36 cursor-pointer rounded-10 border border-orange-soft bg-orange-soft px-12 text-13 font-700 text-orange-ink"
                    disabled={busy}
                    onClick={() => {
                      onRetry(resource.id);
                    }}
                    type="button"
                  >
                    {busy ? t.busy : t.retry}
                  </button>
                ) : null}
                <button
                  className="min-h-36 cursor-pointer rounded-10 border border-border-strong bg-surface px-10 text-13 font-600 text-ink"
                  disabled={busy}
                  onClick={() => {
                    setEditing(resource.id);
                    setTitle(resource.title);
                  }}
                  type="button"
                >
                  {t.rename}
                </button>
                <button
                  className="min-h-36 cursor-pointer rounded-10 border border-border-strong bg-surface px-10 text-13 font-600 text-ink"
                  disabled={busy}
                  onClick={() => {
                    onDelete(resource.id);
                  }}
                  type="button"
                >
                  {t.delete}
                </button>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
