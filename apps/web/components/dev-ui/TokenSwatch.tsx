import type { ColorToken } from '@learny/ui/tokens';
import { colors } from '@learny/ui/tokens';

/**
 * One colour token: a 64 × 64 mockup-pixel swatch (16 spacing units), its name and its exact
 * value. The value is always visible, so colour is never the only information (SPEC-301 §10).
 */
export function TokenSwatch({ name, value }: Readonly<{ name: ColorToken; value: string }>) {
  return (
    <figure
      data-testid={`swatch-${name}`}
      className="flex min-w-0 items-start gap-12 rounded-16 border border-solid border-border bg-surface p-12"
    >
      <span
        aria-hidden="true"
        className="h-64 w-64 shrink-0 rounded-8 border border-solid border-border"
        style={{ backgroundColor: colors[name] }}
      />
      <figcaption className="min-w-0">
        <span className="block font-mono text-12 font-medium break-words text-ink">{name}</span>
        <span className="mt-4 block font-mono text-11 break-words text-ink-muted">{value}</span>
      </figcaption>
    </figure>
  );
}
