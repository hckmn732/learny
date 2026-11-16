import type { QuizSmoothingNotice, ReviewRationale } from '@learny/contracts';

import { fr } from '../../messages/fr';

const t = fr.globalQuiz;

/**
 * SCR-10 §10.4 — « Réglé par le tuteur » (SPEC-701 EF-7). The bullets were frozen in the session
 * config at creation; the section is not rendered when none applies.
 */
export function TutorRationale({
  rationale,
  tuned = [],
  smoothing = null,
  onUndoSmoothing,
  undoSmoothing = false,
}: {
  rationale: ReviewRationale[];
  /** SPEC-716 EF-7 — the imposed-gap lines, rendered under the frozen rationale. */
  tuned?: ReviewRationale[];
  /** SPEC-718 ET-5 — cap, deferral and undo of the smoothed day. */
  smoothing?: QuizSmoothingNotice | null;
  onUndoSmoothing?: (actionId: string) => void;
  undoSmoothing?: boolean;
}) {
  if (rationale.length === 0 && tuned.length === 0 && smoothing === null) return null;
  return (
    <section
      aria-labelledby="t-pourquoi"
      className="flex flex-col gap-10 rounded-24 bg-ink p-20 text-white"
      data-testid="gq-rationale"
    >
      <h2 className="m-0 text-12 font-700 tracking-kicker text-lime uppercase" id="t-pourquoi">
        {t.rationale.title}
      </h2>
      <ul className="m-0 flex list-none flex-col gap-10 p-0 text-13 leading-1.5 text-on-dark-secondary">
        {rationale.map((bullet) => (
          <li
            data-testid={bullet.label === 'Charge lissée' ? 'review-deferred' : undefined}
            key={`${bullet.label}:${bullet.text}`}
          >
            <strong className="text-white">{bullet.label} :</strong> {bullet.text}
          </li>
        ))}
        {tuned.map((line) => (
          <li data-testid="global-quiz-tuned-gap" key={`${line.label}:${line.text}`}>
            <strong className="text-white">{line.label} :</strong> {line.text}
          </li>
        ))}
      </ul>
      {smoothing === null ? null : (
        <div className="flex flex-wrap items-center justify-between gap-10 border-t border-solid border-white/15 pt-10">
          <p className="m-0 text-13 text-on-dark-secondary" data-testid="review-cap">
            {t.rationale.cap(smoothing.capMinutes)}
          </p>
          {smoothing.actionId === null || onUndoSmoothing === undefined ? null : (
            <button
              className="min-h-36 cursor-pointer rounded-10 border border-solid border-white/30 bg-transparent px-12 text-13 font-600 text-white disabled:cursor-wait disabled:opacity-60"
              data-testid="review-smoothing-undo"
              disabled={undoSmoothing}
              onClick={() => {
                onUndoSmoothing(smoothing.actionId as string);
              }}
              type="button"
            >
              {undoSmoothing ? t.rationale.undoPending : t.rationale.undoSmoothing}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
