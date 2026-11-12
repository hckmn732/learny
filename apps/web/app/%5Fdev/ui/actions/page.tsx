import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';

import { Badge, Button, CountBadge, Link, type BadgeProps } from '@learny/ui';

import { GalleryCard } from '../../../../components/dev-ui/GalleryCard';
import { fr } from '../../../../messages/fr';

import { Chips } from './Chips';
import { IconButtons } from './IconButtons';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

const t = fr.ui.gallery.actions;

const VARIANTS = ['lime', 'dark', 'outline', 'ghost', 'danger', 'outline-on-dark'] as const;
const SIZES = ['sm', 'md', 'lg', 'xl'] as const;
const BADGE_TONES = [
  'neutral',
  'lime',
  'lime-soft',
  'indigo',
  'green',
  'orange',
  'violet',
  'on-dark',
  'default-model',
] as const satisfies readonly NonNullable<BadgeProps['tone']>[];

/** Forced hover state: the gallery applies the hover token without a pointer. */
const HOVER_CLASS = {
  lime: 'brightness-95',
  dark: 'bg-dark-700',
  outline: 'border-ink',
  ghost: 'bg-canvas',
  danger: 'bg-canvas',
  'outline-on-dark': 'bg-dark-600',
} as const;

export default function ActionsGalleryPage() {
  return (
    <div data-testid="ui-actions-gallery">
      <header>
        <p className="text-14 text-ink-muted">{fr.ui.gallery.surtitle}</p>
        <h1 className="mt-4 font-display text-34 font-semibold tracking-title">{t.title}</h1>
        <p className="mt-8 max-w-[42rem] text-15 text-ink-secondary">{t.intro}</p>
      </header>

      <GalleryCard intro={t.buttons.intro} testId="ui-actions-buttons" title={t.buttons.title}>
        {VARIANTS.map((variant) => (
          <div className="mt-20 first:mt-0" key={variant}>
            <h3 className="text-14 font-600 text-ink-secondary">{t.variants[variant]}</h3>
            <div
              className={
                variant === 'outline-on-dark'
                  ? 'mt-8 flex flex-wrap items-center gap-8 rounded-12 bg-dark-850 p-12'
                  : 'mt-8 flex flex-wrap items-center gap-8'
              }
            >
              {SIZES.map((size) => (
                <Button
                  data-testid={`ui-button-${variant}-${size}`}
                  key={size}
                  size={size}
                  variant={variant}
                >
                  {t.sizes[size]}
                </Button>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-8">
              <span className="w-64 text-12 text-ink-muted">{t.states.normal}</span>
              <Button
                className={HOVER_CLASS[variant]}
                data-testid={`ui-button-${variant}-md-hover`}
                variant={variant}
              >
                {t.states.hover}
              </Button>
              <Button data-testid={`ui-button-${variant}-md-disabled`} disabled variant={variant}>
                {t.states.disabled}
              </Button>
              <Button data-testid={`ui-button-${variant}-md-loading`} loading variant={variant}>
                {t.states.loading}
              </Button>
            </div>
          </div>
        ))}
        <div className="mt-20">
          <h3 className="text-14 font-600 text-ink-secondary">{t.sampleLong}</h3>
          <div className="mt-8 max-w-[20rem]">
            <Button fullWidth variant="outline">
              {t.sampleLong}
            </Button>
          </div>
        </div>
      </GalleryCard>

      <GalleryCard
        testId="ui-actions-icons"
        title={t.iconButtons.title}
        intro={t.iconButtons.intro}
      >
        <IconButtons />
        <p className="mt-12 text-12 text-ink-muted">{t.sample}</p>
      </GalleryCard>

      <GalleryCard testId="ui-actions-links" title={t.links.title} intro={t.links.intro}>
        <div className="flex flex-col items-start gap-8">
          <Link data-testid="ui-link-inline" href="/_dev/ui">
            {t.links.inline}
          </Link>
          <Link data-testid="ui-link-strong" href="/_dev/ui" variant="strong" weight="bold">
            {t.links.strong}
          </Link>
          <Link data-testid="ui-link-subtle" href="/_dev/ui" variant="subtle">
            {t.links.subtle}
          </Link>
          <Link data-testid="ui-link-external" href="https://learny.example" variant="inline">
            {t.links.external}
          </Link>
          <Button asChild size="sm" variant="outline">
            <Link href="/_dev/ui">
              {t.links.inline}
              <ArrowRight aria-hidden="true" size={16} strokeWidth={2.2} />
            </Link>
          </Button>
        </div>
      </GalleryCard>

      <GalleryCard testId="ui-actions-chips" title={t.chips.title} intro={t.chips.intro}>
        <Chips />
      </GalleryCard>

      <GalleryCard testId="ui-actions-badges" title={t.badges.title} intro={t.badges.intro}>
        <div className="flex flex-wrap items-center gap-8">
          {BADGE_TONES.map((tone) =>
            tone === 'on-dark' ? (
              <span className="rounded-8 bg-dark-850 p-8" key={tone}>
                <Badge data-testid={`ui-badge-${tone}`} tone={tone}>
                  {t.badges.labels[tone]}
                </Badge>
              </span>
            ) : (
              <Badge data-testid={`ui-badge-${tone}`} key={tone} tone={tone}>
                {t.badges.labels[tone]}
              </Badge>
            ),
          )}
        </div>
        <div className="mt-12 flex flex-wrap items-center gap-8">
          {BADGE_TONES.map((tone) => (
            <Badge data-testid={`ui-badge-${tone}-sm`} key={tone} size="sm" tone={tone}>
              {t.badges.labels[tone]}
            </Badge>
          ))}
        </div>
      </GalleryCard>

      <GalleryCard testId="ui-actions-counts" title={t.counts.title} intro={t.counts.intro}>
        <div className="flex flex-wrap items-center gap-12">
          <CountBadge data-testid="ui-count-badge-lime-99" value={120} />
          <span className="rounded-12 bg-dark-850 p-8">
            <CountBadge tone="orange-on-dark" value={4} />
          </span>
        </div>
      </GalleryCard>
    </div>
  );
}
