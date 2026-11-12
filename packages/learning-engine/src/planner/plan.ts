// Deterministic greedy planner (SPEC-407, ADR-0029, ADR-0280). The function is pure: every date,
// time zone and business parameter is an input; it never reads the clock, the configuration
// package, the database or the network. Formations are visited by end date then identifier, their
// modules by position, and every activity is placed in the first compatible free window while the
// cumulative daily capacity of all formations is respected.
import { EngineError } from '../errors';
import { fnv1a32 } from '../random';
import {
  addDays,
  compareDates,
  daysBetween,
  isoWeekday,
  isIsoDate,
  localDateOf,
  localMinutesOf,
  parseInstant,
} from '../time';
import { assertAvailability } from '../types';
import type { Availability, Id, IsoDate, SlotKind, StudySlot } from '../types';

import {
  MINUTES_PER_DAY,
  assertPlannerParams,
  assertPreferences,
  globalQuizReserve,
  instantsOfRange,
  invalidInput,
  isRealWindow,
  isStudyDay,
  maxChunkMinutes,
  minutesOfRange,
  overlaps,
  roundToGranularity,
  slotLocalIntervals,
  subtractRanges,
  windowsOfDay,
  type MinuteRange,
} from './grid';
import type {
  DayCapacity,
  ExistingPlannerSlot,
  FormationDeadline,
  PlanConflict,
  PlanResult,
  PlanScheduleInput,
  PlannedSlot,
  PlannerChapter,
  PlannerFormation,
  PlannerModule,
  PlannerParams,
  PlannerPreferences,
  ReplanOption,
  UnscheduledActivity,
} from './types';

const MAX_HORIZON_DAYS = 366;

interface ActivitySpec {
  readonly key: string;
  readonly formationId: Id;
  readonly moduleId: Id | null;
  readonly kind: SlotKind;
  readonly title: string;
  readonly minutes: number;
  /** Minutes of margin placed immediately after the activity when the day allows it. */
  readonly bufferMinutes: number;
}

interface Placement {
  readonly date: IsoDate;
  readonly moment: StudySlot;
  readonly range: MinuteRange;
}

interface PlacementOptions {
  readonly exactDate?: IsoDate;
  readonly notBefore?: string;
}

interface DayState {
  readonly busy: Map<IsoDate, MinuteRange[]>;
  readonly used: Map<IsoDate, number>;
  readonly quizDates: Set<IsoDate>;
}

interface PreservedState extends DayState {
  readonly slots: PlannedSlot[];
  readonly consumedKeys: Map<string, number>;
  readonly missedKeys: Map<string, number>;
  readonly usedIds: Set<string>;
  readonly manualConflicts: PlanConflict[];
}

interface ScheduleOverrides {
  readonly availability?: Availability;
  readonly lightenRatio?: number;
}

interface Outcome {
  readonly slots: PlannedSlot[];
  readonly unscheduled: UnscheduledActivity[];
  readonly deadlines: FormationDeadline[];
  readonly conflicts: PlanConflict[];
}

export function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function sortedFormations(formations: readonly PlannerFormation[]): PlannerFormation[] {
  return [...formations].sort(
    (left, right) =>
      compareDates(left.endDate, right.endDate) || compareText(left.formationId, right.formationId),
  );
}

function sortedModules(modules: readonly PlannerModule[]): PlannerModule[] {
  return [...modules].sort(
    (left, right) => left.position - right.position || compareText(left.moduleId, right.moduleId),
  );
}

function sortedChapters(chapters: readonly PlannerChapter[]): PlannerChapter[] {
  return [...chapters].sort(
    (left, right) => left.position - right.position || compareText(left.chapterId, right.chapterId),
  );
}

function activityKey(formationId: Id, moduleId: Id | null, kind: SlotKind, title: string): string {
  return `${formationId}|${moduleId ?? ''}|${kind}|${title}`;
}

function slotIdentifier(key: string): string {
  return `slot-${fnv1a32(key).toString(36)}`;
}

function validateInput(input: PlanScheduleInput): void {
  assertPlannerParams(input.params);
  assertPreferences(input.preferences);
  // CL-1: a list without study day is refused by the dedicated availability error.
  assertAvailability(input.preferences.availability);
  parseInstant(input.now);
  for (const formation of input.formations) {
    if (!isIsoDate(formation.endDate)) {
      throw invalidInput('formations.endDate', 'Date de fin invalide.');
    }
    for (const module of formation.modules) {
      if (!Number.isFinite(module.hours) || module.hours <= 0) {
        throw invalidInput(
          'formations.modules.hours',
          `Volume horaire invalide pour ${module.moduleId}.`,
        );
      }
      if (!Number.isInteger(module.position) || module.position < 1) {
        throw invalidInput(
          'formations.modules.position',
          `Position de module invalide pour ${module.moduleId}.`,
        );
      }
      if (module.deadline !== undefined && !isIsoDate(module.deadline)) {
        throw invalidInput('formations.modules.deadline', 'Échéance de module invalide.');
      }
      for (const chapter of module.chapters) {
        if (!Number.isInteger(chapter.position) || chapter.position < 0) {
          throw invalidInput(
            'formations.modules.chapters.position',
            `Position de chapitre invalide pour ${chapter.chapterId}.`,
          );
        }
      }
    }
  }
  for (const slot of input.existingSlots ?? []) {
    try {
      slotLocalIntervals(slot.startsAt, slot.endsAt, input.preferences.tz);
    } catch (error) {
      if (error instanceof EngineError) throw error;
      throw invalidInput('existingSlots', `Créneau existant invalide : ${slot.slotId}`);
    }
  }
}

function dayCapacity(preferences: PlannerPreferences): number {
  return preferences.availability.hoursPerDay * 60;
}

function addBusy(state: DayState, date: IsoDate, range: MinuteRange): void {
  const ranges = state.busy.get(date) ?? [];
  ranges.push(range);
  state.busy.set(date, ranges);
}

function addUsed(state: DayState, date: IsoDate, minutes: number): void {
  state.used.set(date, (state.used.get(date) ?? 0) + minutes);
}

function isFuture(startsAt: string, now: string): boolean {
  return parseInstant(startsAt) > parseInstant(now);
}

function startsOnOrAfter(startsAt: string, now: string): boolean {
  return parseInstant(startsAt) >= parseInstant(now);
}

/** Preserves completed, missed and valid manual slots before recomputing the future (ET-3). */
function preserveExisting(
  input: PlanScheduleInput,
  isPaused: (formationId: Id | null) => boolean,
  availability: Availability,
): PreservedState {
  const state: PreservedState = {
    busy: new Map(),
    used: new Map(),
    quizDates: new Set(),
    slots: [],
    consumedKeys: new Map(),
    missedKeys: new Map(),
    usedIds: new Set(),
    manualConflicts: [],
  };
  const capacity = dayCapacity({ ...input.preferences, availability });
  const ordered = [...(input.existingSlots ?? [])].sort(
    (left, right) =>
      parseInstant(left.startsAt) - parseInstant(right.startsAt) ||
      compareText(left.slotId, right.slotId),
  );
  for (const slot of ordered) {
    const future = isFuture(slot.startsAt, input.now);
    const paused = isPaused(slot.formationId);
    // BR-FOR-15: a paused formation loses every future slot, but keeps its history.
    if (paused && future && slot.status !== 'done') continue;
    if (slot.status === 'cancelled') {
      state.slots.push(toPlannedSlot(slot, 'cancelled'));
      state.usedIds.add(slot.slotId);
      continue;
    }
    const intervals = slotLocalIntervals(slot.startsAt, slot.endsAt, input.preferences.tz);
    if (slot.status === 'moved') {
      state.slots.push(toPlannedSlot(slot, 'moved'));
      state.usedIds.add(slot.slotId);
      continue;
    }
    const effectiveStatus =
      slot.status === 'planned' &&
      slot.createdBy !== 'learner' &&
      parseInstant(slot.endsAt) <= parseInstant(input.now)
        ? 'missed'
        : slot.status;
    if (slot.status === 'planned' && slot.createdBy === 'learner' && future) {
      const invalid = intervals.some(({ date, range }) => {
        if (!isStudyDay(date, input.preferences, isoWeekday)) return true;
        const already = state.busy.get(date) ?? [];
        if (already.some((busy) => overlaps(busy, range))) return true;
        const total = state.used.get(date) ?? 0;
        return total + minutesOfRange(range) > capacity;
      });
      if (invalid) {
        state.manualConflicts.push({
          date: localDateOf(slot.startsAt, input.preferences.tz),
          kind: 'overlap',
          slotIds: [slot.slotId],
          message: 'Déplacement manuel incompatible avec le rythme : il sera recalculé.',
        });
        continue;
      }
    }
    const planned = toPlannedSlot(slot, effectiveStatus);
    state.slots.push(planned);
    state.usedIds.add(slot.slotId);
    if (effectiveStatus === 'done') {
      const key = activityKey(slot.formationId ?? '', slot.moduleId, slot.kind, slot.title);
      state.consumedKeys.set(key, (state.consumedKeys.get(key) ?? 0) + 1);
    }
    if (effectiveStatus === 'missed') {
      const key = activityKey(slot.formationId ?? '', slot.moduleId, slot.kind, slot.title);
      state.missedKeys.set(key, (state.missedKeys.get(key) ?? 0) + 1);
    }
    if (effectiveStatus === 'planned' && slot.createdBy === 'learner') {
      const key = activityKey(slot.formationId ?? '', slot.moduleId, slot.kind, slot.title);
      state.consumedKeys.set(key, (state.consumedKeys.get(key) ?? 0) + 1);
    }
    for (const { date, range } of intervals) {
      addBusy(state, date, range);
      addUsed(state, date, minutesOfRange(range));
    }
    if (slot.kind === 'global_quiz') {
      state.quizDates.add(localDateOf(slot.startsAt, input.preferences.tz));
    }
  }
  return state;
}

function toPlannedSlot(slot: ExistingPlannerSlot, status: PlannedSlot['status']): PlannedSlot {
  return {
    slotId: slot.slotId,
    formationId: slot.formationId,
    moduleId: slot.moduleId,
    kind: slot.kind,
    title: slot.title,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    status,
    createdBy: slot.createdBy ?? 'planner',
    movedFromId: slot.movedFromId ?? null,
  };
}

function lightenedMinutes(available: number, ratio: number, granularity: number): number {
  if (ratio <= 0) return available;
  return roundToGranularity(available * (1 - ratio), granularity);
}

function distributeContributions(
  total: number,
  chapters: readonly PlannerChapter[],
  granularity: number,
): number[] {
  const count = Math.max(1, chapters.length);
  const base = Math.floor(total / count / granularity) * granularity;
  const shares = Array.from({ length: count }, () => base);
  let remaining = total - base * count;
  for (let index = 0; index < count && remaining >= granularity; index += 1) {
    shares[index] = (shares[index] ?? 0) + granularity;
    remaining -= granularity;
  }
  return shares;
}

function pushChunked(
  list: ActivitySpec[],
  activity: Omit<ActivitySpec, 'key'> & { readonly chunkKey: string },
  maxChunk: number,
): void {
  const chunks = Math.ceil(activity.minutes / maxChunk);
  if (chunks <= 1) {
    list.push({ ...activity, key: `${activity.chunkKey}|0` });
    return;
  }
  let remaining = activity.minutes;
  for (let index = 0; index < chunks; index += 1) {
    const minutes = Math.min(maxChunk, remaining);
    const title = `${activity.title} (${String(index + 1)}/${String(chunks)})`;
    list.push({
      ...activity,
      title,
      minutes,
      bufferMinutes: index === chunks - 1 ? activity.bufferMinutes : 0,
      key: `${activity.chunkKey}|${String(index)}`,
    });
    remaining -= minutes;
  }
}

function moduleActivities(
  formation: PlannerFormation,
  module: PlannerModule,
  params: PlannerParams,
  lightenRatio: number,
  maxChunk: number,
): ActivitySpec[] {
  const activities: ActivitySpec[] = [];
  const granularity = params.granularityMinutes;
  const prefix = module.title ?? module.moduleId;
  const total = roundToGranularity(module.hours * 60, granularity);
  const fixed = params.validationQuizMinutes + params.bufferMinutes;
  const available = Math.max(0, total - fixed);
  const light = lightenedMinutes(available, lightenRatio, granularity);
  const contributionsTotal = Math.min(
    light,
    roundToGranularity(light * params.contributionShare, granularity),
  );
  const rest = Math.max(0, light - contributionsTotal);
  const exercise =
    module.hasExercise === true && rest >= granularity * 2
      ? roundToGranularity(rest * 0.3, granularity)
      : 0;
  const course = Math.max(0, rest - exercise);
  const chapters = sortedChapters(module.chapters);
  const shares = distributeContributions(contributionsTotal, chapters, granularity);
  if (chapters.length === 0) {
    if (contributionsTotal > 0) {
      pushChunked(
        activities,
        {
          formationId: formation.formationId,
          moduleId: module.moduleId,
          kind: 'contributions',
          title: `Apports — ${prefix}`,
          minutes: contributionsTotal,
          bufferMinutes: 0,
          chunkKey: `${formation.formationId}|${module.moduleId}|contributions`,
        },
        maxChunk,
      );
    }
  } else {
    chapters.forEach((chapter, index) => {
      const minutes = shares[index] ?? 0;
      if (minutes <= 0) return;
      pushChunked(
        activities,
        {
          formationId: formation.formationId,
          moduleId: module.moduleId,
          kind: 'contributions',
          title: `Apports — ${chapter.title ?? chapter.chapterId}`,
          minutes,
          bufferMinutes: 0,
          chunkKey: `${formation.formationId}|${module.moduleId}|contributions|${chapter.chapterId}`,
        },
        maxChunk,
      );
    });
  }
  if (course > 0) {
    pushChunked(
      activities,
      {
        formationId: formation.formationId,
        moduleId: module.moduleId,
        kind: 'course',
        title: `Cours — ${prefix}`,
        minutes: course,
        bufferMinutes: 0,
        chunkKey: `${formation.formationId}|${module.moduleId}|course`,
      },
      maxChunk,
    );
  }
  if (exercise > 0) {
    pushChunked(
      activities,
      {
        formationId: formation.formationId,
        moduleId: module.moduleId,
        kind: 'exercise',
        title: `Exercice — ${prefix}`,
        minutes: exercise,
        bufferMinutes: 0,
        chunkKey: `${formation.formationId}|${module.moduleId}|exercise`,
      },
      maxChunk,
    );
  }
  pushChunked(
    activities,
    {
      formationId: formation.formationId,
      moduleId: module.moduleId,
      kind: 'validation_quiz',
      title: `Quiz de validation — ${prefix}`,
      minutes: params.validationQuizMinutes,
      bufferMinutes: params.bufferMinutes,
      chunkKey: `${formation.formationId}|${module.moduleId}|validation_quiz`,
    },
    maxChunk,
  );
  return activities;
}

function formationActivities(
  formation: PlannerFormation,
  params: PlannerParams,
  lightenRatio: number,
  maxChunk: number,
): ActivitySpec[] {
  if (formation.status === 'paused') return [];
  const activities: ActivitySpec[] = [];
  const modules = sortedModules(formation.modules);
  const exam = (formation.objectives ?? []).includes('exam');
  modules.forEach((module, index) => {
    if (module.status !== 'validated') {
      activities.push(...moduleActivities(formation, module, params, lightenRatio, maxChunk));
    }
    const penultimate = modules.length >= 2 && index === modules.length - 2;
    const last = index === modules.length - 1;
    if (exam && (penultimate || last)) {
      const number = penultimate ? 1 : 2;
      const minutes = params.mockExam.questions * params.mockExam.minutesPerQuestion;
      activities.push({
        key: `${formation.formationId}||mock_exam|${String(number)}`,
        formationId: formation.formationId,
        moduleId: null,
        kind: 'mock_exam',
        title: `Examen blanc ${String(number)} — ${formation.title ?? formation.formationId}`,
        minutes,
        bufferMinutes: 0,
      });
    }
  });
  return activities;
}

function contentMinutes(
  formation: PlannerFormation,
  params: PlannerParams,
  lightenRatio: number,
): number {
  return formationActivities(
    formation,
    params,
    lightenRatio,
    maxChunkMinutes(params, ['matin', 'apres_midi', 'soir']),
  )
    .filter((activity) => ['contributions', 'course', 'exercise'].includes(activity.kind))
    .reduce((total, activity) => total + activity.minutes, 0);
}

function findPlacement(
  state: DayState,
  input: PlanScheduleInput,
  availability: Availability,
  minutes: number,
  options: PlacementOptions = {},
): Placement | null {
  const tz = input.preferences.tz;
  const nowDate = localDateOf(input.now, tz);
  const nowMinutes = localMinutesOf(input.now, tz);
  const preferences: PlannerPreferences = { ...input.preferences, availability };
  const capacity = dayCapacity(preferences);
  const reserve = globalQuizReserve(preferences, input.params);
  const startDate = options.exactDate ?? nowDate;
  if (options.exactDate !== undefined && compareDates(options.exactDate, nowDate) < 0) return null;
  const notBefore = options.notBefore;
  for (let offset = 0; offset <= MAX_HORIZON_DAYS; offset += 1) {
    const date = addDays(startDate, offset);
    if (options.exactDate !== undefined && offset > 0) return null;
    if (!isStudyDay(date, preferences, isoWeekday)) continue;
    const hasQuiz = state.quizDates.has(date);
    const reserved = hasQuiz ? 0 : input.params.globalQuizMinutes;
    const windows = windowsOfDay(date, preferences, input.params, nowDate, nowMinutes);
    for (const window of windows) {
      if (window.end <= window.start) continue;
      const blocks: MinuteRange[] = [...(state.busy.get(date) ?? [])];
      if (!hasQuiz) blocks.push(reserve);
      if (notBefore !== undefined) {
        const notBeforeDate = localDateOf(notBefore, tz);
        if (compareDates(notBeforeDate, date) > 0) continue;
        if (notBeforeDate === date) {
          const minutesAfter = localMinutesOf(notBefore, tz);
          blocks.push({ start: 0, end: minutesAfter });
        }
      }
      const free = subtractRanges({ start: window.start, end: window.end }, blocks);
      for (const gap of free) {
        if (minutesOfRange(gap) < minutes) continue;
        const candidate: MinuteRange = { start: gap.start, end: gap.start + minutes };
        if (candidate.end > MINUTES_PER_DAY) continue;
        if (!isRealWindow(date, candidate, tz)) continue;
        if ((state.used.get(date) ?? 0) + minutes + reserved > capacity) continue;
        return { date, moment: window.moment, range: candidate };
      }
    }
  }
  return null;
}

function scheduleActivity(
  state: PreservedState,
  input: PlanScheduleInput,
  availability: Availability,
  activity: ActivitySpec,
  notBefore?: string,
): { primary: PlannedSlot; buffer: PlannedSlot | null } | null {
  const tz = input.preferences.tz;
  const required = activity.minutes + activity.bufferMinutes;
  const placement = findPlacement(
    state,
    input,
    availability,
    required,
    notBefore === undefined ? {} : { notBefore },
  );
  if (placement !== null) {
    const ids = plannedIds(state, activity);
    const primaryRange: MinuteRange = {
      start: placement.range.start,
      end: placement.range.start + activity.minutes,
    };
    const primary = makeSlot(
      state,
      activity,
      placement.date,
      placement.range.start,
      primaryRange,
      ids.primary,
      tz,
    );
    recordSlot(state, primary, primaryRange, input.preferences.tz);
    let buffer: PlannedSlot | null = null;
    if (activity.bufferMinutes > 0) {
      const bufferRange: MinuteRange = {
        start: primaryRange.end,
        end: primaryRange.end + activity.bufferMinutes,
      };
      buffer = makeSlot(
        state,
        {
          ...activity,
          kind: 'buffer',
          title: `Marge de rattrapage — ${activity.title.replace(/^Quiz de validation — /, '')}`,
        },
        placement.date,
        bufferRange.start,
        bufferRange,
        ids.buffer,
        tz,
      );
      recordSlot(state, buffer, bufferRange, tz);
    }
    return { primary, buffer };
  }
  if (activity.bufferMinutes === 0) return null;
  // Low daily capacity: place the quiz alone, then its margin at the next compatible instant
  // (still strictly after the quiz, CA-2).
  const alone = findPlacement(
    state,
    input,
    availability,
    activity.minutes,
    notBefore === undefined ? {} : { notBefore },
  );
  if (alone === null) return null;
  const ids = plannedIds(state, activity);
  const primaryRange: MinuteRange = {
    start: alone.range.start,
    end: alone.range.start + activity.minutes,
  };
  const primary = makeSlot(
    state,
    activity,
    alone.date,
    alone.range.start,
    primaryRange,
    ids.primary,
    tz,
  );
  recordSlot(state, primary, primaryRange, tz);
  const bufferPlacement = findPlacement(state, input, availability, activity.bufferMinutes, {
    notBefore: primary.endsAt,
  });
  if (bufferPlacement === null) return { primary, buffer: null };
  const bufferRange: MinuteRange = {
    start: bufferPlacement.range.start,
    end: bufferPlacement.range.start + activity.bufferMinutes,
  };
  const buffer = makeSlot(
    state,
    {
      ...activity,
      kind: 'buffer',
      title: `Marge de rattrapage — ${activity.title.replace(/^Quiz de validation — /, '')}`,
    },
    bufferPlacement.date,
    bufferRange.start,
    bufferRange,
    ids.buffer,
    tz,
  );
  recordSlot(state, buffer, bufferRange, tz);
  return { primary, buffer };
}

function plannedIds(
  state: PreservedState,
  activity: ActivitySpec,
): { primary: string; buffer: string } {
  let base = slotIdentifier(activity.key);
  let primary = base;
  let suffix = 1;
  while (state.usedIds.has(primary)) {
    suffix += 1;
    primary = `${base}-${String(suffix)}`;
  }
  base = slotIdentifier(`${activity.key}|buffer`);
  let buffer = base;
  suffix = 1;
  while (state.usedIds.has(buffer) || buffer === primary) {
    suffix += 1;
    buffer = `${base}-${String(suffix)}`;
  }
  return { primary, buffer };
}

function makeSlot(
  state: PreservedState,
  activity: ActivitySpec,
  date: IsoDate,
  start: number,
  range: MinuteRange,
  slotId: string,
  tz: string,
): PlannedSlot {
  const instants = instantsOfRange(date, range, tz);
  const replay = state.missedKeys.get(activity.key) ?? 0;
  const finalId = replay > 0 ? `${slotId}-r${String(replay)}` : slotId;
  return {
    slotId: finalId,
    formationId: activity.formationId,
    moduleId: activity.moduleId,
    kind: activity.kind,
    title: activity.title,
    startsAt: instants.startsAt,
    endsAt: instants.endsAt,
    status: 'planned',
    createdBy: 'planner',
    movedFromId: null,
  };
}

function recordSlot(
  state: PreservedState,
  slot: PlannedSlot,
  range: MinuteRange,
  tz: string,
): void {
  state.slots.push(slot);
  state.usedIds.add(slot.slotId);
  addBusy(state, localDateOf(slot.startsAt, tz), range);
  addUsed(state, localDateOf(slot.startsAt, tz), minutesOfRange(range));
}

function scheduleSprints(
  state: PreservedState,
  input: PlanScheduleInput,
  availability: Availability,
  outcomeSlots: PlannedSlot[],
  outcomeUnscheduled: UnscheduledActivity[],
): void {
  const tz = input.preferences.tz;
  const nowDate = localDateOf(input.now, tz);
  const k = input.params.sprintDaysBeforeDefault;
  const exams = outcomeSlots.filter(
    (slot) =>
      slot.status === 'planned' &&
      (slot.kind === 'validation_quiz' || slot.kind === 'mock_exam') &&
      startsOnOrAfter(slot.startsAt, input.now),
  );
  for (const exam of exams) {
    const examDate = localDateOf(exam.startsAt, tz);
    const targets = [...new Set([k, 1])].filter((offset) => offset > 0);
    for (const offset of targets) {
      const targetDate = addDays(examDate, -offset);
      if (compareDates(targetDate, nowDate) < 0) continue;
      let studyDate: IsoDate | null = null;
      for (let back = 0; back <= 14; back += 1) {
        const candidate = addDays(targetDate, -back);
        if (compareDates(candidate, nowDate) < 0) break;
        if (isStudyDay(candidate, input.preferences, isoWeekday)) {
          studyDate = candidate;
          break;
        }
      }
      if (studyDate === null) {
        outcomeUnscheduled.push({
          formationId: exam.formationId ?? '',
          moduleId: exam.moduleId,
          kind: 'sprint',
          title: `Sprint — ${exam.title}`,
          minutes: input.params.sprintMinutes,
          reason: 'Aucun jour d’étude avant l’épreuve.',
        });
        continue;
      }
      const sprintId = sprintSlotId(exam.slotId, studyDate);
      if (state.usedIds.has(sprintId)) continue;
      const placement = findPlacement(state, input, availability, input.params.sprintMinutes, {
        exactDate: studyDate,
      });
      if (placement === null) {
        outcomeUnscheduled.push({
          formationId: exam.formationId ?? '',
          moduleId: exam.moduleId,
          kind: 'sprint',
          title: `Sprint — ${exam.title}`,
          minutes: input.params.sprintMinutes,
          reason: 'Capacité insuffisante sur le jour cible.',
        });
        continue;
      }
      const range: MinuteRange = {
        start: placement.range.start,
        end: placement.range.start + input.params.sprintMinutes,
      };
      const instants = instantsOfRange(studyDate, range, tz);
      const slot: PlannedSlot = {
        slotId: sprintId,
        formationId: exam.formationId,
        moduleId: exam.moduleId,
        kind: 'sprint',
        title: `Sprint — ${exam.title}`,
        startsAt: instants.startsAt,
        endsAt: instants.endsAt,
        status: 'planned',
        createdBy: 'planner',
        movedFromId: null,
      };
      state.slots.push(slot);
      state.usedIds.add(slot.slotId);
      addBusy(state, studyDate, range);
      addUsed(state, studyDate, input.params.sprintMinutes);
    }
  }
}

function sprintSlotId(examSlotId: string, date: IsoDate): string {
  return `slot-sprint-${fnv1a32(`${examSlotId}|${date}`).toString(36)}`;
}

function finalizeGlobalQuizzes(state: PreservedState, input: PlanScheduleInput): void {
  const tz = input.preferences.tz;
  const nowDate = localDateOf(input.now, tz);
  const capacity = dayCapacity(input.preferences);
  const reserve = globalQuizReserve(input.preferences, input.params);
  const dates = new Set<IsoDate>();
  for (const slot of state.slots) {
    if (slot.kind === 'global_quiz' || slot.status !== 'planned') continue;
    if (!startsOnOrAfter(slot.startsAt, input.now)) continue;
    dates.add(localDateOf(slot.startsAt, tz));
  }
  for (const date of [...dates].sort(compareDates)) {
    if (compareDates(date, nowDate) < 0) continue;
    if (state.quizDates.has(date)) continue;
    if (!isRealWindow(date, reserve, tz)) continue;
    if ((state.used.get(date) ?? 0) + minutesOfRange(reserve) > capacity) continue;
    const instants = instantsOfRange(date, reserve, tz);
    const slot: PlannedSlot = {
      slotId: `slot-gq-${date}`,
      formationId: null,
      moduleId: null,
      kind: 'global_quiz',
      title: 'Quiz global',
      startsAt: instants.startsAt,
      endsAt: instants.endsAt,
      status: 'planned',
      createdBy: 'planner',
      movedFromId: null,
    };
    if (state.usedIds.has(slot.slotId)) continue;
    state.slots.push(slot);
    state.usedIds.add(slot.slotId);
    state.quizDates.add(date);
    addBusy(state, date, reserve);
    addUsed(state, date, minutesOfRange(reserve));
  }
}

function computeDeadlines(
  input: PlanScheduleInput,
  slots: readonly PlannedSlot[],
): FormationDeadline[] {
  const tz = input.preferences.tz;
  return sortedFormations(input.formations).map((formation) => {
    const planned = slots.filter(
      (slot) =>
        slot.formationId === formation.formationId &&
        slot.status === 'planned' &&
        slot.kind !== 'global_quiz',
    );
    const projectedEndDate = planned.reduce<IsoDate>((latest, slot) => {
      const date = localDateOf(slot.endsAt, tz);
      return compareDates(date, latest) > 0 ? date : latest;
    }, formation.endDate);
    const blockedModules: Id[] = [];
    for (const module of sortedModules(formation.modules)) {
      if (module.status === 'validated') continue;
      const moduleSlots = planned.filter((slot) => slot.moduleId === module.moduleId);
      if (moduleSlots.length === 0) continue;
      const moduleEnd = moduleSlots.reduce<IsoDate>((latest, slot) => {
        const date = localDateOf(slot.endsAt, tz);
        return compareDates(date, latest) > 0 ? date : latest;
      }, formation.endDate);
      const reference = module.deadline ?? formation.endDate;
      if (daysBetween(reference, moduleEnd) >= input.params.blockedDelayDays) {
        blockedModules.push(module.moduleId);
      }
    }
    return {
      formationId: formation.formationId,
      endDate: formation.endDate,
      projectedEndDate,
      missed: compareDates(projectedEndDate, formation.endDate) > 0,
      blockedModules,
    };
  });
}

function computeConflicts(
  input: PlanScheduleInput,
  slots: readonly PlannedSlot[],
  manualConflicts: readonly PlanConflict[],
): PlanConflict[] {
  const tz = input.preferences.tz;
  const conflicts: PlanConflict[] = [...manualConflicts];
  const byDate = new Map<IsoDate, { slotId: Id; range: MinuteRange }[]>();
  for (const slot of slots) {
    if (slot.status === 'cancelled' || slot.status === 'moved') continue;
    for (const { date, range } of slotLocalIntervals(slot.startsAt, slot.endsAt, tz)) {
      const entries = byDate.get(date) ?? [];
      entries.push({ slotId: slot.slotId, range });
      byDate.set(date, entries);
    }
  }
  const capacity = dayCapacity(input.preferences);
  for (const date of [...byDate.keys()].sort(compareDates)) {
    const entries = byDate.get(date) ?? [];
    for (let left = 0; left < entries.length; left += 1) {
      for (let right = left + 1; right < entries.length; right += 1) {
        const one = entries[left];
        const other = entries[right];
        if (one === undefined || other === undefined) continue;
        if (!overlaps(one.range, other.range)) continue;
        const ids = [one.slotId, other.slotId].sort(compareText);
        if (
          conflicts.some(
            (conflict) => conflict.kind === 'overlap' && sameIds(conflict.slotIds, ids),
          )
        ) {
          continue;
        }
        conflicts.push({
          date,
          kind: 'overlap',
          slotIds: ids,
          message: `Chevauchement de créneaux le ${date}.`,
        });
      }
    }
    const used = entries.reduce((total, entry) => total + minutesOfRange(entry.range), 0);
    if (used > capacity) {
      conflicts.push({
        date,
        kind: 'capacity',
        slotIds: entries.map((entry) => entry.slotId).sort(compareText),
        message: `Capacité dépassée le ${date} : ${String(used)} min pour ${String(capacity)} min.`,
      });
    }
  }
  return conflicts;
}

function sameIds(left: readonly Id[], right: readonly Id[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function computeRemainingCapacity(
  input: PlanScheduleInput,
  slots: readonly PlannedSlot[],
): DayCapacity[] {
  const tz = input.preferences.tz;
  const used = new Map<IsoDate, number>();
  for (const slot of slots) {
    if (slot.status === 'cancelled' || slot.status === 'moved') continue;
    for (const { date, range } of slotLocalIntervals(slot.startsAt, slot.endsAt, tz)) {
      used.set(date, (used.get(date) ?? 0) + minutesOfRange(range));
    }
  }
  const total = dayCapacity(input.preferences);
  return [...used.keys()].sort(compareDates).map((date) => {
    const minutes = used.get(date) ?? 0;
    return {
      date,
      totalMinutes: total,
      usedMinutes: minutes,
      remainingMinutes: Math.max(0, total - minutes),
    };
  });
}

function computeOutcome(input: PlanScheduleInput, overrides: ScheduleOverrides): Outcome {
  const availability = overrides.availability ?? input.preferences.availability;
  const formations = sortedFormations(input.formations);
  const byId = new Map(formations.map((formation) => [formation.formationId, formation]));
  const preserved = preserveExisting(
    input,
    (formationId) => (formationId === null ? false : byId.get(formationId)?.status === 'paused'),
    availability,
  );
  const maxChunk = maxChunkMinutes(input.params, availability.preferredSlots);
  const unscheduled: UnscheduledActivity[] = [];
  for (const formation of formations) {
    if (formation.status === 'paused') continue;
    const activities = formationActivities(
      formation,
      input.params,
      overrides.lightenRatio ?? 0,
      maxChunk,
    );
    let cursor: string | undefined;
    for (const activity of activities) {
      const consumed = preserved.consumedKeys.get(activity.key) ?? 0;
      if (consumed > 0) {
        preserved.consumedKeys.set(activity.key, consumed - 1);
        continue;
      }
      const placed = scheduleActivity(preserved, input, availability, activity, cursor);
      if (placed !== null) {
        cursor = (placed.buffer ?? placed.primary).endsAt;
      }
      if (placed === null) {
        unscheduled.push({
          formationId: activity.formationId,
          moduleId: activity.moduleId,
          kind: activity.kind,
          title: activity.title,
          minutes: activity.minutes,
          reason: 'Aucun créneau compatible dans l’horizon de 366 jours.',
        });
      }
    }
  }
  scheduleSprints(preserved, input, availability, preserved.slots, unscheduled);
  finalizeGlobalQuizzes(preserved, input);
  const deadlines = computeDeadlines(input, preserved.slots);
  const conflicts = computeConflicts(input, preserved.slots, preserved.manualConflicts);
  return { slots: preserved.slots, unscheduled, deadlines, conflicts };
}

function optionBase(
  formationId: Id,
  kind: ReplanOption['kind'],
  deadline: FormationDeadline,
  hoursPerDay: number,
): Pick<
  ReplanOption,
  | 'formationId'
  | 'kind'
  | 'currentEndDate'
  | 'currentHoursPerDay'
  | 'projectedEndDate'
  | 'extraDays'
  | 'newHoursPerDay'
  | 'removedMinutes'
  | 'reason'
  | 'feasible'
> {
  return {
    formationId,
    kind,
    feasible: false,
    reason: null,
    currentEndDate: deadline.endDate,
    projectedEndDate: deadline.projectedEndDate,
    extraDays: null,
    currentHoursPerDay: hoursPerDay,
    newHoursPerDay: null,
    removedMinutes: null,
  };
}

function buildOptions(input: PlanScheduleInput, outcome: Outcome): ReplanOption[] {
  const options: ReplanOption[] = [];
  const hours = input.preferences.availability.hoursPerDay;
  for (const deadline of outcome.deadlines) {
    if (!deadline.missed) continue;
    const formation = input.formations.find(
      (candidate) => candidate.formationId === deadline.formationId,
    );
    if (formation === undefined) continue;
    const shift = optionBase(formation.formationId, 'shift_end', deadline, hours);
    options.push({
      ...shift,
      feasible: true,
      extraDays: Math.max(0, daysBetween(deadline.endDate, deadline.projectedEndDate)),
    });

    const maxHours = Math.min(input.params.maxHoursPerDay, 6);
    let volume: ReplanOption | null = null;
    let lastProjected: IsoDate = deadline.projectedEndDate;
    for (let candidate = hours + 1; candidate <= maxHours; candidate += 1) {
      const simulation = computeOutcome(input, {
        availability: { ...input.preferences.availability, hoursPerDay: candidate },
      });
      const simulated = simulation.deadlines.find(
        (entry) => entry.formationId === formation.formationId,
      );
      if (simulated === undefined) continue;
      lastProjected = simulated.projectedEndDate;
      if (!simulated.missed) {
        volume = {
          ...shift,
          feasible: true,
          newHoursPerDay: candidate,
          projectedEndDate: simulated.projectedEndDate,
        };
        break;
      }
    }
    options.push(
      volume ?? {
        ...shift,
        feasible: false,
        reason: `Capacité insuffisante même à ${String(maxHours)} h/jour.`,
        projectedEndDate: lastProjected,
      },
    );

    let light: ReplanOption | null = null;
    let lastLight: IsoDate = deadline.projectedEndDate;
    let lastRemoved = 0;
    const baseContent = contentMinutes(formation, input.params, 0);
    for (let step = 1; step <= 9; step += 1) {
      const ratio = step / 10;
      const simulation = computeOutcome(input, { lightenRatio: ratio });
      const simulated = simulation.deadlines.find(
        (entry) => entry.formationId === formation.formationId,
      );
      if (simulated === undefined) continue;
      lastLight = simulated.projectedEndDate;
      lastRemoved = Math.max(0, baseContent - contentMinutes(formation, input.params, ratio));
      if (!simulated.missed) {
        light = {
          ...shift,
          feasible: true,
          projectedEndDate: simulated.projectedEndDate,
          removedMinutes: lastRemoved,
        };
        break;
      }
    }
    options.push(
      light ?? {
        ...shift,
        feasible: false,
        reason: 'Même allégé de 90 %, le programme ne tient pas dans l’échéance.',
        projectedEndDate: lastLight,
        removedMinutes: lastRemoved,
      },
    );
  }
  return options;
}

/** Plans every active formation and returns slots, conflicts, capacity and BR-FOR-14 options. */
export function planSchedule(input: PlanScheduleInput): PlanResult {
  validateInput(input);
  const outcome = computeOutcome(input, {});
  const deadlines = outcome.deadlines;
  const options = buildOptions(input, outcome);
  const ordered = [...outcome.slots].sort(
    (left, right) =>
      parseInstant(left.startsAt) - parseInstant(right.startsAt) ||
      compareText(left.slotId, right.slotId),
  );
  return {
    slots: ordered,
    conflicts: outcome.conflicts,
    remainingCapacity: computeRemainingCapacity(input, ordered),
    options,
    deadlines,
    unscheduled: outcome.unscheduled,
  };
}
