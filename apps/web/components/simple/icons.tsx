// Petites icônes du mode simple, dessinées comme les maquettes (design/mode-simple/index.html).
// Le registre partagé de @learny/ui n'expose pas ces pictogrammes ; ils restent décoratifs
// (`aria-hidden`) : le libellé du bouton porte toujours le sens (ET-4, WCAG 2.2 AA).

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

import { colors } from '@learny/ui/tokens';

const base = (size: number, strokeWidth: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  strokeWidth,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
  focusable: 'false' as const,
});

export function UploadIcon({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} stroke={color}>
      <path d="M12 16V4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
    </svg>
  );
}

export function ChatIcon({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} stroke={color}>
      <path d="M20 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function KeyIcon({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} stroke={color}>
      <circle cx="8" cy="8" r="4" />
      <path d="M11 11l8 8" />
      <path d="M17 17l2-2" />
    </svg>
  );
}

export function SparkIcon({ size = 14, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} stroke={color}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5" />
    </svg>
  );
}

export function QuoteIcon({ size = 12, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} stroke={color}>
      <path d="M7 7h4v4H8v3H5v-4zM15 7h4v4h-3v3h-3v-4z" />
    </svg>
  );
}

export function LinkIcon({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} stroke={color}>
      <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
    </svg>
  );
}

export function CalendarIcon({ size = 14, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} stroke={color}>
      <rect height="17" rx="2" width="18" x="3" y="4" />
      <path d="M8 2v4M16 2v4M3 10h18" />
    </svg>
  );
}

export function ArrowLeftIcon({ size = 15, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} stroke={color}>
      <path d="M19 12H5" />
      <path d="M11 6l-6 6 6 6" />
    </svg>
  );
}

export function RemoveIcon({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} stroke={color}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function CheckIcon({ size = 13, color = colors.ink, strokeWidth = 3 }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} stroke={color}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 14, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} stroke={color}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** Anneau tournant des étapes en cours (maquette `.check.run`). */
export function SpinnerIcon({ size = 22 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className="animate-spin motion-reduce:animate-none"
      focusable="false"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <circle
        cx="12"
        cy="12"
        fill="none"
        r="9"
        stroke={colors['border-strong']}
        strokeWidth="2.5"
      />
      <path
        d="M12 3a9 9 0 0 1 9 9"
        fill="none"
        stroke={colors.indigo}
        strokeLinecap="round"
        strokeWidth="2.5"
      />
    </svg>
  );
}
