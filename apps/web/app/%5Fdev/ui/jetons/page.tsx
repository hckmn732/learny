import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import {
  colors,
  controlHeightsPx,
  focusRing,
  fontSizesPx,
  layout,
  px,
  radiiPx,
  radiusFull,
  shadows,
  spacingPx,
} from '@learny/ui/tokens';

import { TokenSwatch } from '../../../../components/dev-ui/TokenSwatch';
import { fr } from '../../../../messages/fr';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

const t = fr.ui.gallery;

// Static classes keep every token utility visible to Tailwind's scanner.
const TEXT_CLASS = {
  10: 'text-10',
  11: 'text-11',
  11.5: 'text-11.5',
  12: 'text-12',
  13: 'text-13',
  14: 'text-14',
  15: 'text-15',
  16: 'text-16',
  17: 'text-17',
  18: 'text-18',
  19: 'text-19',
  20: 'text-20',
  21: 'text-21',
  22: 'text-22',
  24: 'text-24',
  26: 'text-26',
  28: 'text-28',
  30: 'text-30',
  32: 'text-32',
  34: 'text-34',
  40: 'text-40',
  44: 'text-44',
} as const;

function Section({
  testId,
  title,
  intro,
  children,
}: Readonly<{
  testId: string;
  title: string;
  intro: string;
  children: ReactNode;
}>) {
  return (
    <section
      data-testid={testId}
      className="mt-24 rounded-24 border border-solid border-border bg-surface p-24"
    >
      <h2 className="font-display text-22 font-semibold tracking-heading">{title}</h2>
      <p className="mt-4 text-14 text-ink-muted">{intro}</p>
      <div className="mt-16">{children}</div>
    </section>
  );
}

export default function TokensGalleryPage() {
  return (
    <div>
      <header>
        <p className="text-14 text-ink-muted">{t.surtitle}</p>
        <h1 className="mt-4 font-display text-34 font-semibold tracking-title">{t.title}</h1>
        <p className="mt-8 max-w-[42rem] text-15 text-ink-secondary">{t.intro}</p>
      </header>

      <Section testId="tokens-colors" title={t.colors.title} intro={t.colors.intro}>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-12">
          {Object.entries(colors).map(([name, value]) => (
            <li key={name}>
              <TokenSwatch name={name as keyof typeof colors} value={value} />
            </li>
          ))}
        </ul>
      </Section>

      <Section testId="tokens-typography" title={t.typography.title} intro={t.typography.intro}>
        <ul>
          {fontSizesPx.map((size) => (
            <li
              key={size}
              data-testid={`type-${String(size).replace('.', '-')}`}
              className="border-b border-solid border-divider py-8 last:border-b-0"
            >
              <span className={`${TEXT_CLASS[size]} block break-words`}>
                {t.typography.pangram}
              </span>
              <span className="mt-4 block font-mono text-11 text-ink-muted">
                {`text-${String(size)} · ${px(size)}`}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section testId="tokens-radii" title={t.radii.title} intro={t.radii.intro}>
        <ul className="flex flex-wrap gap-16">
          {radiiPx.map((radius) => (
            <li key={radius} className="text-center">
              <span
                data-testid={`radius-${String(radius)}`}
                className="block h-64 w-64 border border-solid border-border-strong bg-surface-muted"
                style={{ borderRadius: px(radius) }}
              />
              <span className="mt-4 block font-mono text-11 text-ink-muted">
                rounded-{String(radius)}
              </span>
            </li>
          ))}
          <li className="text-center">
            <span
              data-testid="radius-full"
              className="block h-64 w-64 border border-solid border-border-strong bg-surface-muted"
              style={{ borderRadius: radiusFull }}
            />
            <span className="mt-4 block font-mono text-11 text-ink-muted">rounded-full</span>
          </li>
        </ul>
      </Section>

      <Section testId="tokens-shadows" title={t.shadows.title} intro={t.shadows.intro}>
        <ul className="grid grid-cols-1 gap-24 shell:grid-cols-2">
          {Object.entries(shadows).map(([name, value]) => (
            <li key={name}>
              <span
                data-testid={`shadow-${name}`}
                className="block rounded-16 border border-solid border-border bg-surface p-24"
                style={{ boxShadow: value }}
              />
              <span className="mt-2 block font-mono text-11 break-words text-ink-muted">
                {`shadow-${name} · ${value}`}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section testId="tokens-spacing" title={t.spacing.title} intro={t.spacing.intro}>
        <ul className="space-y-4">
          {spacingPx.map((value) => (
            <li
              key={value}
              className="flex items-center gap-3"
              data-testid={`spacing-${String(value)}`}
            >
              <span className="w-28 shrink-0 font-mono text-11 text-ink-muted">
                {`p-${String(value)}`}
              </span>
              <span className="block h-8 rounded-full bg-indigo" style={{ width: px(value) }} />
              <span className="font-mono text-11 text-ink-muted">
                {`${t.unitPx(value)} · ${px(value)}`}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section testId="tokens-controls" title={t.controls.title} intro={t.controls.intro}>
        <ul className="space-y-6">
          {controlHeightsPx.map((value) => (
            <li
              key={value}
              className="flex items-center gap-3"
              data-testid={`control-${String(value)}`}
            >
              <span className="w-28 shrink-0 font-mono text-11 text-ink-muted">
                {`h-${String(value)}`}
              </span>
              <span
                className="block w-40 rounded-8 border border-solid border-border-strong bg-surface-subtle"
                style={{ height: px(value) }}
              />
              <span className="font-mono text-11 text-ink-muted">
                {`${t.unitPx(value)} · ${px(value)}`}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <p className="mt-24 font-mono text-11 text-ink-muted">
        {`${String(Object.keys(colors).length)} couleurs · ${String(fontSizesPx.length)} tailles · ${String(radiiPx.length + 1)} rayons · ${String(spacingPx.length)} espacements · ${String(controlHeightsPx.length)} hauteurs · focus ${focusRing.width} / offset ${focusRing.offset} · contenu ${px(layout.contentMaxPx)}`}
      </p>
    </div>
  );
}
