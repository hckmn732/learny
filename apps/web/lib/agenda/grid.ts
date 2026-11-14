// Grid layout of the agenda (SPEC-704 ET-6, ET-7, CL-3). Pure functions: the positions come from
// the local minutes computed server-side, on the mockup scale of 60 px per hour.
import { minutesToClock } from './dates';

/** Minutes per hour on the grid scale (maquette). */
export const AGENDA_PX_PER_HOUR = 60;
/** Minimum grid start hour (ET-6): 09:00. */
export const AGENDA_GRID_MIN_START = 9;
/** Minimum grid end hour (ET-6): 18:00. */
export const AGENDA_GRID_MIN_END = 18;
/** Padding inside a slot button, in px (maquette: top = début + 2, hauteur = durée − 4). */
export const SLOT_INSET_PX = 2;

export interface AgendaSlotTime {
  startMinutes: number;
  /** Minutes since 00:00; for a slot crossing midnight the value is lower than `startMinutes`. */
  endMinutes: number;
}

/** End of a slot on the displayed day: a 23:30–00:30 slot fills the rest of the day (CL-3). */
export function effectiveEndMinutes(slot: AgendaSlotTime): number {
  return slot.endMinutes > slot.startMinutes ? slot.endMinutes : 24 * 60;
}

export interface GridHours {
  startHour: number;
  endHour: number;
  /** `09:00 … 17:00` from the start hour to the end hour excluded. */
  labels: string[];
}

/** ET-6 — the grid spans min(09:00, earliest start) to max(18:00, latest end), whole hours. */
export function gridHours(slots: readonly AgendaSlotTime[]): GridHours {
  let startHour = AGENDA_GRID_MIN_START;
  let endHour = AGENDA_GRID_MIN_END;
  for (const slot of slots) {
    startHour = Math.min(startHour, Math.floor(slot.startMinutes / 60));
    endHour = Math.max(endHour, Math.ceil(effectiveEndMinutes(slot) / 60));
  }
  const labels = Array.from({ length: Math.max(0, endHour - startHour) }, (_, index) =>
    minutesToClock((startHour + index) * 60),
  );
  return { startHour, endHour, labels };
}

export interface SlotLayout {
  /** Distance from the top of the grid column, in px (maquette scale). */
  top: number;
  /** Height of the button, in px. */
  height: number;
  /** Column index inside the overlap cluster (ET-7). */
  column: number;
  /** Number of columns of the cluster: `left = column/columns %`, `width = 1/columns %`. */
  columns: number;
  /** Clock labels of the slot, kept complete even when truncated (CL-3). */
  timeLabel: string;
}

/**
 * ET-7 — positions and overlap columns of one day. The slots are grouped in connected clusters,
 * then a greedy pass assigns one column per slot in order of start; the width is shared equally.
 */
export function layoutDay(slots: readonly AgendaSlotTime[], gridStartHour: number): SlotLayout[] {
  const sorted = slots
    .map((slot, index) => ({ slot, index }))
    .sort(
      (left, right) =>
        left.slot.startMinutes - right.slot.startMinutes ||
        effectiveEndMinutes(left.slot) - effectiveEndMinutes(right.slot) ||
        left.index - right.index,
    );

  const result = new Map<number, SlotLayout>();
  let cluster: { slot: AgendaSlotTime; index: number; column: number; clusterEnd: number }[] = [];
  let clusterEnd = -1;

  const flush = (): void => {
    for (const entry of cluster) {
      result.set(entry.index, {
        top:
          Math.max(0, (entry.slot.startMinutes / 60 - gridStartHour) * AGENDA_PX_PER_HOUR) +
          SLOT_INSET_PX,
        height: Math.max(
          16,
          ((effectiveEndMinutes(entry.slot) - entry.slot.startMinutes) / 60) * AGENDA_PX_PER_HOUR -
            SLOT_INSET_PX * 2,
        ),
        column: entry.column,
        columns: cluster.length,
        timeLabel: `${minutesToClock(entry.slot.startMinutes)} – ${minutesToClock(entry.slot.endMinutes)}`,
      });
    }
    cluster = [];
  };

  for (const { slot, index } of sorted) {
    if (cluster.length > 0 && slot.startMinutes >= clusterEnd) flush();
    // Greedy column: the first column whose last slot ends before this one starts.
    let column = 0;
    while (
      cluster.some(
        (entry) => entry.column === column && effectiveEndMinutes(entry.slot) > slot.startMinutes,
      )
    ) {
      column += 1;
    }
    cluster.push({
      slot,
      index,
      column,
      clusterEnd: Math.max(clusterEnd, effectiveEndMinutes(slot)),
    });
    clusterEnd =
      cluster.length === 1
        ? effectiveEndMinutes(slot)
        : Math.max(clusterEnd, effectiveEndMinutes(slot));
  }
  flush();

  return sorted.map(({ index }) => result.get(index) as SlotLayout);
}
