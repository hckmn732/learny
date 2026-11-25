// Shared contract of a list row (SPEC-3002 EF-2): the iOS row is an inset list with a chevron,
// the Android row carries its icon in an indigo disc (ADR-3004 § 5).
import type { ReactNode } from 'react';

import type { IconName } from './icons';

export interface ListRowProps {
  readonly title: string;
  readonly subtitle?: string;
  /** Lines of the title before it is cut (1 by default; long model names need more). */
  readonly titleLines?: number;
  readonly icon?: IconName;
  readonly onPress?: () => void;
  /** Trailing content (a value, a switch, a badge). */
  readonly trailing?: ReactNode;
  /** Hairline separator above the row (all rows but the first). */
  readonly separator?: boolean;
  readonly testID?: string;
}
