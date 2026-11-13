import { cn } from '../../cn';

type ProgressRingSize = 'md' | 'xs';

export type ProgressRingProps = {
  /** Percentage, clamped to 0–100; null draws the empty ring with « — » (SPEC-603 EF-3). */
  value: number | null;
  /** Full accessible text, e.g. « Notions retenues à 1 mois : 86 % ». */
  label: string;
  /** `md` = 112 px (default), `xs` = 36 px (EF-4). */
  size?: ProgressRingSize;
  tone?: 'indigo' | 'teal';
  /** Explicit accent colour of the arc (ADR-0162). */
  color?: string;
  className?: string;
  'data-testid'?: string;
};

const GEOMETRY = {
  md: { px: 112, radius: 46, stroke: 12, circumference: 289, text: 'text-26' },
  xs: { px: 36, radius: 14, stroke: 5, circumference: 88, text: 'text-10' },
} as const;

/** Circular progression of the mockups (SPEC-303, EF-4). The SVG is hidden, the wrapper is the image. */
export const ProgressRing = ({
  value,
  label,
  size = 'md',
  tone = 'indigo',
  color,
  className,
  ...props
}: ProgressRingProps) => {
  const clamped = value === null ? 0 : Math.min(100, Math.max(0, value));
  const geometry = GEOMETRY[size];
  const dash =
    value === null ? '0.0' : ((2 * Math.PI * geometry.radius * clamped) / 100).toFixed(1);
  const track = tone === 'indigo' ? 'stroke-indigo-soft' : 'stroke-border';
  const progress = tone === 'indigo' ? 'stroke-indigo' : 'stroke-teal';

  return (
    <span
      role="img"
      aria-label={label}
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      {...props}
    >
      <svg
        aria-hidden="true"
        className="block"
        height={geometry.px}
        viewBox={`0 0 ${String(geometry.px)} ${String(geometry.px)}`}
        width={geometry.px}
      >
        <circle
          cx={geometry.px / 2}
          cy={geometry.px / 2}
          fill="none"
          r={geometry.radius}
          strokeWidth={geometry.stroke}
          className={track}
        />
        <circle
          cx={geometry.px / 2}
          cy={geometry.px / 2}
          fill="none"
          r={geometry.radius}
          strokeLinecap="round"
          strokeWidth={geometry.stroke}
          strokeDasharray={`${dash} ${String(geometry.circumference)}`}
          className={progress}
          style={color === undefined ? undefined : { stroke: color }}
          transform={`rotate(-90 ${String(geometry.px / 2)} ${String(geometry.px / 2)})`}
        />
      </svg>
      {size === 'md' ? (
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-0 flex items-center justify-center font-600 font-display',
            geometry.text,
          )}
        >
          {value === null ? '—' : `${String(clamped)} %`}
        </span>
      ) : null}
    </span>
  );
};
