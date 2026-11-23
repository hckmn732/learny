// State machines of the three board games (SPEC-3301 EF-5, CA-4, ADR-3009 § 4).
//
// Every game exists twice: dragging an element and tapping elements one after the other. This
// module is the *tap* path, the one the accessibility requires and the one the Maestro flow
// plays; it is pure, so Vitest covers it without a device, and the components only draw it. The
// drag path of the components produces the same states through `place`, `swap` and `assign`.
import type { CategorizationResponse } from '@learny/bricks';

/** State of a matching played by successive taps (EF-5). */
export interface MatchingState {
  readonly selectedLeft: string | null;
  readonly pairs: Readonly<Record<string, string | null>>;
}

/** State of an ordering played by successive taps (EF-5). */
export interface OrderingState {
  readonly selected: string | null;
  readonly order: readonly string[];
}

/** State of a categorization played by successive taps (EF-5). */
export interface CategorizationState {
  readonly selectedItem: string | null;
  readonly assignments: CategorizationResponse['assignments'];
}

/** Initial matching state: the charge's lefts in their order, nothing placed yet. */
export function emptyMatching(leftIds: readonly string[]): MatchingState {
  const pairs: Record<string, string | null> = {};
  for (const id of leftIds) pairs[id] = null;
  return { selectedLeft: null, pairs };
}

/** Selecting a left toggles it; selecting another one replaces the selection. */
export function tapLeft(state: MatchingState, leftId: string): MatchingState {
  return { ...state, selectedLeft: state.selectedLeft === leftId ? null : leftId };
}

/**
 * Tapping a right places it on the selected left, or clears the placement when the same right was
 * already there (the learner touches it again). Without a selected left nothing moves.
 */
export function tapRight(state: MatchingState, rightId: string): MatchingState {
  if (state.selectedLeft === null) return state;
  const left = state.selectedLeft;
  const current = state.pairs[left] ?? null;
  return {
    selectedLeft: null,
    pairs: { ...state.pairs, [left]: current === rightId ? null : rightId },
  };
}

/** Places a right on a left, from the drag path. */
export function place(state: MatchingState, leftId: string, rightId: string | null): MatchingState {
  return { selectedLeft: null, pairs: { ...state.pairs, [leftId]: rightId } };
}

/** Initial ordering state: the shuffled order of the public charge. */
export function emptyOrdering(itemIds: readonly string[]): OrderingState {
  return { selected: null, order: [...itemIds] };
}

/** Moves one item to another position (EF-5, drag and taps share it). */
export function moveItem(order: readonly string[], from: number, to: number): readonly string[] {
  if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) {
    return [...order];
  }
  const next = [...order];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return [...order];
  next.splice(to, 0, moved);
  return next;
}

/** Exchanges two positions; the tap path swaps the selected item with the touched one. */
export function swapItems(
  order: readonly string[],
  first: string,
  second: string,
): readonly string[] {
  const from = order.indexOf(first);
  const to = order.indexOf(second);
  if (from === -1 || to === -1 || from === to) return [...order];
  const next = [...order];
  const moved = next[from];
  const replaced = next[to];
  if (moved === undefined || replaced === undefined) return [...order];
  next[from] = replaced;
  next[to] = moved;
  return next;
}

/** Tapping an item selects it; tapping a second one swaps them. */
export function tapOrderingItem(state: OrderingState, itemId: string): OrderingState {
  if (state.selected === null) return { ...state, selected: itemId };
  if (state.selected === itemId) return { ...state, selected: null };
  return { selected: null, order: swapItems(state.order, state.selected, itemId) };
}

/** Moves the selected or given item one position up (« Monter », ET-4). */
export function moveUp(state: OrderingState, itemId: string): OrderingState {
  const from = state.order.indexOf(itemId);
  return { ...state, order: moveItem(state.order, from, from - 1) };
}

/** Moves the selected or given item one position down (« Descendre », ET-4). */
export function moveDown(state: OrderingState, itemId: string): OrderingState {
  const from = state.order.indexOf(itemId);
  return { ...state, order: moveItem(state.order, from, from + 1) };
}

/** Initial categorization state: every item unassigned. */
export function emptyCategorization(itemIds: readonly string[]): CategorizationState {
  const assignments: Record<string, string | null> = {};
  for (const id of itemIds) assignments[id] = null;
  return { selectedItem: null, assignments };
}

/** Selecting an item toggles it; selecting another one replaces the selection. */
export function tapItem(state: CategorizationState, itemId: string): CategorizationState {
  return { ...state, selectedItem: state.selectedItem === itemId ? null : itemId };
}

/** Tapping a category files the selected item in it (same category again removes it). */
export function tapCategory(state: CategorizationState, categoryId: string): CategorizationState {
  if (state.selectedItem === null) return state;
  const item = state.selectedItem;
  const current = state.assignments[item] ?? null;
  return {
    selectedItem: null,
    assignments: { ...state.assignments, [item]: current === categoryId ? null : categoryId },
  };
}

/** Files one item, from the drag path. */
export function assign(
  state: CategorizationState,
  itemId: string,
  categoryId: string | null,
): CategorizationState {
  return { selectedItem: null, assignments: { ...state.assignments, [itemId]: categoryId } };
}
