// Five native destinations of the shell (SPEC-3102 EF-1, CA-1; ADR-3004 § 2).
//
// One module owns the identity of each tab — route name, label, icon, `testID` and announced
// label — so that the tab bar, the deep links and the tests read the same table. `AppTabs`
// renders them; nothing else declares a tab.
import { fr } from '@learny/i18n';

import type { IconName } from '../ui/icons';

/** Route names of the five tab groups, as the file system spells them (ADR-0046). */
export const TAB_NAMES = ['aujourdhui', 'programme', 'reviser', 'agenda', 'profil'] as const;

export type TabName = (typeof TAB_NAMES)[number];

export interface TabDefinition {
  readonly name: TabName;
  /** Internal path of the tab root, used by the deep links and by the reselect action. */
  readonly href: string;
  /** Visible label, identical to the mockup and to `fr.mobile.shell.tabs`. */
  readonly label: string;
  readonly icon: IconName;
  readonly testID: string;
  /** Announced label: the visible label, its position and its state (ET-5, BR-PLA-03). */
  readonly accessibilityLabel: string;
}

/** Key of the catalogue for each route name (`reviser` → `revise`, `profil` → `profile`). */
const LABEL_KEYS = {
  aujourdhui: 'today',
  programme: 'programme',
  reviser: 'revise',
  agenda: 'agenda',
  profil: 'profile',
} as const;

function tabLabel(name: TabName): string {
  return fr.mobile.shell.tabs[LABEL_KEYS[name]];
}

/** Declaration of the five tabs, in the order of the mockup. */
export const TABS: readonly TabDefinition[] = TAB_NAMES.map((name, index) => ({
  name,
  href: `/${name}`,
  label: tabLabel(name),
  icon: (['home', 'layers', 'cards', 'calendar', 'user'] as const)[index] ?? 'home',
  testID: `tab-${name}`,
  accessibilityLabel: fr.mobile.shell.tabs.position(tabLabel(name), index + 1, TAB_NAMES.length),
}));

/** Tab of the first render, both for the application and for the return from another stack. */
export const INITIAL_TAB: TabName = 'aujourdhui';

/** Tab of a route name (Expo Router hands `aujourdhui`, `programme`…), or `null`. */
export function tabOfRoute(routeName: string): TabDefinition | null {
  return TABS.find((tab) => tab.name === routeName) ?? null;
}

/** Index of a route name in the tab bar, or `-1`. */
export function tabIndex(routeName: string): number {
  return TABS.findIndex((tab) => tab.name === routeName);
}

export type TabPressEffect = 'reselect' | 'select';

/**
 * What a press on a tab does (EF-1): a press on the active tab returns to the root of its stack
 * and scrolls it to the top (`reselect`); any other press selects the tab.
 */
export function tabPressEffect(activeRouteName: string, pressedRouteName: string): TabPressEffect {
  return activeRouteName === pressedRouteName ? 'reselect' : 'select';
}
