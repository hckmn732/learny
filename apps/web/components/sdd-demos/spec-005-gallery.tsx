'use client';

import Image from 'next/image';
import { useState } from 'react';

import type { ReferenceEntryMeta, ReferenceState } from '../../lib/reference-types';
import { fr } from '../../messages/fr';

const t = fr.sdd.spec005.gallery;

function referenceUrl(file: string): string {
  const name = file.split('/').pop() ?? '';
  return `/_dev/sdd/reference/${name}`;
}

function Figure({
  kind,
  state,
  entry,
}: Readonly<{ kind: 'desktop' | 'mobile'; state: ReferenceState; entry: ReferenceEntryMeta }>) {
  const label = kind === 'desktop' ? t.desktop : t.mobile;
  return (
    <figure
      data-testid={`spec-005-${kind}`}
      className={kind === 'mobile' ? 'min-w-0 max-w-[390px]' : 'min-w-0'}
    >
      <Image
        src={referenceUrl(entry.file)}
        alt={`${label} — ${state.screenId} ${state.state}, ${String(entry.width)} par ${String(entry.height)} pixels`}
        width={entry.width}
        height={entry.height}
        unoptimized
        className="h-auto w-full rounded-[16px] border border-solid border-[#E7E6E1] bg-white"
      />
      <figcaption className="mt-2 text-sm">
        <span className="font-semibold">{label}</span>
        {` — ${state.screenId} / ${state.state} · ${t.hash} `}
        <span className="font-mono">{entry.sha256.slice(0, 12)}</span>
      </figcaption>
    </figure>
  );
}

export function Spec005Gallery({ states }: Readonly<{ states: ReferenceState[] }>) {
  const [key, setKey] = useState(states[0]?.key ?? '');
  const selected = states.find((s) => s.key === key) ?? states[0];
  if (!selected) return null;
  return (
    <div data-testid="spec-005-manifest">
      <label htmlFor="spec-005-etat" className="text-sm font-semibold">
        {t.choose}
      </label>
      <select
        id="spec-005-etat"
        value={selected.key}
        onChange={(event) => {
          setKey(event.target.value);
        }}
        className="mt-2 block min-h-11 w-full max-w-md rounded-[12px] border border-solid border-[#DAD9D3] bg-white px-3"
      >
        {states.map((state) => (
          <option key={state.key} value={state.key}>
            {`${state.screenId} — ${state.state}`}
          </option>
        ))}
      </select>
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <Figure kind="desktop" state={selected} entry={selected.desktop} />
        <Figure kind="mobile" state={selected} entry={selected.mobile} />
      </div>
    </div>
  );
}
