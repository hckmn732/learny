'use client';

import { useState } from 'react';

import { RESOURCE_LIMITS, RESOURCE_RULES } from '@learny/config';
import {
  DELETED_SOURCE_LABEL,
  SIMULATED_UPLOAD_CASES,
  type SimulatedUploadCase,
} from '@learny/contracts';

import { ApiError, api } from '../../lib/api-client';
import { fr } from '../../messages/fr';
import { BaseCard, BaseTokenStyle } from '../sdd/base-tokens';

const t = fr.sdd.spec206;

const buttonClass =
  'rounded-[12px] bg-[#111113] px-4 py-2 text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2';

/** `100000` → `100 000`, with a plain space so the text is stable across browsers. */
function groupThousands(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function Limits() {
  return (
    <BaseCard testId="spec-206-limits" title={t.limits.title}>
      <p className="mb-4 text-sm">{t.limits.intro}</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        <li
          data-testid="spec-206-limit-pdf"
          className="rounded-[16px] border border-solid border-[#E7E6E1] p-4"
        >
          <h3 className="font-semibold">{t.limits.pdf.title}</h3>
          <p className="mt-1 text-sm">
            {t.limits.pdf.value(RESOURCE_RULES.pdfMaxMegabytes, RESOURCE_LIMITS.pdfMaxPages)}
          </p>
        </li>
        <li
          data-testid="spec-206-limit-image"
          className="rounded-[16px] border border-solid border-[#E7E6E1] p-4"
        >
          <h3 className="font-semibold">{t.limits.image.title}</h3>
          <p className="mt-1 text-sm">{t.limits.image.value(RESOURCE_RULES.imageMaxMegabytes)}</p>
          <p className="text-sm">{t.limits.image.formats}</p>
        </li>
        <li
          data-testid="spec-206-limit-note"
          className="rounded-[16px] border border-solid border-[#E7E6E1] p-4"
        >
          <h3 className="font-semibold">{t.limits.note.title}</h3>
          <p className="mt-1 text-sm">
            {t.limits.note.value(groupThousands(RESOURCE_LIMITS.noteMaxChars))}
          </p>
          <p className="text-sm">{t.limits.note.formats}</p>
        </li>
        <li
          data-testid="spec-206-limit-quota"
          className="rounded-[16px] border border-solid border-[#E7E6E1] p-4"
        >
          <h3 className="font-semibold">{t.limits.quota.title}</h3>
          <p className="mt-1 text-sm">
            {t.limits.quota.value(RESOURCE_LIMITS.perChapter, RESOURCE_RULES.storageMaxGigabytes)}
          </p>
          <p className="text-sm">{t.limits.quota.formats}</p>
        </li>
      </ul>
    </BaseCard>
  );
}

type Outcome = { state: 'accepted' } | { state: 'refused'; code: string; detail: string };

async function simulate(name: SimulatedUploadCase): Promise<Outcome> {
  try {
    await api.devUploadSimulation({ body: { case: name } });
    return { state: 'accepted' };
  } catch (error) {
    if (error instanceof ApiError) {
      return { state: 'refused', code: error.code, detail: error.detail };
    }
    throw error;
  }
}

function describeOutcome(outcome: Outcome | undefined): string {
  if (outcome === undefined) return t.cases.pending;
  return outcome.state === 'accepted' ? t.cases.accepted : `${t.cases.refused} · ${outcome.code}`;
}

function Cases() {
  const [outcomes, setOutcomes] = useState<Partial<Record<SimulatedUploadCase, Outcome>>>({});
  const [busy, setBusy] = useState<SimulatedUploadCase | 'all' | null>(null);
  const [announcement, setAnnouncement] = useState('');

  async function runOne(name: SimulatedUploadCase) {
    setBusy(name);
    try {
      const outcome = await simulate(name);
      setOutcomes((current) => ({ ...current, [name]: outcome }));
      setAnnouncement(t.cases.announce(t.cases.labels[name], describeOutcome(outcome)));
    } finally {
      setBusy(null);
    }
  }

  async function runAll() {
    setBusy('all');
    try {
      for (const name of SIMULATED_UPLOAD_CASES) {
        const outcome = await simulate(name);
        setOutcomes((current) => ({ ...current, [name]: outcome }));
      }
      setAnnouncement(t.cases.runAll);
    } finally {
      setBusy(null);
    }
  }

  return (
    <BaseCard testId="spec-206-cases" title={t.cases.title}>
      <p className="mb-3 text-sm">{t.cases.intro}</p>
      <button
        type="button"
        className={buttonClass}
        disabled={busy !== null}
        onClick={() => void runAll()}
      >
        {t.cases.runAll}
      </button>
      <p role="status" aria-live="polite" className="sr-only" data-testid="spec-206-announce">
        {announcement}
      </p>
      <table className="mt-4 w-full table-fixed border-collapse text-left text-sm">
        <caption className="sr-only">{t.cases.caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="w-[44%] border-b border-solid border-[#E7E6E1] py-2 pr-2">
              {t.cases.trialHeader}
            </th>
            <th scope="col" className="w-[33%] border-b border-solid border-[#E7E6E1] py-2 pr-2">
              {t.cases.resultHeader}
            </th>
            <th scope="col" className="w-[23%] border-b border-solid border-[#E7E6E1] py-2">
              {t.cases.actionHeader}
            </th>
          </tr>
        </thead>
        <tbody>
          {SIMULATED_UPLOAD_CASES.map((name) => {
            const outcome = outcomes[name];
            return (
              <tr key={name} data-testid={`spec-206-case-${name}`}>
                <th
                  scope="row"
                  className="break-words border-b border-solid border-[#E7E6E1] py-2 pr-2 font-normal"
                >
                  {t.cases.labels[name]}
                </th>
                <td
                  data-testid={`spec-206-result-${name}`}
                  data-state={outcome?.state ?? 'pending'}
                  className="break-words border-b border-solid border-[#E7E6E1] py-2 pr-2 font-semibold"
                >
                  {describeOutcome(outcome)}
                  {outcome?.state === 'refused' ? (
                    <span className="block text-xs font-normal">{outcome.detail}</span>
                  ) : null}
                </td>
                <td className="border-b border-solid border-[#E7E6E1] py-2">
                  <button
                    type="button"
                    className={`${buttonClass} px-3 py-1`}
                    disabled={busy !== null}
                    onClick={() => void runOne(name)}
                  >
                    {busy === name ? t.cases.running : t.cases.run}
                    <span className="sr-only"> : {t.cases.labels[name]}</span>
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </BaseCard>
  );
}

function CitationExample({ deleted }: Readonly<{ deleted: boolean }>) {
  return (
    <figure
      data-testid="spec-206-citation"
      data-deleted={String(deleted)}
      className="rounded-[16px] border border-solid border-[#E7E6E1] p-4"
    >
      <blockquote className="text-sm">« {t.deletion.quote} »</blockquote>
      <figcaption className="mt-2 text-sm font-semibold">
        <span data-testid="spec-206-citation-label">
          {deleted ? DELETED_SOURCE_LABEL : t.deletion.sourceLabel}
        </span>
      </figcaption>
      <p className="mt-1 text-xs">
        {t.deletion.chunk} : {deleted ? t.deletion.chunkRemoved : t.deletion.chunkKept}
      </p>
    </figure>
  );
}

function Deletion() {
  const [deleted, setDeleted] = useState(false);
  return (
    <BaseCard testId="spec-206-deletion" title={t.deletion.title}>
      <p className="mb-3 text-sm">{t.deletion.intro}</p>
      <p className="mb-2 text-sm font-semibold">{deleted ? t.deletion.after : t.deletion.before}</p>
      <CitationExample deleted={deleted} />
      <p
        role="status"
        aria-live="polite"
        data-testid="spec-206-deletion-status"
        className="mt-3 text-sm"
      >
        {t.deletion.status(deleted)}
      </p>
      <button
        type="button"
        className={`${buttonClass} mt-3`}
        onClick={() => {
          setDeleted((current) => !current);
        }}
      >
        {deleted ? t.deletion.reset : t.deletion.action}
      </button>
    </BaseCard>
  );
}

export default function Spec206Demo() {
  return (
    <>
      <BaseTokenStyle />
      <Limits />
      <Cases />
      <Deletion />
    </>
  );
}
