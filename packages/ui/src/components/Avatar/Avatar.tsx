import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../cn';

const avatarVariants = cva(
  'inline-flex shrink-0 items-center justify-center rounded-full bg-indigo text-center font-600 text-white',
  {
    variants: {
      size: {
        md: 'size-34 text-13',
        sm: 'size-28 text-11',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

/**
 * Initials of the avatar: first letter of the first name and of the last name, uppercase,
 * accents preserved (« Élise Ortiz » → « ÉO »); no name at all → « ? » (EF-5, CL-7).
 */
export function getInitials(firstName?: string | null, lastName?: string | null): string {
  const first = (firstName ?? '').trim();
  const last = (lastName ?? '').trim();
  const initials = [first, last]
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0))
    .join('');
  return initials ? initials.toUpperCase() : '?';
}

export type AvatarProps = VariantProps<typeof avatarVariants> & {
  firstName?: string | null;
  lastName?: string | null;
  className?: string;
  /** Set to false when the initials themselves carry the accessible name of their control. */
  'aria-hidden'?: boolean;
  'data-testid'?: string;
};

/**
 * Round initials avatar (SPEC-303, EF-5). It is decorative by default: the accessible name is
 * carried by the surrounding control.
 */
export const Avatar = ({ firstName, lastName, size = 'md', className, ...props }: AvatarProps) => (
  <span aria-hidden="true" className={cn(avatarVariants({ size }), className)} {...props}>
    {getInitials(firstName, lastName)}
  </span>
);
