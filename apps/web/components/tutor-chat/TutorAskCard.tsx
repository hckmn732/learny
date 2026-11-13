'use client';

import type { CourseStarter, CourseView } from '@learny/contracts';

import { fr } from '../../messages/fr';

const t = fr.tutorChat;

function Sparkle(): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
      width="16"
    >
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
    </svg>
  );
}

export function TutorAskCard({
  course,
  chapterLabel,
  chapterTitle,
  open,
  onOpen,
  onStarter,
}: {
  course: CourseView;
  chapterLabel: number;
  chapterTitle: string;
  open: boolean;
  onOpen: () => void;
  onStarter: (starter: CourseStarter) => void;
}): React.ReactElement {
  return (
    <section
      aria-labelledby="t-tuteur"
      className="flex flex-col gap-14 rounded-24 bg-ink p-20 text-white"
      data-testid="tutor-ask-card"
    >
      <div className="flex items-center gap-10">
        <span
          aria-hidden="true"
          className="flex h-34 w-34 flex-none items-center justify-center rounded-10 bg-lime"
        >
          <Sparkle />
        </span>
        <span className="flex flex-col gap-2">
          <h2 className="m-0 text-16 font-700" id="t-tuteur">
            {t.cardTitle}
          </h2>
          <span className="text-12 text-on-dark-muted">{t.cardSubtitle}</span>
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-6 p-0 text-13 text-on-dark-secondary">
        <li className="flex items-baseline gap-8">
          <span aria-hidden="true" className="h-6 w-6 flex-none rounded-full bg-white" />
          {t.chapter(chapterLabel, chapterTitle)}
        </li>
        <li className="flex items-baseline gap-8">
          <span aria-hidden="true" className="h-6 w-6 flex-none rounded-full bg-green" />
          {t.resources(course.resourceCount)}
        </li>
        {course.tutorGap === null ? null : (
          <li className="flex items-baseline gap-8">
            <span aria-hidden="true" className="h-6 w-6 flex-none rounded-full bg-orange" />
            {t.gap(course.tutorGap)}
          </li>
        )}
      </ul>
      <div className="flex flex-col gap-6">
        {course.tutorStarters.map((starter) => (
          <button
            className="min-h-40 cursor-pointer rounded-12 border border-dark-600 bg-dark-800 px-12 py-8 text-left text-13 leading-1.35 text-white"
            data-testid="tutor-starter"
            key={starter.prompt}
            onClick={() => {
              onStarter(starter);
            }}
            type="button"
          >
            {starter.label}
          </button>
        ))}
      </div>
      <button
        aria-controls="chat-tuteur"
        aria-expanded={open}
        className="min-h-44 cursor-pointer rounded-12 bg-lime px-16 text-14 font-700 text-ink"
        data-testid="tutor-open"
        id="ouvrir-tuteur"
        onClick={onOpen}
        type="button"
      >
        {t.open}
      </button>
      <p className="m-0 text-12 leading-1.45 text-on-dark-muted">{t.tip}</p>
    </section>
  );
}
