import type { Metadata } from 'next';

import {
  Avatar,
  Breadcrumb,
  Card,
  CardHeader,
  Icon,
  PageHeader,
  ProgressBar,
  ProgressRing,
  StatCard,
  StatRow,
  buildFormationBreadcrumb,
  iconRegistry,
  type IconName,
} from '@learny/ui';

import { GalleryCard } from '../../../../components/dev-ui/GalleryCard';
import { fr } from '../../../../messages/fr';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

const t = fr.ui.gallery.structure;

const ICON_NAMES = Object.keys(iconRegistry) as IconName[];

export default function StructureGalleryPage() {
  const breadcrumb = buildFormationBreadcrumb({
    formationId: 'fid-demo',
    module: { id: 'mid-3', position: 3, title: 'Comptabilité générale' },
    page: t.breadcrumb.page,
  });

  return (
    <div data-testid="ui-structure-gallery">
      <header>
        <p className="text-14 text-ink-muted">{fr.ui.gallery.surtitle}</p>
        <h1 className="mt-4 font-display text-34 font-semibold tracking-title">{t.title}</h1>
        <p className="mt-8 max-w-[42rem] text-15 text-ink-secondary">{t.intro}</p>
      </header>

      <GalleryCard testId="ui-structure-cards" title={t.cards.title} intro={t.cards.intro}>
        <div className="grid grid-cols-1 gap-16 shell:grid-cols-2">
          <Card labelledBy="card-default-title" data-testid="ui-card-default">
            <CardHeader
              title={t.cards.defaultTitle}
              titleId="card-default-title"
              description={t.cards.defaultDescription}
              actions={<span className="text-13 text-ink-muted">{t.cards.actions}</span>}
            />
          </Card>
          <Card labelledBy="card-dark-title" data-testid="ui-card-dark" tone="dark">
            <CardHeader
              title={t.cards.darkTitle}
              titleId="card-dark-title"
              titleSize="lg"
              description={
                <span className="text-on-dark-secondary">{t.cards.darkDescription}</span>
              }
              actions={<span className="text-13 text-lime">{t.cards.darkAction}</span>}
            />
          </Card>
          <Card labelledBy="card-lime-title" data-testid="ui-card-lime" tone="lime">
            <CardHeader
              title={t.cards.limeTitle}
              titleId="card-lime-title"
              description={t.cards.limeDescription}
            />
          </Card>
          <Card labelledBy="card-subtle-title" data-testid="ui-card-subtle" tone="subtle">
            <CardHeader
              title={t.cards.subtleTitle}
              titleId="card-subtle-title"
              description={t.cards.subtleDescription}
            />
          </Card>
        </div>
      </GalleryCard>

      <GalleryCard testId="ui-structure-stats" title={t.stats.title} intro={t.stats.intro}>
        <StatRow data-testid="ui-stat-row">
          <StatCard
            data-testid="ui-stat-dark"
            label={t.stats.gapsLabel}
            tone="dark"
            value={t.stats.gapsValue}
          />
          <StatCard
            data-testid="ui-stat-light"
            label={t.stats.masteredLabel}
            value={t.stats.masteredValue}
          />
          <StatCard label={t.stats.nextLabel} value={t.stats.nextValue} />
        </StatRow>
      </GalleryCard>

      <GalleryCard testId="ui-structure-progress" title={t.progress.title} intro={t.progress.intro}>
        <div className="flex flex-wrap items-start gap-32">
          <div className="flex min-w-[260px] flex-1 flex-col gap-16">
            {[
              ['orange', t.progress.orange, 48] as const,
              ['lime', t.progress.lime, 72] as const,
              ['indigo', t.progress.indigo, 86] as const,
              ['teal', t.progress.teal, 62] as const,
            ].map(([tone, label, value]) => (
              <div key={tone}>
                <p className="mb-6 text-13 text-ink-muted">{label}</p>
                <ProgressBar
                  data-testid={`ui-progress-${tone}`}
                  label={label}
                  tone={tone}
                  value={value}
                />
              </div>
            ))}
          </div>
          <ProgressRing data-testid="ui-progress-ring" label={t.progress.ringLabel} value={86} />
        </div>
      </GalleryCard>

      <GalleryCard testId="ui-structure-avatar" title={t.avatar.title} intro={t.avatar.intro}>
        <div className="flex flex-wrap items-center gap-16">
          <Avatar data-testid="ui-avatar" firstName="Alex" lastName="Perrin" />
          <Avatar firstName="Élise" lastName="Ortiz" size="sm" />
          <span className="text-14 text-ink-secondary">{t.avatar.name}</span>
        </div>
      </GalleryCard>

      <GalleryCard
        testId="ui-structure-breadcrumb"
        title={t.breadcrumb.title}
        intro={t.breadcrumb.intro}
      >
        <Breadcrumb data-testid="ui-breadcrumb" items={breadcrumb} />
      </GalleryCard>

      <GalleryCard
        testId="ui-structure-page-header"
        title={t.pageHeader.title}
        intro={t.pageHeader.intro}
      >
        <PageHeader
          breadcrumb={<Breadcrumb items={breadcrumb} />}
          data-testid="ui-page-header"
          eyebrow={t.pageHeader.eyebrow}
          title={t.pageHeader.pageTitle}
        />
      </GalleryCard>

      <GalleryCard testId="ui-structure-icons" title={t.icons.title} intro={t.icons.intro}>
        <ul className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-4">
          {ICON_NAMES.map((name) => (
            <li
              className="flex items-center gap-8 rounded-10 bg-surface-subtle px-10 py-8"
              data-testid={`ui-icon-${name}`}
              key={name}
            >
              <Icon className="text-ink-secondary" name={name} />
              <span className="min-w-0">
                <span className="block text-12 font-600 text-ink">{t.icons.labels[name]}</span>
                <span className="block font-mono text-11 text-ink-muted">{name}</span>
              </span>
            </li>
          ))}
        </ul>
      </GalleryCard>
    </div>
  );
}
