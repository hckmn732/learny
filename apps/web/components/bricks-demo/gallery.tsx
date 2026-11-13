import { createElement } from 'react';

import { BRICK_TYPES, type BrickType } from '@learny/bricks';
import { BrickRenderer } from '@learny/bricks/view';
import { Badge, cn } from '@learny/ui';

import { GALLERY_STATES, VARIANTS, VARIANT_OF, galleryProps } from './gallery-data';

const TYPE_LABELS: Record<BrickType, string> = {
  text: 'Texte',
  resource_excerpt: 'Extrait de ressource',
  choice_question: 'Question à choix',
  open_question: 'Question ouverte',
  cloze: 'Texte à trous',
  matching: 'Association',
  ordering: 'Remise en ordre',
  categorization: 'Classement',
  recall_card: 'Carte de rappel',
  instruction: 'Consigne',
  scripted_dialogue: 'Dialogue scénarisé',
  timer: 'Minuteur',
  scoring: 'Barème',
};

export interface GalleryFilters {
  type?: string | undefined;
  variant?: string | undefined;
  state?: string | undefined;
}

function matches(value: string | undefined, candidate: string): boolean {
  return value === undefined || value === '' || value === candidate;
}

export function BricksGallery({ filters }: Readonly<{ filters: GalleryFilters }>) {
  const states = GALLERY_STATES.filter((state) => matches(filters.state, state));
  const types = BRICK_TYPES.filter(
    (type) =>
      matches(filters.type, type) &&
      (filters.variant === undefined ||
        filters.variant === '' ||
        filters.variant === VARIANT_OF[type]),
  );

  return (
    <div className="flex flex-col gap-24" data-testid="bricks-gallery">
      <header className="flex flex-col gap-8">
        <p className="m-0 text-14 text-ink-muted">Galerie du design system</p>
        <h1 className="m-0 font-display text-34 font-600 tracking-title">Briques</h1>
        <p className="m-0 max-w-[42rem] text-15 text-ink-secondary">
          Les treize types de briques, leurs variantes et leurs états de correction.
        </p>
        <nav aria-label="Pages de reproduction" className="flex flex-wrap gap-8">
          {[
            ['quiz', '/_dev/bricks/quiz'],
            ['jeux', '/_dev/bricks/jeux'],
            ['exercice', '/_dev/bricks/exercice'],
            ['examen', '/_dev/bricks/examen'],
          ].map(([label, href]) => (
            <a
              className="rounded-full border border-solid border-border bg-surface px-12 py-8 text-13 font-600 text-indigo-ink"
              href={href}
              key={href}
            >
              {label}
            </a>
          ))}
        </nav>
      </header>

      <form
        className="flex flex-wrap items-end gap-12 rounded-18 border border-solid border-border bg-surface p-16"
        data-testid="bricks-gallery-filters"
        method="get"
      >
        <label className="flex flex-col gap-4 text-12 font-700 text-ink">
          Type
          <select
            className="min-h-40 rounded-10 border border-solid border-border-strong bg-surface px-10 text-13"
            defaultValue={filters.type ?? ''}
            name="type"
          >
            <option value="">Tous</option>
            {BRICK_TYPES.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-4 text-12 font-700 text-ink">
          Variante
          <select
            className="min-h-40 rounded-10 border border-solid border-border-strong bg-surface px-10 text-13"
            defaultValue={filters.variant ?? ''}
            name="variant"
          >
            <option value="">Toutes</option>
            {VARIANTS.map((variant) => (
              <option key={variant} value={variant}>
                {variant}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-4 text-12 font-700 text-ink">
          État
          <select
            className="min-h-40 rounded-10 border border-solid border-border-strong bg-surface px-10 text-13"
            defaultValue={filters.state ?? ''}
            name="state"
          >
            <option value="">Tous</option>
            {GALLERY_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </label>
        <button
          className="min-h-40 cursor-pointer rounded-10 border-0 bg-ink px-16 text-13 font-700 text-white"
          type="submit"
        >
          Filtrer
        </button>
      </form>

      {types.map((type) => (
        <section
          className="flex flex-col gap-12"
          data-testid={`gallery-${type}`}
          key={type}
          aria-labelledby={`gallery-title-${type}`}
        >
          <div className="flex flex-wrap items-center gap-8">
            <h2 className="m-0 font-display text-24 font-600" id={`gallery-title-${type}`}>
              {TYPE_LABELS[type]}
            </h2>
            <Badge tone="neutral">{VARIANT_OF[type]}</Badge>
            <code className="text-12 text-ink-muted">{type}</code>
          </div>
          <div className="grid grid-cols-1 gap-16 shell:grid-cols-2">
            {states.map((state) => (
              <article
                className={cn(
                  'flex min-w-0 flex-col gap-12 rounded-22 border border-solid border-border bg-surface p-20',
                  state.startsWith('corrected') && 'bg-surface-subtle',
                )}
                data-state={state}
                data-testid={`gallery-${type}-${state}`}
                key={state}
              >
                <p className="m-0 text-11 font-700 tracking-eyebrow text-ink-muted uppercase">
                  {state}
                </p>
                {createElement(BrickRenderer as never, galleryProps(type, state) as never)}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
