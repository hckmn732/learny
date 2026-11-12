import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2, type LucideIcon } from 'lucide-react';
import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cn } from '../../cn';

/**
 * Button variants of the mockups (SPEC-302 EF-1). Icon size and stroke are passed by the
 * component (ET-5); the label may wrap and balance on two lines (CL-2).
 */
export const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-8 border border-solid font-sans text-balance transition-[background-color,border-color,color,filter] disabled:cursor-not-allowed disabled:opacity-55',
  {
    variants: {
      variant: {
        lime: 'border-transparent bg-lime font-700 text-ink hover:brightness-95',
        dark: 'border-transparent bg-ink font-700 text-white hover:bg-dark-700',
        outline: 'border-border-strong bg-surface font-600 text-ink hover:border-ink',
        ghost: 'border-transparent bg-transparent font-600 text-ink-muted hover:bg-canvas',
        danger: 'border-transparent bg-transparent font-600 text-danger hover:bg-canvas',
        'outline-on-dark': 'border-dark-500 bg-transparent font-600 text-white hover:bg-dark-600',
      },
      size: {
        sm: 'min-h-40 rounded-10 px-14 text-13',
        md: 'min-h-44 rounded-12 px-16 text-14',
        lg: 'min-h-48 rounded-14 px-20 text-15',
        xl: 'min-h-50 rounded-14 px-20 text-15',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: { variant: 'dark', size: 'md', fullWidth: false },
  },
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;

export type ButtonProps = ComponentPropsWithRef<'button'> &
  ButtonVariants & {
    /** Shows a spinning loader, disables the button and sets `aria-busy` (CL-1, CL-6). */
    loading?: boolean;
    leadingIcon?: LucideIcon;
    trailingIcon?: LucideIcon;
    /** Renders the single child element instead of a `<button>` (Radix Slot). */
    asChild?: boolean;
    fullWidth?: boolean;
  };

const ICON_SIZE = 16;
const ICON_STROKE = 2.2;

export const Button = ({
  className,
  variant,
  size,
  fullWidth,
  loading = false,
  leadingIcon: LeadingIcon,
  trailingIcon: TrailingIcon,
  asChild = false,
  disabled,
  type,
  children,
  ...props
}: ButtonProps) => {
  const classes = cn(buttonVariants({ variant, size, fullWidth }), className);

  // Radix Slot requires exactly one child: the caller supplies the link and its content.
  if (asChild) {
    return (
      <Slot className={classes} aria-busy={loading || undefined} {...props}>
        {children}
      </Slot>
    );
  }

  let leading: ReactNode = null;
  if (loading) {
    leading = (
      <Loader2
        aria-hidden="true"
        className="animate-spin motion-reduce:animate-none"
        size={ICON_SIZE}
        strokeWidth={ICON_STROKE}
      />
    );
  } else if (LeadingIcon) {
    leading = <LeadingIcon aria-hidden="true" size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
  }

  return (
    <button
      className={classes}
      type={type ?? 'button'}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {leading}
      {children}
      {TrailingIcon && !loading ? (
        <TrailingIcon aria-hidden="true" size={ICON_SIZE} strokeWidth={ICON_STROKE} />
      ) : null}
      {loading ? <span className="sr-only">Chargement…</span> : null}
    </button>
  );
};
