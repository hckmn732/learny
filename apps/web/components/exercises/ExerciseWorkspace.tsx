'use client';

import NextLink from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { MarkdownContent } from '@learny/bricks/view';
import type {
  ExerciseCorrection,
  ExerciseInstruction,
  ExerciseSubmission,
  PracticeExerciseDto,
} from '@learny/contracts';
import { Button, Select, TextField, Textarea, cn } from '@learny/ui';

import { fr } from '../../messages/fr';

import { CriteriaFeedback } from './CriteriaFeedback';
import { HintButton } from './HintButton';
import type { ProductionIssue } from './issue';
import { StructuredTable } from './StructuredTable';

const t = fr.exercises;

interface Problem {
  code?: string;
  detail?: string;
  errors?: { path: string; message: string }[];
}

function emptySubmission(instruction: ExerciseInstruction): ExerciseSubmission {
  const production = instruction.production;
  if (production.kind === 'table') {
    return {
      kind: 'table',
      fields: {},
      rows: Array.from({ length: production.initialRows }, () => ({})),
      explanation: '',
    };
  }
  if (production.kind === 'text') return { kind: 'text', text: '', explanation: '' };
  if (production.kind === 'file') {
    return { kind: 'file', resourceId: '00000000-0000-0000-0000-000000000000', explanation: '' };
  }
  return { kind: 'link', url: '', explanation: '' };
}

async function postJson(
  url: string,
  method: 'POST' | 'PUT',
  body: unknown,
  idempotencyKey?: string,
): Promise<{ ok: true; data: unknown } | { ok: false; problem: Problem }> {
  const response = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(idempotencyKey === undefined ? {} : { 'Idempotency-Key': idempotencyKey }),
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as unknown;
  if (!response.ok) return { ok: false, problem: data as Problem };
  return { ok: true, data };
}

function issueId(path: string): string {
  if (path === 'explanation') return 'exercise-explanation';
  if (path === 'text') return 'exercise-text';
  if (path === 'url') return 'exercise-link';
  if (path === 'resourceId') return 'exercise-file';
  if (path.startsWith('fields.')) return `exercise-field-${path.slice('fields.'.length)}`;
  if (path.startsWith('rows.'))
    return `exercise-cell-${path.slice('rows.'.length).replace('.', '-')}`;
  return 'exercise-submit';
}

export interface ExerciseWorkspaceProps {
  initial: PracticeExerciseDto;
}

/**
 * SCR-08 workspace (SPEC-613 EF-1 to EF-4). The component owns the production, the debounced draft,
 * the two hints, the submission and the correction; every mutation goes through the versioned API
 * and the server remains the only source of truth for RLS, scores and mastery.
 */
export function ExerciseWorkspace({ initial }: ExerciseWorkspaceProps) {
  const instruction = initial.instruction;
  const [submission, setSubmission] = useState<ExerciseSubmission>(
    initial.attempt?.submission ?? emptySubmission(instruction),
  );
  const [correction, setCorrection] = useState<ExerciseCorrection | null>(
    initial.attempt?.correction ?? null,
  );
  const [hintsUsed, setHintsUsed] = useState(initial.hintsUsed);
  const [revealedHints, setRevealedHints] = useState(initial.revealedHints);
  const [mastery, setMastery] = useState(initial.mastery);
  const [issues, setIssues] = useState<ProductionIssue[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<'submit' | 'hint' | 'retry' | null>(null);
  const [draft, setDraft] = useState<'idle' | 'saving' | 'saved'>('idle');
  const dirty = useRef(false);
  const draftVersion = useRef(0);
  const submitKey = useRef<string>(crypto.randomUUID());

  const locked = correction !== null;
  const maxScore = Math.max(0, 10 - hintsUsed);
  const gapsHref = `/formations/${initial.formationId}/lacunes`;
  const table = instruction.production.kind === 'table' ? instruction.production : null;

  useEffect(() => {
    if (!dirty.current || locked) return;
    const version = draftVersion.current + 1;
    draftVersion.current = version;
    setDraft('saving');
    const timer = setTimeout(() => {
      void (async () => {
        const result = await postJson(`/api/v1/exercises/${initial.exerciseId}/draft`, 'PUT', {
          submission,
        });
        if (draftVersion.current !== version) return;
        setDraft(result.ok ? 'saved' : 'idle');
      })();
    }, 450);
    return () => {
      clearTimeout(timer);
    };
  }, [submission, locked, initial.exerciseId]);

  function update(next: ExerciseSubmission) {
    dirty.current = true;
    setSubmission(next);
  }

  function updateTable(next: ExerciseSubmission) {
    update(next);
  }

  function focusFirst(next: readonly ProductionIssue[]) {
    const first = next[0];
    if (first === undefined) return;
    requestAnimationFrame(() => {
      const target = document.getElementById(issueId(first.path));
      if (target instanceof HTMLElement) target.focus();
    });
  }

  async function requestHint() {
    if (busy !== null || hintsUsed >= 2 || locked) return;
    setBusy('hint');
    setMessage(null);
    const result = await postJson(
      `/api/v1/modules/${initial.moduleId}/exercises/${initial.exerciseId}/hint`,
      'POST',
      {},
      crypto.randomUUID(),
    );
    setBusy(null);
    if (!result.ok) {
      setMessage(result.problem.detail ?? t.hintError);
      return;
    }
    const data = result.data as {
      hintText: string;
      hintsUsed: number;
      maxScore: number;
    };
    setHintsUsed(data.hintsUsed);
    setRevealedHints((previous) => [...previous, data.hintText]);
  }

  async function submit() {
    if (busy !== null || locked) return;
    setBusy('submit');
    setMessage(null);
    setIssues([]);
    const result = await postJson(
      `/api/v1/exercises/${initial.exerciseId}/submissions`,
      'POST',
      { submission },
      submitKey.current,
    );
    setBusy(null);
    if (!result.ok) {
      const nextIssues = result.problem.errors ?? [];
      setIssues(nextIssues);
      setMessage(
        nextIssues.length > 0
          ? (result.problem.detail ?? t.tableError)
          : (result.problem.detail ?? t.submitError),
      );
      focusFirst(nextIssues);
      return;
    }
    const data = result.data as {
      correction: ExerciseCorrection;
      masteryAfter: number;
    };
    setCorrection(data.correction);
    setMastery(data.masteryAfter);
    setDraft('saved');
    requestAnimationFrame(() => {
      document.getElementById('exercise-feedback')?.scrollIntoView({ block: 'start' });
    });
  }

  async function retry() {
    if (busy !== null) return;
    setBusy('retry');
    const result = await postJson(
      `/api/v1/modules/${initial.moduleId}/exercises/${initial.exerciseId}/attempts`,
      'POST',
      {},
      crypto.randomUUID(),
    );
    if (!result.ok) {
      setBusy(null);
      setMessage(result.problem.detail ?? t.submitError);
      return;
    }
    window.location.reload();
  }

  const latestHint = revealedHints[revealedHints.length - 1];

  return (
    <div
      data-testid="exercise-content"
      className="flex min-w-0 flex-col gap-22"
      style={{ overflowX: 'hidden', maxWidth: '100%' }}
    >
      <div className="flex flex-col gap-8">
        <nav aria-label="Fil d’Ariane" className="text-14 text-ink-muted">
          <NextLink
            className="text-indigo-ink underline underline-offset-2"
            href={`/formations/${initial.formationId}/programme`}
          >
            {t.navigation.programme}
          </NextLink>
          {' / '}
          <span>{t.navigation.module(initial.modulePosition, initial.moduleTitle)}</span>
          {' / '}
          <span>{t.breadcrumb}</span>
        </nav>
        <div className="flex flex-wrap items-end justify-between gap-12">
          <div className="flex flex-col gap-6">
            {initial.gapNature === null ? null : (
              <span
                className="max-w-full self-start rounded-full bg-orange-soft px-10 py-4 text-12 font-700 text-orange-ink"
                data-testid="exercise-gap-badge"
              >
                {t.gapBadge(initial.notionLabel)}
              </span>
            )}
            <h1 className="m-0 font-display text-34 font-600 tracking-title">
              {instruction.title}
            </h1>
          </div>
          <ul className="m-0 flex list-none flex-wrap gap-8 p-0 text-13 font-600">
            <li className="rounded-full border border-solid border-border bg-surface px-12 py-8">
              {t.estimates.minutes(instruction.estimatedMinutes)}
            </li>
            <li className="rounded-full border border-solid border-border bg-surface px-12 py-8">
              {t.estimates.tutor}
            </li>
            <li
              className="rounded-full border border-solid border-border bg-surface px-12 py-8"
              data-testid="exercise-hints-left"
            >
              {t.estimates.hints(Math.max(0, 2 - hintsUsed))}
            </li>
          </ul>
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-start gap-20">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-18">
          <section
            aria-labelledby="exercise-brief"
            className="flex flex-col gap-12 rounded-24 bg-ink px-26 py-24 text-white"
            data-testid="exercise-brief"
          >
            <h2
              className="m-0 text-12 font-700 tracking-kicker text-lime uppercase"
              id="exercise-brief"
            >
              {t.brief}
            </h2>
            <div className="[&_a]:text-lime [&_p]:text-white [&_strong]:text-white">
              <MarkdownContent markdown={instruction.taskMd} />
            </div>
            {instruction.data.length === 0 ? null : (
              <ul className="m-0 flex list-none flex-wrap gap-8 p-0 text-13 text-on-dark-secondary">
                {instruction.data.map((entry) => (
                  <li className="rounded-10 bg-dark-800 px-10 py-6" key={entry}>
                    {entry}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            aria-labelledby="exercise-entry"
            className="flex min-w-0 flex-col gap-16 rounded-24 border border-solid border-border bg-surface px-24 py-22"
          >
            <h2 className="m-0 text-18 font-600" id="exercise-entry">
              {t.entry}
            </h2>

            {table === null ? null : (
              <div className="flex flex-wrap gap-14">
                {table.fields.map((field) => {
                  const path = `fields.${field.key}`;
                  const error = issues.find((issue) => issue.path === path)?.message;
                  const value =
                    submission.kind === 'table' ? (submission.fields[field.key] ?? '') : '';
                  const setField = (nextValue: string) => {
                    if (submission.kind !== 'table') return;
                    update({
                      ...submission,
                      fields: { ...submission.fields, [field.key]: nextValue },
                    });
                  };
                  return (
                    <div className="min-w-200 flex-1" key={field.key}>
                      {field.type === 'select' ? (
                        <Select
                          data-testid={`exercise-field-${field.key}`}
                          disabled={locked}
                          error={error}
                          id={`exercise-field-${field.key}`}
                          label={field.label}
                          onChange={(event) => {
                            setField(event.currentTarget.value);
                          }}
                          options={[
                            { value: '', label: t.choose },
                            ...(field.options ?? []).map((option) => ({
                              value: option.value,
                              label: option.label,
                            })),
                          ]}
                          value={value}
                        />
                      ) : (
                        <TextField
                          data-testid={`exercise-field-${field.key}`}
                          disabled={locked}
                          error={error}
                          id={`exercise-field-${field.key}`}
                          label={field.label}
                          onChange={(event) => {
                            setField(event.currentTarget.value);
                          }}
                          value={value}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {table === null || submission.kind !== 'table' ? null : (
              <StructuredTable
                issues={issues}
                locked={locked}
                onChange={updateTable}
                production={table}
                value={submission}
              />
            )}

            {instruction.production.kind === 'text' ? (
              <Textarea
                data-testid="exercise-text"
                disabled={locked}
                error={issues.find((issue) => issue.path === 'text')?.message}
                id="exercise-text"
                label={t.entry}
                maxLength={instruction.production.maxChars}
                onChange={(event) => {
                  update({
                    kind: 'text',
                    text: event.currentTarget.value,
                    explanation: submission.explanation,
                  });
                }}
                rows={6}
                value={submission.kind === 'text' ? submission.text : ''}
              />
            ) : null}

            {instruction.production.kind === 'link' ? (
              <TextField
                data-testid="exercise-link"
                disabled={locked}
                error={issues.find((issue) => issue.path === 'url')?.message}
                id="exercise-link"
                label={t.entry}
                onChange={(event) => {
                  update({
                    kind: 'link',
                    url: event.currentTarget.value,
                    explanation: submission.explanation,
                  });
                }}
                type="url"
                value={submission.kind === 'link' ? submission.url : ''}
              />
            ) : null}

            {instruction.production.kind === 'file' ? (
              <TextField
                data-testid="exercise-file"
                disabled={locked}
                error={issues.find((issue) => issue.path === 'resourceId')?.message}
                hint="Identifiant de l’apport déposé dans vos ressources."
                id="exercise-file"
                label={t.entry}
                onChange={(event) => {
                  update({
                    kind: 'file',
                    resourceId: event.currentTarget.value,
                    explanation: submission.explanation,
                  });
                }}
                value={submission.kind === 'file' ? submission.resourceId : ''}
              />
            ) : null}
          </section>

          {instruction.explanationPrompt === null ? null : (
            <section
              aria-labelledby="exercise-explanation-title"
              className="flex flex-col gap-10 rounded-24 border border-solid border-border bg-surface px-24 py-22"
            >
              <h2 className="m-0 text-18 font-600" id="exercise-explanation-title">
                {t.explanation}
              </h2>
              <Textarea
                data-testid="exercise-explanation"
                disabled={locked}
                error={issues.find((issue) => issue.path === 'explanation')?.message}
                hint={instruction.explanationPrompt}
                id="exercise-explanation"
                label={instruction.explanationPrompt}
                hideLabel
                onChange={(event) => {
                  const explanation = event.currentTarget.value;
                  update(
                    submission.kind === 'table'
                      ? { ...submission, explanation }
                      : submission.kind === 'text'
                        ? { ...submission, explanation }
                        : submission.kind === 'file'
                          ? { ...submission, explanation }
                          : { ...submission, explanation },
                  );
                }}
                rows={3}
                value={submission.explanation ?? ''}
              />
            </section>
          )}

          {latestHint === undefined ? null : (
            <div
              className="flex gap-12 rounded-18 bg-lime-softer px-16 py-14 text-lime-ink-strong"
              data-testid="exercise-hint-box"
              role="status"
            >
              <strong className="flex-none">{t.hintUsed(hintsUsed)}</strong>
              <span className="text-14 leading-1.5">{latestHint}</span>
            </div>
          )}

          {message === null ? null : (
            <p
              className="m-0 text-13 font-600 text-orange-ink"
              role="alert"
              data-testid="exercise-message"
            >
              {message}
            </p>
          )}

          {correction === null ? (
            <div className="flex flex-wrap justify-end gap-10">
              <HintButton
                disabled={busy !== null}
                hintsLeft={Math.max(0, 2 - hintsUsed)}
                loading={busy === 'hint'}
                onHint={() => {
                  void requestHint();
                }}
              />
              <Button
                aria-busy={busy === 'submit' || undefined}
                data-testid="exercise-submit"
                disabled={busy !== null}
                loading={busy === 'submit'}
                onClick={() => {
                  void submit();
                }}
                size="lg"
                variant="dark"
              >
                {busy === 'submit' ? t.submitting : t.submit}
              </Button>
            </div>
          ) : (
            <CriteriaFeedback
              busy={busy === 'retry'}
              correction={correction}
              gapsHref={gapsHref}
              onRetry={() => {
                void retry();
              }}
            />
          )}

          <span
            aria-live="polite"
            className="sr-only"
            data-testid="exercise-draft-status"
            role="status"
          >
            {draft === 'saving' ? t.draftSaving : draft === 'saved' ? t.draftSaved : ''}
          </span>
        </div>

        <aside
          aria-label="À propos de cet exercice"
          className="flex flex-[1_1_280px] flex-col gap-16"
        >
          <section className="flex flex-col gap-12 rounded-24 border border-solid border-border bg-surface px-20 py-20">
            <h2 className="m-0 text-16 font-700">{t.why}</h2>
            <p className="m-0 text-14 leading-1.55 text-ink-secondary">{t.whyBody}</p>
            <div className="flex flex-col gap-6">
              <div className="flex justify-between text-13">
                <span className="text-ink-muted">{t.mastery(initial.notionLabel)}</span>
                <strong className="tabular-nums">{Math.round(mastery)} %</strong>
              </div>
              <div aria-hidden="true" className="h-8 rounded-4 bg-surface-muted">
                <div
                  className={cn(
                    'h-8 rounded-4',
                    mastery >= initial.masteryThreshold ? 'bg-teal' : 'bg-orange',
                  )}
                  style={{ width: `${String(mastery)}%` }}
                />
              </div>
              <span className="text-12 text-ink-muted">
                {t.threshold(initial.masteryThreshold)}
              </span>
            </div>
          </section>

          <section className="flex flex-col gap-10 rounded-24 border border-solid border-border bg-surface px-20 py-20">
            <h2 className="m-0 text-16 font-700" data-testid="exercise-scale-title">
              {t.scale(maxScore)}
            </h2>
            <ul className="m-0 flex list-disc flex-col gap-6 pl-18 text-14 leading-1.45 text-ink-secondary">
              {instruction.criteria.map((criterion) => (
                <li key={criterion.key}>
                  {criterion.label} · {criterion.points} pts
                </li>
              ))}
            </ul>
            <p className="m-0 text-12 text-ink-muted">{t.scaleHint}</p>
          </section>

          <NextLink
            className="flex items-center gap-10 rounded-20 bg-ink px-18 py-16 text-14 font-600 text-white no-underline"
            href={`/formations/${initial.formationId}/programme`}
          >
            <span
              aria-hidden="true"
              className="inline-flex size-30 items-center justify-center rounded-9 bg-lime text-ink"
            >
              ✦
            </span>
            {t.chapter}
          </NextLink>
        </aside>
      </div>
    </div>
  );
}
