'use client';

import { WifiOff } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { clock } from '@learny/core';
import { EmptyState, Skeleton } from '@learny/ui';

import { getPack, type StoredPack } from '../../lib/offline/db';
import { availablePacks } from '../../lib/offline/pack';
import { fr } from '../../messages/fr/offline-system';

import { OfflineQuizGlobal } from './OfflineQuizGlobal';

const t = fr.offline.page;

function dayLabel(day: string): string {
  const parsed = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return day;
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(parsed);
}

function today(): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(clock.now());
}

/** EF-10 — list of the packs available offline on this device. */
export function OfflinePackList() {
  const [packs, setPacks] = useState<StoredPack[] | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    titleRef.current?.focus();
    void availablePacks(clock.now())
      .then(setPacks)
      .catch(() => {
        setPacks([]);
      });
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-24 px-20 py-48 shell:px-40">
      <div className="flex flex-col gap-8">
        <p className="m-0 text-14 font-600 text-ink-muted">{t.eyebrow}</p>
        <h1
          className="m-0 font-display text-34 font-600 tracking-title text-ink outline-none"
          ref={titleRef}
          tabIndex={-1}
        >
          {t.title}
        </h1>
        <p className="m-0 text-15 leading-1.6 text-ink-muted">{t.body}</p>
      </div>
      {packs === null ? (
        <Skeleton className="h-120 w-full rounded-24" />
      ) : packs.length === 0 ? (
        <EmptyState data-testid="offline-empty" description={t.emptyBody} title={t.emptyTitle} />
      ) : (
        <ul
          aria-label={t.packsLabel}
          className="m-0 flex list-none flex-col gap-16 p-0"
          data-testid="offline-packs"
        >
          {packs.map((pack) => (
            <li
              className="flex flex-wrap items-center justify-between gap-16 rounded-24 border border-solid border-border bg-surface p-24"
              data-testid={`offline-pack-${pack.formationId}`}
              key={pack.formationId}
            >
              <div className="flex min-w-0 flex-col gap-6">
                <h2 className="m-0 font-display text-20 font-600 text-ink">
                  {pack.formationTitle}
                </h2>
                <p className="m-0 text-14 text-ink-muted">
                  {t.session(dayLabel(pack.localDate))}
                  {pack.localDate === today() ? '' : ` (${t.preparedYesterday})`} ·{' '}
                  {t.meta(pack.session.header.notionCount, pack.extraCards.length)}
                </p>
              </div>
              <Link
                className="inline-flex min-h-44 items-center rounded-12 bg-lime px-18 text-14 font-700 text-ink no-underline"
                href={`/formations/${pack.formationId}/quiz-global`}
              >
                {t.review}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-12">
        <a
          className="inline-flex min-h-44 items-center rounded-12 border border-solid border-border-strong px-18 text-14 font-700 text-ink no-underline"
          href="/hors-ligne"
        >
          {t.retry}
        </a>
        <span className="flex items-center gap-8 text-13 text-ink-muted">
          <WifiOff aria-hidden="true" className="h-16 w-16" />
          {fr.system.offline.hint}
        </span>
      </div>
    </main>
  );
}

function formationIdFromLocation(): string | null {
  const match = /^\/formations\/([^/]+)\/quiz-global(?:\/|$)/.exec(window.location.pathname);
  if (match?.[1] !== undefined) return match[1];
  return new URLSearchParams(window.location.search).get('formation');
}

/** ET-3 — `/hors-ligne/revisions` served in place of a formation quiz URL by the service worker. */
export function OfflineRevision() {
  const [pack, setPack] = useState<StoredPack | null | undefined>(undefined);

  useEffect(() => {
    const formationId = formationIdFromLocation();
    if (formationId === null) {
      void Promise.resolve().then(() => {
        setPack(null);
      });
      return;
    }
    void getPack(formationId)
      .then((value) => {
        setPack(value ?? null);
      })
      .catch(() => {
        setPack(null);
      });
  }, []);

  if (pack === undefined) {
    return <Skeleton className="m-24 h-320 w-auto rounded-24" />;
  }
  if (pack === null) {
    return (
      <main className="mx-auto w-full max-w-content px-20 py-48">
        <EmptyState data-testid="offline-empty" description={t.emptyBody} title={t.emptyTitle} />
        <div className="mt-24 flex justify-center">
          <a
            className="inline-flex min-h-44 items-center rounded-12 border border-solid border-border-strong px-18 text-14 font-700 text-ink no-underline"
            href="/hors-ligne"
          >
            {t.retry}
          </a>
        </div>
      </main>
    );
  }
  return (
    <main
      className="mx-auto flex w-full max-w-content flex-col gap-24 px-16 pb-40 shell:px-40"
      data-testid="offline-revision"
    >
      <OfflineQuizGlobal pack={pack} />
    </main>
  );
}
