// Which sections of the chapter are on screen (SPEC-3302 ET-2, BR-COU-08).
//
// The screen measures each section with `onLayout` and the list with its own layout, then this pure
// function decides, for a scroll offset, which sections were read. A section counts when at least
// 35 % of the smaller of the two surfaces is inside the viewport: a long section is read as soon as
// the learner has seen a third of the screen of it, a short one as soon as it is a third visible.
// Used by the scroll handler, tested without a device.

/** Share of a section that must be visible to count as read (ET-2). */
export const VISIBLE_RATIO = 0.35;

export interface SectionBox {
  readonly id: string;
  /** Vertical offset of the section in the list content, in points. */
  readonly y: number;
  /** Height of the section, in points. */
  readonly height: number;
}

/** Identifiers of the sections visible at `scrollY`, in their order of the list. */
export function visibleSections(
  boxes: readonly SectionBox[],
  scrollY: number,
  viewportHeight: number,
  ratio: number = VISIBLE_RATIO,
): string[] {
  const viewport = Math.max(0, viewportHeight);
  if (viewport === 0) return [];
  const top = Math.max(0, scrollY);
  const bottom = top + viewport;
  const ids: string[] = [];
  for (const box of boxes) {
    if (box.height <= 0) continue;
    const seen = Math.min(box.y + box.height, bottom) - Math.max(box.y, top);
    if (seen <= 0) continue;
    const reference = Math.min(box.height, viewport);
    if (seen >= reference * ratio) ids.push(box.id);
  }
  return ids;
}
