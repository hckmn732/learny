'use client';

import Link from 'next/link';

import { SegmentedControl } from '@learny/ui';

import { fr } from '../../messages/fr';

const t = fr.globalQuiz;

export interface SessionModeSwitchProps {
  mode: 'full' | 'micro';
  fullMinutes: number;
  microMinutes: number;
  note: string;
  onModeChange?: (mode: 'full' | 'micro') => void;
}

/**
 * SCR-10 §10.2 — duration switch and the tutor note (SPEC-701 EF-4). Only the full session is
 * active in this specification; the micro-session button is disabled until SPEC-703.
 */
export function SessionModeSwitch(props: SessionModeSwitchProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-16 gap-y-12">
      <div data-testid="gq-mode-switch">
        <SegmentedControl
          aria-label={t.modes.label}
          onValueChange={(value) => {
            props.onModeChange?.(value);
          }}
          options={[
            {
              value: 'full',
              label: t.modes.full(props.fullMinutes),
              testId: 'gq-mode-full',
            },
            {
              value: 'micro',
              label: t.modes.micro(props.microMinutes),
              disabled: true,
              testId: 'gq-mode-micro',
            },
          ]}
          size="sm"
          value={props.mode}
          variant="solid"
        />
      </div>
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
