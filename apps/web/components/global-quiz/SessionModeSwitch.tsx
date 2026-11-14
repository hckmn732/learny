'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import { SegmentedControl } from '@learny/ui';

import { fr } from '../../messages/fr';

const t = fr.globalQuiz;

export interface SessionModeSwitchProps {
  mode: 'full' | 'micro';
  fullMinutes: number;
  microMinutes: number;
  note: string;
  /** Optional local state of the session; the URL stays the source of truth (ET-6). */
  onModeChange?: (mode: 'full' | 'micro') => void;
}

/**
 * SCR-10 §10.2 — duration switch and tutor note (SPEC-701 EF-4; SPEC-703 EF-1, ET-6, ET-7).
 *
 * The two buttons form a group of pressed buttons, not tabs. Selecting a mode replaces the URL
 * (`?mode=micro`, no history entry) and announces the loaded mode through `aria-live`, while the
 * clicked button keeps the focus.
 */
export function SessionModeSwitch(props: SessionModeSwitchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [announcement, setAnnouncement] = useState('');

  function selectMode(value: 'full' | 'micro'): void {
    if (value === props.mode) return;
    setAnnouncement(value === 'micro' ? t.micro.converted : t.micro.restored);
    props.onModeChange?.(value);
    router.replace(value === 'micro' ? `${pathname}?mode=micro` : pathname, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-16 gap-y-12">
      <div className="w-full min-[480px]:w-auto" data-testid="gq-mode-switch">
        <SegmentedControl
          aria-label={t.modes.label}
          className="w-full [&_button]:min-h-11 min-[480px]:w-auto min-[480px]:[&_button]:flex-none"
          onValueChange={selectMode}
          options={[
            {
              value: 'full',
              label: t.modes.full(props.fullMinutes),
              testId: 'gq-mode-full',
            },
            {
              value: 'micro',
              label: t.modes.micro(props.microMinutes),
              testId: 'gq-mode-micro',
            },
          ]}
          size="sm"
          value={props.mode}
          variant="solid"
        />
      </div>
      <p aria-live="polite" className="sr-only" data-testid="gq-mode-announcement" role="status">
        {announcement}
      </p>
      <p
        className="m-0 min-w-0 flex-[1_1_320px] text-13 leading-1.5 text-ink-secondary"
        data-testid="gq-mode-note"
      >
        {props.note}{' '}
        <Link className="font-600" href="/parametres#automatismes">
          {t.adjust}
        </Link>
      </p>
    </div>
  );
}
