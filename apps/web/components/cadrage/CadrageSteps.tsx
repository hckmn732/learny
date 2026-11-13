import { fr } from '../../messages/fr';

const t = fr.cadrage;

/** EF-2 — page title and the two-step indicator. */
export const CadrageSteps = () => (
  <div className="flex flex-wrap items-center justify-between gap-16">
    <h1 className="m-0 font-display text-34 font-600 tracking-title">{t.title}</h1>
    <ol
      aria-label={t.stepsLabel}
      className="flex list-none items-center gap-10 p-0 text-14 font-600"
    >
      <li className="flex items-center gap-8">
        <span className="flex h-28 w-28 items-center justify-center rounded-full bg-ink text-13 text-white">
          1
        </span>
        {t.stepCadrage}
      </li>
      <li aria-hidden="true" className="h-2 w-40 bg-border-strong" />
      <li className="flex items-center gap-8 text-ink-muted">
        <span className="flex h-28 w-28 items-center justify-center rounded-full border-[1.5px] border-solid border-border-dashed text-13">
          2
        </span>
        {t.stepProgramme}
      </li>
    </ol>
  </div>
);
