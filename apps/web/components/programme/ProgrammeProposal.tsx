'use client';

import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import type { ImportProgrammeInput, ProgrammeProposalStateDto } from '@learny/contracts';
import { isActiveProgramme } from '@learny/contracts';
import { AppError } from '@learny/core';
import { Button } from '@learny/ui';

import { api } from '../../lib/api-client';
import { fr } from '../../messages/fr';

import { AdjustDialog } from './AdjustDialog';
import { formatLongDate } from './dates';
import { ProgrammeModuleList } from './ProgrammeModuleList';
import { ProgrammeTimeline } from './ProgrammeTimeline';
import { ProposalHeader } from './ProposalHeader';
import { ValidateDialog } from './ValidateDialog';

const t = fr.programme;

function errorText(code: string | undefined): string {
  const errors = t.errors as Record<string, string | undefined>;
  return (code === undefined ? undefined : errors[code]) ?? t.errors.GENERIC;
}

function asAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError('INTERNAL_ERROR', t.errors.GENERIC);
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : '';
      const comma = value.indexOf(',');
      resolve(comma === -1 ? value : value.slice(comma + 1));
    };
    reader.onerror = () => {
      reject(new Error('read'));
    };
    reader.readAsDataURL(file);
  });
}

function LoadingState() {
  return (
    <div
      aria-live="polite"
      className="flex flex-col items-center gap-12 rounded-24 border border-border bg-surface px-24 py-40 text-center"
      data-testid="programme-generating"
    >
      <span className="h-12 w-12 animate-spin rounded-full border-2 border-border-strong border-t-ink motion-reduce:animate-none" />
      <p className="m-0 text-16 font-700">{t.generating}</p>
      <p className="m-0 text-14 text-ink-muted">{t.generatingHint}</p>
    </div>
  );
}

function EmptyState({ onGenerate, loading }: { onGenerate: () => void; loading: boolean }) {
  return (
    <div
      className="flex flex-col items-center gap-12 rounded-24 border border-border bg-surface px-24 py-40 text-center"
      data-testid="programme-empty"
    >
      <p className="m-0 font-display text-22 font-600">{t.emptyTitle}</p>
      <p className="m-0 text-14 text-ink-muted">{t.emptyBody}</p>
      <Button loading={loading} onClick={onGenerate} type="button" variant="dark">
        {t.generate}
      </Button>
    </div>
  );
}

function ErrorAlert({ code, onRetry }: { code: string; onRetry: () => void }) {
  return (
    <div
      className="rounded-16 border border-orange-ink/40 bg-orange-soft px-16 py-14 text-14 text-orange-ink-strong"
      data-testid="programme-error"
      role="alert"
    >
      <p className="m-0">{errorText(code)}</p>
      <div className="mt-8 flex flex-wrap items-center gap-12">
        <button
          className="cursor-pointer rounded-10 border border-orange-ink bg-transparent px-12 py-6 text-13 font-600 text-orange-ink"
          onClick={onRetry}
          type="button"
        >
          {t.retry}
        </button>
        {code === 'AI_UNAVAILABLE' ? (
          <a className="font-600" href="/parametres#modeles">
            {t.settingsLink}
          </a>
        ) : null}
      </div>
    </div>
  );
}

interface ImportPanelProps {
  disabled: boolean;
  loading: boolean;
  error: string | null;
  onImport: (input: ImportProgrammeInput) => void;
}

function ImportPanel({ disabled, loading, error, onImport }: ImportPanelProps) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const submitFile = async () => {
    if (file === null) {
      setLocalError(t.importEmpty);
      return;
    }
    if (file.size > 700_000) {
      setLocalError(t.importTooLarge);
      return;
    }
    setLocalError(null);
    const contentBase64 = await toBase64(file);
    onImport({ kind: 'file', filename: file.name, contentBase64 });
  };

  return (
    <section
      aria-labelledby="t-import"
      className="flex flex-col gap-16 rounded-24 border border-border bg-surface p-28"
      data-testid="programme-import"
    >
      <h2 className="m-0 font-display text-22 font-600" id="t-import">
        {t.importTitle}
      </h2>
      <div className="flex flex-col items-center gap-12 rounded-22 border-2 border-dashed border-border-dashed bg-surface-subtle px-20 py-40 text-center">
        <p className="m-0 text-16 font-600">{t.importDrop}</p>
        <p className="m-0 text-14 text-ink-muted">{t.importHint}</p>
        <label className="inline-flex min-h-44 cursor-pointer items-center rounded-12 border border-border-strong bg-surface px-18 text-14 font-600">
          {t.importBrowse}
          <input
            accept=".pdf,.docx,.txt,.md,.markdown"
            className="sr-only"
            data-testid="programme-import-file"
            disabled={disabled || loading}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
            }}
            type="file"
          />
        </label>
        {file === null ? null : <span className="text-13 text-ink-muted">{file.name}</span>}
        {file === null ? null : (
          <Button
            disabled={disabled}
            loading={loading}
            onClick={() => void submitFile()}
            type="button"
            variant="outline"
          >
            {t.importFileAction}
          </Button>
        )}
      </div>
      <label className="flex flex-col gap-8 text-14 font-600" htmlFor="programme-import-text">
        {t.importTextLabel}
        <textarea
          className="min-h-[140px] w-full resize-y rounded-14 border border-border-strong bg-surface p-14 text-14"
          data-testid="programme-import-text"
          disabled={disabled || loading}
          id="programme-import-text"
          onChange={(event) => {
            setText(event.target.value);
          }}
          placeholder={t.importTextPlaceholder}
          value={text}
        />
      </label>
      <div className="flex items-center gap-12">
        <Button
          data-testid="programme-import-submit"
          disabled={text.trim().length === 0}
          loading={loading}
          onClick={() => {
            setLocalError(null);
            onImport({ kind: 'text', text: text.trim() });
          }}
          type="button"
          variant="dark"
        >
          {loading ? t.importing : t.importAction}
        </Button>
        {file === null ? null : <span className="text-13 text-ink-muted">{t.importRetry}</span>}
      </div>
      {localError === null ? null : (
        <p className="m-0 text-13 font-600 text-orange-ink" role="alert">
          {localError}
        </p>
      )}
      {error === null ? null : (
        <p className="m-0 text-13 font-600 text-orange-ink" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export interface ProgrammeProposalProps {
  fid: string;
  initial: ProgrammeProposalStateDto;
}

export function ProgrammeProposal({ fid, initial }: ProgrammeProposalProps) {
  const [state, setState] = useState(initial);
  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [sourceTab, setSourceTab] = useState<'proposed' | 'import'>('proposed');
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [validateOpen, setValidateOpen] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const generated = useRef(false);
  const generateKey = useRef<string>(crypto.randomUUID());

  const generate = useMutation({
    mutationFn: () =>
      api.programmeGenerate(
        { params: { fid }, body: { expectedVersion: 0 } },
        { idempotencyKey: generateKey.current },
      ),
    onSuccess: (data) => {
      setState(data);
      setGenerationError(null);
    },
    onError: (error) => {
      setGenerationError(asAppError(error).code);
    },
  });

  useEffect(() => {
    if (
      !generated.current &&
      state.proposal === null &&
      state.cadrageCompleted &&
      (state.formationStatus === 'cadrage' || state.formationStatus === 'programme_proposed')
    ) {
      generated.current = true;
      generate.mutate();
    }
  }, [state, generate]);

  const loadVersion = async (version: number | null) => {
    try {
      const data = await api.programmeGet({
        params: { fid },
        ...(version === null ? {} : { query: { version } }),
      });
      if (isActiveProgramme(data)) return;
      setState(data);
      setViewVersion(version);
      setDialogError(null);
    } catch (error) {
      setDialogError(errorText(asAppError(error).code));
    }
  };

  const current = state.proposal;
  const isCurrent = current !== null && viewVersion === null;

  const adjust = useMutation({
    mutationFn: (message: string) =>
      api.programmeAdjust({
        params: { fid },
        body: { expectedVersion: current?.version ?? 1, message },
      }),
    onSuccess: (data) => {
      setState(data);
      setViewVersion(null);
      setAdjustOpen(false);
      setDialogError(null);
    },
    onError: (error) => {
      const appError = asAppError(error);
      setDialogError(errorText(appError.code));
      if (appError.code === 'CONFLICT') void loadVersion(null);
    },
  });

  const validate = useMutation({
    mutationFn: () =>
      api.programmeValidate({
        params: { fid },
        body: { expectedVersion: current?.version ?? 1 },
      }),
    onSuccess: (data) => {
      setState(data);
      setViewVersion(null);
      setValidateOpen(false);
      setDialogError(null);
    },
    onError: (error) => {
      setDialogError(errorText(asAppError(error).code));
    },
  });

  const importProgramme = useMutation({
    mutationFn: (input: ImportProgrammeInput) =>
      api.programmeImport({
        params: { fid },
        body: { ...input, expectedVersion: current?.version ?? 0 },
      }),
    onSuccess: (data) => {
      setState(data);
      setViewVersion(null);
      setImportError(null);
      setSourceTab('proposed');
    },
    onError: (error) => {
      setImportError(errorText(asAppError(error).code));
    },
  });

  if (current === null) {
    return (
      <main className="mx-auto w-full px-16 pb-40 shell:px-40">
        <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-24">
          {generationError === null ? null : (
            <ErrorAlert
              code={generationError}
              onRetry={() => {
                generate.mutate();
              }}
            />
          )}
          {generate.isPending ? (
            <LoadingState />
          ) : (
            <EmptyState
              loading={false}
              onGenerate={() => {
                generate.mutate();
              }}
            />
          )}
        </div>
      </main>
    );
  }

  const chapters = current.modules.reduce((count, module) => count + module.chapters.length, 0);
  const lastGenerated = current.modules.at(-1);

  return (
    <main className="mx-auto w-full px-16 pb-40 shell:px-40">
      <div
        className="mx-auto flex w-full max-w-[1160px] flex-col gap-24"
        data-testid="programme-proposal"
      >
        <ProposalHeader
          isCurrent={isCurrent}
          onAdjust={() => {
            setDialogError(null);
            setAdjustOpen(true);
          }}
          onValidate={() => {
            setDialogError(null);
            setValidateOpen(true);
          }}
          proposal={current}
        />
        {viewVersion === null ? null : (
          <div className="flex flex-wrap items-center justify-between gap-12 rounded-16 border border-indigo/40 bg-indigo-soft px-16 py-12 text-14 text-indigo-ink-strong">
            <span>
              <strong>{t.oldVersion}</strong> {t.oldVersionBody}
            </span>
            <button
              className="cursor-pointer rounded-10 border border-indigo-ink bg-transparent px-12 py-6 font-600 text-indigo-ink-strong"
              onClick={() => void loadVersion(null)}
              type="button"
            >
              {t.backToCurrent}
            </button>
          </div>
        )}

        {generationError === null ? null : (
          <ErrorAlert
            code={generationError}
            onRetry={() => {
              generate.mutate();
            }}
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-12">
          <div
            aria-label={t.sourceLabel}
            className="inline-flex flex-wrap gap-4 rounded-14 border border-border bg-surface p-4"
            role="radiogroup"
          >
            <button
              aria-checked={sourceTab === 'proposed' ? 'true' : 'false'}
              className={
                sourceTab === 'proposed'
                  ? 'min-h-44 cursor-pointer rounded-10 border-0 bg-ink px-16 text-14 font-700 text-white'
                  : 'min-h-44 cursor-pointer rounded-10 border-0 bg-transparent px-16 text-14 font-500 text-ink-muted'
              }
              data-testid="programme-source-proposed"
              onClick={() => {
                setSourceTab('proposed');
              }}
              role="radio"
              type="button"
            >
              {t.sourceGeneratedLong}
            </button>
            <button
              aria-checked={sourceTab === 'import' ? 'true' : 'false'}
              className={
                sourceTab === 'import'
                  ? 'min-h-44 cursor-pointer rounded-10 border-0 bg-ink px-16 text-14 font-700 text-white'
                  : 'min-h-44 cursor-pointer rounded-10 border-0 bg-transparent px-16 text-14 font-500 text-ink-muted'
              }
              data-testid="programme-source-import"
              onClick={() => {
                setSourceTab('import');
              }}
              role="radio"
              type="button"
            >
              {t.sourceImportedLong}
            </button>
          </div>
          <span className="text-13 text-ink-muted">{t.sourceNote}</span>
        </div>

        {sourceTab === 'import' ? (
          <ImportPanel
            disabled={importProgramme.isPending}
            error={importError}
            loading={importProgramme.isPending}
            onImport={(input) => {
              importProgramme.mutate(input);
            }}
          />
        ) : null}

        <ProgrammeTimeline modules={current.modules} />
        <ProgrammeModuleList formationId={fid} modules={current.modules} />

        <section aria-labelledby="t-versions" className="flex flex-col gap-8">
          <h2 className="m-0 font-display text-18 font-600" id="t-versions">
            {t.versions}
          </h2>
          <ul className="m-0 flex list-none flex-wrap gap-8 p-0">
            {current.versions.map((version) => (
              <li key={version.version}>
                <button
                  className={
                    version.current
                      ? 'cursor-pointer rounded-12 border border-ink bg-ink px-14 py-8 text-13 font-700 text-white'
                      : 'cursor-pointer rounded-12 border border-border bg-surface px-14 py-8 text-13 font-600 text-ink'
                  }
                  data-testid={`programme-version-${String(version.version)}`}
                  onClick={() => void loadVersion(version.current ? null : version.version)}
                  type="button"
                >
                  {t.versionLabel(version.version)} ·{' '}
                  {version.source === 'imported' ? t.sourceImported : t.sourceGenerated} ·{' '}
                  {formatLongDate(version.createdAt.slice(0, 10))}
                </button>
              </li>
            ))}
          </ul>
        </section>

        {current.proposalStatus === 'active' ? (
          <section
            className="rounded-20 border border-lime-border bg-lime-softer px-18 py-16"
            data-testid="programme-active"
          >
            <h2 className="m-0 font-display text-18 font-600 text-lime-ink-strong">
              {t.activeTitle}
            </h2>
            <p className="m-0 mt-6 text-14 text-lime-ink">{t.activeBody}</p>
            <p className="m-0 mt-6 text-13 text-ink-muted">
              {t.validateSummary(current.modules.length, chapters)}
              {lastGenerated === undefined ? '' : ` · ${formatLongDate(lastGenerated.plannedEnd)}`}
            </p>
          </section>
        ) : null}
      </div>

      <AdjustDialog
        error={dialogError}
        loading={adjust.isPending}
        onOpenChange={setAdjustOpen}
        onSubmit={(message) => {
          adjust.mutate(message);
        }}
        open={adjustOpen}
      />
      <ValidateDialog
        error={dialogError}
        loading={validate.isPending}
        onConfirm={() => {
          validate.mutate();
        }}
        onOpenChange={setValidateOpen}
        open={validateOpen}
        proposal={current}
      />
    </main>
  );
}
