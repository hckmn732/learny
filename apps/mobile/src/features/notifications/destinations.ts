// Destination table of the notifications (SPEC-3102 ET-3, BR-NOT-02).
//
// One entry per contract type: the icon shown by the row and the screen the row opens. A type
// whose mobile screen is delivered by a later specification opens the web page of the row
// (`item.href`, ADR-3002 § 3) until then; the entry flips to `delivered: true` with the screen,
// never before, so the table always describes what the application really opens.
import type { NotificationItem, NotificationType } from '@learny/contracts';

import type { IconName } from '../../ui/icons';

export type NotificationDestinationKind = 'app' | 'web' | 'none';

export interface NotificationDestination {
  readonly kind: NotificationDestinationKind;
  /** Internal path: a mobile route for `app`, a web path for `web`, `''` for `none`. */
  readonly path: string;
  /** False when the mobile route does not exist yet: the web page of the row opens instead. */
  readonly delivered: boolean;
}

interface DestinationRule {
  readonly kind: NotificationDestinationKind;
  readonly path: (item: NotificationItem) => string;
  readonly delivered: boolean;
}

/** Module number of a web path (`/formations/sap/modules/3/quiz` → `3`), or `null`. */
export function moduleOf(href: string): string | null {
  return /\/modules\/([^/?#]+)/.exec(href)?.[1] ?? null;
}

/**
 * ET-3 — the table itself. `quiz` and `cours` are the two screens of SPEC-3202/3203: their
 * entries already name the mobile route, and the resolution below opens the web page meanwhile.
 */
export const NOTIFICATION_DESTINATIONS: Readonly<Record<NotificationType, DestinationRule>> = {
  validation_soon: {
    kind: 'app',
    delivered: false,
    path: (item) => {
      const module = moduleOf(item.href);
      return module === null ? '' : `/quiz/${module}`;
    },
  },
  course_ready: {
    kind: 'app',
    delivered: false,
    path: (item) => {
      const module = moduleOf(item.href);
      return module === null ? '' : `/cours/${module}`;
    },
  },
  global_quiz_today: { kind: 'app', delivered: true, path: () => '/reviser' },
  new_gap: { kind: 'web', delivered: true, path: (item) => item.href },
  session_planned: { kind: 'app', delivered: true, path: () => '/agenda' },
  module_validated: { kind: 'app', delivered: true, path: () => '/programme' },
  session_to_reschedule: { kind: 'app', delivered: true, path: () => '/aujourdhui' },
  weekly_review: { kind: 'app', delivered: true, path: () => '/aujourdhui' },
  milestone: { kind: 'app', delivered: true, path: () => '/aujourdhui' },
  ai_cost_alert: { kind: 'web', delivered: true, path: (item) => item.href },
  ai_task_failed: { kind: 'web', delivered: true, path: (item) => item.href },
  export_ready: { kind: 'app', delivered: true, path: () => '/profil' },
  group_invitation: { kind: 'web', delivered: true, path: (item) => item.href },
  daily_digest: { kind: 'app', delivered: true, path: () => '/aujourdhui' },
  relaunch: { kind: 'app', delivered: true, path: () => '/aujourdhui' },
  planning_adjusted: { kind: 'app', delivered: true, path: () => '/agenda' },
};

/** ET-3, BR-NOT-02 — the icon of every type, taken from the icon set of the design system. */
export const NOTIFICATION_ICONS: Readonly<Record<NotificationType, IconName>> = {
  validation_soon: 'clock',
  course_ready: 'book',
  global_quiz_today: 'cards',
  new_gap: 'target',
  session_planned: 'calendar',
  module_validated: 'check',
  session_to_reschedule: 'calendar',
  weekly_review: 'chart',
  milestone: 'flame',
  ai_cost_alert: 'alert',
  ai_task_failed: 'alert',
  export_ready: 'user',
  group_invitation: 'user',
  daily_digest: 'sparkles',
  relaunch: 'refresh',
  planning_adjusted: 'calendar',
};

/**
 * Resolution of a row: the mobile route when it exists, the web page of the row otherwise, and
 * `none` for a type the table does not know (the sheet then stays open, ET-3).
 */
export function destinationOf(item: NotificationItem): NotificationDestination {
  const rules: Readonly<Record<string, DestinationRule | undefined>> = NOTIFICATION_DESTINATIONS;
  const rule = rules[item.type];
  if (rule === undefined || rule.kind === 'none')
    return { kind: 'none', path: '', delivered: false };
  const path = rule.path(item);
  if (rule.kind === 'web') {
    return path.startsWith('/')
      ? { kind: 'web', path, delivered: true }
      : { kind: 'none', path: '', delivered: false };
  }
  if (!rule.delivered || !path.startsWith('/')) {
    // ADR-3002 § 3 — the screen does not exist yet: the web page of the row takes over.
    return item.href.startsWith('/')
      ? { kind: 'web', path: item.href, delivered: false }
      : { kind: 'none', path: '', delivered: false };
  }
  return { kind: 'app', path, delivered: true };
}

/** Icon of a row: the type decides (BR-NOT-02), the payload icon is only a fallback. */
export function iconOf(item: { readonly type: NotificationType }): IconName {
  const icons: Readonly<Record<string, IconName | undefined>> = NOTIFICATION_ICONS;
  return icons[item.type] ?? 'bell';
}
