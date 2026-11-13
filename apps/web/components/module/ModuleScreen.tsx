'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { ModuleScreen as ModuleScreenDto } from '@learny/contracts';
import { colors } from '@learny/ui/tokens';

import { api } from '../../lib/api-client';
import { fr } from '../../messages/fr';
import { formatRange } from '../programme/dates';

import { ChapterTabs } from './ChapterTabs';
import { ResourceDropzone } from './ResourceDropzone';
import { ResourceList } from './ResourceList';
import { ResourceSuggestion } from './ResourceSuggestion';

const t = fr.module;

const PENDING_STATUSES = new Set(['queued', 'processing']);

function messageOf(cause: unknown): string {
  return cause instanceof Error && cause.message !== '' ? cause.message : t.errors.generic;
}

function noteTitle(text: string, examGuide: boolean): string {
  const first = text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line !== '');
  const base = (first ?? t.noteFallbackTitle).slice(0, 180);
  return examGuide ? `Guide d’examen · ${base}`.slice(0, 200) : base;
}

function fileTitle(name: string, examGuide: boolean): string {
  const base = name.replace(/\.[^.]+$/, '').trim() || t.fileFallbackTitle;
  return examGuide ? `Guide d’examen · ${base}`.slice(0, 200) : base.slice(0, 200);
}

function linkTitle(title: string, url: string, examGuide: boolean): string {
  const base = title.trim() === '' ? new URL(url).hostname : title.trim();
  return examGuide ? `Guide d’examen · ${base}`.slice(0, 200) : base.slice(0, 200);
}

export interface ModuleScreenProps {
  initial: ModuleScreenDto;
}

/**
 * SCR-06 — module and apports (SPEC-607). The server passes the RLS read model; this component only
 * runs the mutations and the 3-second polling of ADR-0065 while a contribution is queued or being
 * processed. Everything the learner can do is a real form or button, and every refusal is announced
 * by a live region.
 */
export function ModuleScreen({ initial }: ModuleScreenProps) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['module-screen', initial.module.id, initial.selectedChapterId],
    queryFn: () =>
      api.moduleScreen({
        params: { mid: initial.module.id },
        query: { chapitre: initial.selectedChapterId },
      }),
    initialData: initial,
    refetchInterval: (current) => {
      const data = current.state.data;
      return data?.resources.some((resource) => PENDING_STATUSES.has(resource.status)) === true
        ? 3000
        : false;
    },
  });
  const screen = query.data;
  const selected = screen.chapters.find((chapter) => chapter.id === screen.selectedChapterId);
  const chapterDone = selected?.contributionsStatus === 'done';

  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({
      queryKey: ['module-screen', screen.module.id, screen.selectedChapterId],
    });
  };

  const run = async (
    action: () => Promise<unknown>,
    success: string,
  ): Promise<void> => {
    setPending(true);
    setNotice(null);
    try {
      const custom = await action();
      await refresh();
      setNotice({ tone: 'success', text: typeof custom === 'string' ? custom : success });
    } catch (cause) {
      setNotice({ tone: 'error', text: messageOf(cause) });
    } finally {
      setPending(false);
    }
  };

  const runResource = async (id: string, action: () => Promise<void>, success: string) => {
    setBusyId(id);
    setNotice(null);
    try {
      await action();
      await refresh();
      setNotice({ tone: 'success', text: success });
    } catch (cause) {
      setNotice({ tone: 'error', text: messageOf(cause) });
    } finally {
      setBusyId(null);
    }
  };

  const uploadFile = async (
    file: File,
    _kind: 'pdf' | 'image',
    mime: string,
    examGuide: boolean,
  ): Promise<void> => {
    const created = await api.uploadsCreate(
      {
        params: { cid: screen.selectedChapterId },
        body: {
          fileName: file.name,
          mime,
          sizeBytes: file.size,
          title: fileTitle(file.name, examGuide),
        },
      },
      { idempotencyKey: crypto.randomUUID() },
    );
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    const put = await fetch(created.uploadUrl, {
      method: 'PUT',
      headers: { apikey: anonKey, 'content-type': mime },
      body: file,
    });
    if (!put.ok) {
      throw new Error(t.errors.uploadFailed);
    }
    await api.resourcesFinalize({ params: { rid: created.resourceId } });
    await refresh();
    setNotice({ tone: 'success', text: t.fileAdded });
  };

  const screenTitle = selected === undefined ? screen.module.title : selected.title;

  return (
    <main className="mx-auto w-full px-16 pb-40 shell:px-40">
      <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-24" data-testid="module-page">
        <div className="flex flex-wrap items-center justify-between gap-16" data-testid="module-header">
          <div className="flex flex-1 basis-420 flex-col gap-8">
            <nav aria-label="Fil d’Ariane" className="text-14 text-ink-muted">
              <a className="underline" href={`/formations/${encodeURIComponent(screen.formation.id)}/programme`}>
                {t.breadcrumbProgramme}
              </a>{' '}
              / Module {screen.module.position}
            </nav>
            <span className="self-start rounded-full bg-ink px-10 py-4 text-12 font-700 text-white">
              {t.badge(screen.module.position, screen.module.positionTotal)}
            </span>
            <h1 className="m-0 font-display text-34 font-600 tracking-title">
              {screen.module.title}
            </h1>
            <p className="m-0 text-14 text-ink-muted">
              {t.dates(
                formatRange(screen.module.plannedStart, screen.module.plannedEnd),
                screen.module.threshold,
              )}
            </p>
          </div>
          <div className="flex items-center gap-14 rounded-20 border border-border bg-surface px-18 py-14">
            <span
              aria-label={t.chaptersDoneLabel(screen.counts.chaptersDone, screen.counts.chaptersTotal)}
              className="relative inline-flex h-56 w-56 items-center justify-center"
              role="img"
            >
              <svg aria-hidden="true" className="block" height="56" viewBox="0 0 56 56" width="56">
                <circle cx="28" cy="28" fill="none" r="22" stroke={colors["surface-muted"]} strokeWidth="7" />
                <circle
                  cx="28"
                  cy="28"
                  fill="none"
                  r="22"
                  stroke={colors.ink}
                  strokeDasharray={`${String((138.2 * screen.counts.chaptersDone) / Math.max(1, screen.counts.chaptersTotal))} 138.2`}
                  strokeLinecap="round"
                  strokeWidth="7"
                  transform="rotate(-90 28 28)"
                />
              </svg>
              <span
                aria-hidden="true"
                className="absolute inset-0 flex items-center justify-center font-display text-15 font-600"
              >
                {screen.counts.chaptersDone}/{screen.counts.chaptersTotal}
              </span>
            </span>
            <span className="flex flex-col">
              <span className="text-14 font-700">{t.chaptersDone}</span>
              <span className="text-13 text-ink-muted">{t.contributions}</span>
            </span>
          </div>
        </div>

        {notice === null ? null : (
          <p
            className={
              notice.tone === 'success'
                ? 'm-0 rounded-14 bg-green-soft px-14 py-10 text-14 text-green-ink'
                : 'm-0 rounded-14 bg-orange-soft px-14 py-10 text-14 text-orange-ink-strong'
            }
            data-testid="module-notice"
            role={notice.tone === 'error' ? 'alert' : 'status'}
          >
            {notice.text}
          </p>
        )}

        <div className="flex flex-wrap items-start gap-20">
          <ChapterTabs
            chapters={screen.chapters}
            formationId={screen.formation.id}
            moduleId={screen.module.id}
            selectedChapterId={screen.selectedChapterId}
          />

          <div className="flex min-w-0 flex-1 basis-560 flex-col gap-20">
            <section
              aria-labelledby="t-chapitre"
              className="flex flex-col gap-22 rounded-28 border border-border bg-surface p-28"
              data-testid="module-chapter-panel"
            >
              <div className="flex flex-col gap-8">
                <h2
                  className="m-0 font-display text-26 font-600 tracking-heading"
                  id="t-chapitre"
                >
                  {t.chapterTitle(selected?.position ?? 1, screenTitle)}
                </h2>
                <p className="m-0 text-15 leading-1.55 text-ink-muted">{t.dropIntro}</p>
              </div>

              <ResourceDropzone
                onFile={uploadFile}
                onNote={async (text, examGuide) => {
                  await run(async () => {
                    await api.resourcesCreate({
                      params: { cid: screen.selectedChapterId },
                      body: {
                        kind: 'note',
                        title: noteTitle(text, examGuide),
                        text,
                      },
                    });
                  }, t.noteAdded);
                }}
                onUrl={async (kind, url, title) => {
                  await run(async () => {
                    await api.resourcesCreate({
                      params: { cid: screen.selectedChapterId },
                      body: {
                        kind,
                        url,
                        title: linkTitle(title, url, false),
                      },
                    });
                  }, t.linkAdded);
                }}
                pending={pending}
              />

              <div className="flex flex-col gap-10">
                <h3 className="m-0 text-15 font-700">
                  {t.resourcesTitle(screen.counts.chapterResources)}
                </h3>
                <ResourceList
                  busyId={busyId}
                  onDelete={(id) => {
                    void runResource(
                      id,
                      async () => {
                        await api.resourcesDelete({ params: { rid: id } });
                      },
                      t.deleted,
                    );
                  }}
                  onRename={(id, title) => {
                    const target = screen.resources.find((resource) => resource.id === id);
                    void runResource(
                      id,
                      async () => {
                        await api.resourcesRename({
                          params: { rid: id },
                          body: {
                            title,
                            ...(target === undefined
                              ? {}
                              : { expectedUpdatedAt: target.updatedAt }),
                          },
                        });
                      },
                      t.renamed,
                    );
                  }}
                  onRetry={(id) => {
                    void runResource(
                      id,
                      async () => {
                        await api.resourcesRetry({ params: { rid: id } });
                      },
                      t.retried,
                    );
                  }}
                  resources={screen.resources}
                />
              </div>

              <ResourceSuggestion
                busyId={busyId}
                onDismiss={(id) => {
                  void runResource(
                    id,
                    async () => {
                      await api.suggestionsDismiss({ params: { rid: id } });
                    },
                    t.suggestionDismissed,
                  );
                }}
                onImport={(id) => {
                  void runResource(
                    id,
                    async () => {
                      await api.suggestionsImport({ params: { rid: id } });
                    },
                    t.suggestionImported,
                  );
                }}
                suggestions={screen.suggestions}
              />

              <button
                className={
                  chapterDone
                    ? 'inline-flex min-h-48 w-fit cursor-pointer items-center rounded-14 border border-border-strong bg-surface px-22 text-15 font-700 text-ink'
                    : 'inline-flex min-h-48 w-fit cursor-pointer items-center rounded-14 border-0 bg-ink px-22 text-15 font-700 text-white'
                }
                data-done={chapterDone}
                data-testid="chapter-complete"
                disabled={pending}
                onClick={() => {
                  void run(async () => {
                    const result = await api.chapterComplete({
                      params: { cid: screen.selectedChapterId },
                      body: { done: !chapterDone },
                    });
                    if (result.generationRequested) {
                      return t.generationRequested;
                    }
                    return undefined;
                  }, chapterDone ? t.reopened : t.completed);
                }}
                type="button"
              >
                {chapterDone ? t.chapterReopen : t.chapterComplete}
              </button>
            </section>

            <section
              aria-labelledby="t-cours"
              className="flex flex-wrap items-center justify-between gap-16 rounded-28 bg-ink px-28 py-24 text-white"
            >
              <div className="flex flex-1 basis-380 flex-col gap-6">
                <h2 className="m-0 font-display text-20 font-600" id="t-cours">
                  {t.courseTitle}
                </h2>
                <p className="m-0 text-14 leading-1.55 text-on-dark-secondary">
                  {screen.allChaptersDone ? t.courseAllDone : t.courseOpen}
                </p>
              </div>
              <button
                className="inline-flex min-h-48 cursor-pointer items-center rounded-14 bg-lime px-22 text-15 font-700 text-ink"
                data-testid="course-generate"
                disabled={pending}
                onClick={() => {
                  void run(async () => {
                    await api.moduleGenerateCourse({ params: { mid: screen.module.id } });
                  }, t.generationRequested);
                }}
                type="button"
              >
                {pending ? t.generating : t.generate}
              </button>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
