import { Check } from 'lucide-react';

import type { CadrageProfile, CadrageRubricKey } from '@learny/contracts';

import { fr } from '../../messages/fr';

const t = fr.cadrage;

const RUBRIC_ORDER: readonly CadrageRubricKey[] = [
  'scope',
  'starting_point',
  'target_level',
  'volume',
  'dates',
];

const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface FormationProfilePanelProps {
  profile: CadrageProfile;
  questionsAsked: number;
  finished: boolean;
  canGenerate: boolean;
  /** Live preview of a multiple selection, keyed by rubric (EF-6). */
  preview?: Partial<Record<CadrageRubricKey, string>> | undefined;
  generating?: boolean | undefined;
  onGenerate?: (() => void) | undefined;
}

function ProfileRing({ asked, max }: Readonly<{ asked: number; max: number }>) {
  const ratio = Math.max(0, Math.min(1, asked / max));
  const dash = (CIRCUMFERENCE * ratio).toFixed(1);
  return (
    <span
      aria-label={t.profileRingLabel(asked, max)}
      className="relative inline-flex h-64 w-64 shrink-0 items-center justify-center"
      data-testid="profile-ring"
      role="img"
    >
      <svg aria-hidden="true" className="block" height={64} viewBox="0 0 64 64" width={64}>
        <circle cx={32} cy={32} fill="none" r={RADIUS} stroke="#F0EFEA" strokeWidth={8} />
        <circle
          cx={32}
          cy={32}
          fill="none"
          r={RADIUS}
          stroke="#111113"
          strokeDasharray={`${dash} ${CIRCUMFERENCE.toFixed(1)}`}
          strokeLinecap="round"
          strokeWidth={8}
          transform="rotate(-90 32 32)"
        />
      </svg>
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center font-display text-16 font-600"
      >
        {asked}/{max}
      </span>
    </span>
  );
}

function RubricBullet({ state }: Readonly<{ state: 'todo' | 'waiting' | 'done' }>) {
  if (state === 'done') {
    return (
      <span
        aria-hidden="true"
        className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-lime"
      >
        <Check size={12} strokeWidth={3.2} />
      </span>
    );
  }
  if (state === 'waiting') {
    return (
      <span
        aria-hidden="true"
        className="h-24 w-24 shrink-0 rounded-full border-2 border-solid border-ink"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="h-24 w-24 shrink-0 rounded-full border-[1.5px] border-dashed border-border-dotted"
    />
  );
}

/** BR-FOR-02 — five rubrics, their state, the n/5 ring and the guarded generation button. */
export const FormationProfilePanel = ({
  profile,
  questionsAsked,
  finished,
  canGenerate,
  preview = {},
  generating = false,
  onGenerate,
}: FormationProfilePanelProps) => {
  const subtitle = finished
    ? t.profileFinished(questionsAsked)
    : t.profileProgress(questionsAsked, 5);
  const disabled = !canGenerate || generating;

  return (
    <section className="flex flex-col gap-18 rounded-28 border border-border bg-surface p-24">
      <div className="flex items-center gap-14">
        <ProfileRing asked={questionsAsked} max={5} />
        <div className="flex flex-col gap-2">
          <h2 className="text-17 font-700" id="t-profil">
            {t.profileTitle}
          </h2>
          <span className="text-13 text-ink-muted">{subtitle}</span>
        </div>
      </div>

      <ul className="flex list-none flex-col gap-14 p-0">
        {RUBRIC_ORDER.map((key) => {
          const entry = profile[key];
          const previewValue = preview[key];
          return (
            <li className="flex gap-12" data-testid={`profile-rubric-${key}`} key={key}>
              <RubricBullet state={entry.state} />
              <span className="flex flex-col gap-2">
                <span className="text-12 font-700 tracking-label text-ink-muted uppercase">
                  {t.rubric[key]}
                </span>
                {entry.state === 'done' ? (
                  <span className="text-14">{entry.value}</span>
                ) : entry.state === 'waiting' ? (
                  previewValue !== undefined ? (
                    <span className="text-14 font-600">{previewValue}</span>
                  ) : (
                    <span className="text-14 text-ink-muted italic">{t.rubricWaiting}</span>
                  )
                ) : (
                  <span className="text-14 text-ink-muted">{t.rubricTodo}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <button
        aria-describedby={canGenerate ? undefined : 'cadrage-generate-help'}
        aria-disabled={disabled}
        className={
          disabled
            ? 'min-h-52 w-full cursor-not-allowed rounded-16 border-0 bg-ink px-20 text-15 font-700 text-white opacity-45'
            : 'min-h-52 w-full cursor-pointer rounded-16 border-0 bg-ink px-20 text-15 font-700 text-white hover:bg-dark-700'
        }
        data-testid="cadrage-generate"
        onClick={() => {
          if (!disabled) onGenerate?.();
        }}
        type="button"
      >
        {generating ? t.generateLoading : t.generate}
      </button>
      {canGenerate ? null : (
        <p className="-mt-8 text-12 text-ink-muted" id="cadrage-generate-help">
          {t.generateHelp}
        </p>
      )}
    </section>
  );
};
