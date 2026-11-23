// Read model of the Programme tab (SPEC-3202 EF-2 to EF-6, ET-3; BR-PRO-01, BR-FOR-05,
// BR-FOR-07, BR-FOR-08, BR-COU-08).
//
// Pure functions, free of React Native: the Jest screen tests, the Vitest unit tests and the
// Maestro flows read the same labels. The server decides every value (statuses, percentages,
// dates, unlock rule); this module only formats and orders what the DTOs already contain
// (ADR-3002 § 1: no business logic is duplicated on the client).
import type {
  ActiveProgrammeChapterDto,
  ActiveProgrammeModuleDto,
  CourseChapterSummary,
  ProgrammeCalendarEntryDto,
  ProgrammeModuleStatus,
  ProgrammeScreenStateDto,
} from '@learny/contracts';
import { fr } from '@learny/i18n';

import { weekdayOf } from '../../lib/dates';

const t = fr.mobile.programme;

/** Display state of one chapter of the open module (BR-FOR-07, BR-COU-08). */
export type ChapterDisplayState = 'validated' | 'current' | 'upcoming';

export interface ChapterView {
  readonly id: string;
  readonly position: number;
  readonly title: string;
  readonly state: ChapterDisplayState;
  /** « Validé », « 8 min » or null (a chapter that was never opened). */
  readonly meta: string | null;
  readonly courseHref: string;
  readonly accessibilityLabel: string;
}

export interface ModuleView {
  readonly id: string;
  readonly position: number;
  readonly title: string;
  readonly status: ProgrammeModuleStatus;
  readonly statusLabel: string;
  readonly meta: string;
  readonly locked: boolean;
  readonly unlockLabel: string | null;
  readonly quizOn: string;
  readonly quizKind: 'quiz' | 'exam';
  readonly quizLabel: string;
  readonly chapters: readonly ChapterView[];
  readonly expandedByDefault: boolean;
  readonly score: number | null;
}

export interface ResumeView {
  readonly moduleId: string;
  readonly chapterId: string;
  readonly chapterPosition: number;
  readonly label: string;
}

export interface ProgrammeFormationView {
  readonly id: string;
  readonly title: string;
  readonly status: ActiveProgrammeDtoStatus;
  readonly progressPercent: number;
  readonly modulePosition: number | null;
  readonly moduleCount: number;
  readonly dateRange: string;
  readonly paused: boolean;
  readonly completed: boolean;
}

type ActiveProgrammeDtoStatus = 'active' | 'paused' | 'completed';

export interface ProgrammeView {
  readonly formation: ProgrammeFormationView;
  readonly modules: readonly ModuleView[];
  readonly resume: ResumeView | null;
}

/** Reading progress of one chapter, as read on `GET /modules/:mid/course` (BR-COU-08). */
export interface CourseProgressInput {
  readonly chapters: readonly CourseChapterSummary[];
  /** Course view selected by the server (reading time of this chapter only). */
  readonly selectedChapterId: string;
  /** Estimated reading time of the selected chapter, in minutes (BR-COU-11). */
  readonly readingMinutes: number;
}

const SHORT_MONTHS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDay(day: string): number {
  const [year, month, date] = day.split('-').map((part) => Number(part));
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1);
}

function isoDay(instant: number): string {
  return new Date(instant).toISOString().slice(0, 10);
}

function dayNumber(day: string): number {
  return Number(day.slice(8, 10));
}

/** « 2 nov. » — the short civil day of the mockups, never the device zone (BR-ACC-07). */
export function formatDayMonth(day: string): string {
  const month = SHORT_MONTHS[Number(day.slice(5, 7)) - 1] ?? '';
  return `${String(dayNumber(day))} ${month}`;
}

/** « 2 nov. – 11 déc. » — the date range of the formation card (EF-2). */
export function formatRange(start: string | null, end: string | null): string {
  if (start === null || end === null) return '';
  return `${formatDayMonth(start)} – ${formatDayMonth(end)}`;
}

/** « 2 – 8 nov. » or « 30 nov. – 6 déc. » — the label of one calendar week (EF-6). */
export function formatWeekRange(start: string, end: string): string {
  if (start.slice(5, 7) === end.slice(5, 7)) {
    return `${String(dayNumber(start))} – ${String(dayNumber(end))} ${SHORT_MONTHS[Number(end.slice(5, 7)) - 1] ?? ''}`;
  }
  return `${formatDayMonth(start)} – ${formatDayMonth(end)}`;
}

function scoreLabel(score: number | null): number | null {
  return score === null ? null : Math.round(score);
}

/** Status label of a module (BR-FOR-07): « Validé · 91 % », « En cours », « Verrouillé ». */
export function moduleStatusLabel(module: ActiveProgrammeModuleDto): string {
  if (module.status === 'validated') {
    const score = scoreLabel(module.score);
    return score === null
      ? t.module.status.validated
      : `${t.module.status.validated} · ${String(score)} %`;
  }
  return t.module.status[module.status];
}

/** Sub-title of a module card (BR-FOR-05, BR-FOR-08). */
export function moduleMeta(module: ActiveProgrammeModuleDto, chapterCount: number): string {
  if (module.status === 'locked') {
    return t.module.lockedMeta(chapterCount, module.unlockAfterPosition ?? module.position - 1);
  }
  if (module.status === 'validated') {
    return t.module.validatedMeta(chapterCount, scoreLabel(module.score));
  }
  return t.module.openMeta(chapterCount, module.threshold);
}

/**
 * Remaining reading time of a chapter (BR-COU-08): the server gives the total reading time of
 * the selected chapter and its persisted percentage; the remaining minutes are a display rule.
 */
export function remainingMinutes(percent: number, readingMinutes: number): number {
  const remaining = Math.ceil((readingMinutes * (100 - Math.min(100, Math.max(0, percent)))) / 100);
  return Math.max(1, remaining);
}

function progressOf(
  input: CourseProgressInput | null | undefined,
  chapterId: string,
): number | null {
  if (input === null || input === undefined) return null;
  const entry = input.chapters.find((chapter) => chapter.id === chapterId);
  return entry === undefined ? null : entry.percent;
}

/** State and meta of one chapter of the open module (EF-4, BR-COU-08). */
export function chapterView(
  module: ActiveProgrammeModuleDto,
  chapter: ActiveProgrammeChapterDto,
  progress?: CourseProgressInput | null,
): ChapterView {
  const percent = progressOf(progress, chapter.id);
  let state: ChapterDisplayState;
  let meta: string | null;
  if (module.status === 'validated') {
    state = 'validated';
    meta = t.chapter.validated;
  } else if (percent === null) {
    // No reading data yet: only the first chapter of an open module is announced as current.
    state = chapter.position === 1 ? 'current' : 'upcoming';
    meta = chapter.position === 1 ? t.chapter.current : null;
  } else if (percent >= 100) {
    state = 'validated';
    meta = t.chapter.validated;
  } else if (percent > 0) {
    state = 'current';
    meta =
      progress !== null && progress !== undefined && progress.selectedChapterId === chapter.id
        ? t.chapter.minutes(remainingMinutes(percent, progress.readingMinutes))
        : t.chapter.current;
  } else {
    state = 'upcoming';
    meta = null;
  }
  return {
    id: chapter.id,
    position: chapter.position,
    title: chapter.title,
    state,
    meta,
    courseHref: chapter.courseHref,
    accessibilityLabel: `${chapter.title}, ${meta ?? t.chapter.upcoming}`,
  };
}

/** The chapter « Reprendre » must open (EF-4, CA-2): the chapter in progress, else the next one. */
export function resumeChapter(
  module: ActiveProgrammeModuleDto,
  chapters: readonly ChapterView[],
): ChapterView | null {
  if (module.status !== 'open') return null;
  const current = chapters.find((chapter) => chapter.state === 'current');
  if (current !== undefined) return current;
  const upcoming = chapters.find((chapter) => chapter.state === 'upcoming');
  if (upcoming !== undefined) return upcoming;
  return chapters.at(-1) ?? null;
}

export interface BuildProgrammeInput {
  readonly programme: Extract<ProgrammeScreenStateDto, { formation: unknown }>;
  readonly course?: CourseProgressInput | null;
}

/** Whole read model of the Modules view (EF-4). */
export function buildProgrammeView(input: BuildProgrammeInput): ProgrammeView {
  const { programme } = input;
  const chaptersByModule = new Map<string, ActiveProgrammeChapterDto[]>();
  for (const chapter of programme.chapters) {
    const list = chaptersByModule.get(chapter.moduleId) ?? [];
    list.push(chapter);
    chaptersByModule.set(chapter.moduleId, list);
  }

  const openModule = programme.modules.find((module) => module.status === 'open') ?? null;
  const modules: ModuleView[] = programme.modules.map((module) => {
    const chapters = (chaptersByModule.get(module.id) ?? [])
      .slice()
      .sort((left, right) => left.position - right.position)
      .map((chapter) =>
        chapterView(module, chapter, module.id === openModule?.id ? input.course : null),
      );
    return {
      id: module.id,
      position: module.position,
      title: module.title,
      status: module.status,
      statusLabel: moduleStatusLabel(module),
      meta: moduleMeta(module, chapters.length),
      locked: module.status === 'locked',
      unlockLabel:
        module.status === 'locked'
          ? t.module.unlock(module.unlockAfterPosition ?? Math.max(1, module.position - 1))
          : null,
      quizOn: module.quizOn,
      quizKind: module.quizKind,
      quizLabel: module.quizKind === 'exam' ? t.module.exam : t.module.quiz,
      chapters,
      expandedByDefault: module.status === 'open',
      score: scoreLabel(module.score),
    };
  });

  const openView =
    openModule === null ? null : (modules.find((m) => m.id === openModule.id) ?? null);
  const resumeChapterView =
    openModule === null || openView === null ? null : resumeChapter(openModule, openView.chapters);
  const resume: ResumeView | null =
    resumeChapterView === null || openModule === null
      ? null
      : {
          moduleId: openModule.id,
          chapterId: resumeChapterView.id,
          chapterPosition: resumeChapterView.position,
          label: t.resume(resumeChapterView.position),
        };

  const status = programme.formation.status;
  return {
    formation: {
      id: programme.formation.id,
      title: programme.formation.title,
      status,
      progressPercent: programme.indicators.progress.percent,
      modulePosition: openModule?.position ?? null,
      moduleCount: programme.modules.length,
      dateRange: formatRange(programme.formation.startDate, programme.formation.endDate),
      paused: status === 'paused',
      completed: status === 'completed',
    },
    modules,
    resume,
  };
}

/** One week of the Modules / Calendrier view (EF-6). */
export interface CalendarWeek {
  readonly key: string;
  readonly start: string;
  readonly end: string;
  readonly label: string;
  readonly current: boolean;
  readonly modules: readonly ProgrammeCalendarEntryDto[];
  readonly sessions: readonly string[];
}

/** Monday of the week containing `day`, as a civil day. */
export function mondayOf(day: string): string {
  const offset = (weekdayOf(day) + 6) % 7;
  return isoDay(parseDay(day) - offset * DAY_MS);
}

/**
 * Weekly timeline of the programme (EF-6): one row per week between the first start and the
 * last end, the week of `today` marked, the modules overlapping the week and the quiz days.
 */
export function calendarWeeks(
  calendar: readonly ProgrammeCalendarEntryDto[],
  today: string,
): readonly CalendarWeek[] {
  if (calendar.length === 0) return [];
  const starts = calendar.map((entry) => parseDay(entry.start));
  const ends = calendar.map((entry) => parseDay(entry.end));
  const first = mondayOf(isoDay(Math.min(...starts)));
  const lastDay = Math.max(...ends);
  const weeks: CalendarWeek[] = [];
  let cursor = parseDay(first);
  while (cursor <= lastDay) {
    const start = isoDay(cursor);
    const end = isoDay(cursor + 6 * DAY_MS);
    const modules = calendar.filter((entry) => entry.start <= end && entry.end >= start);
    const sessions = modules
      .map((entry) => entry.quizOn)
      .filter((day) => day >= start && day <= end);
    weeks.push({
      key: start,
      start,
      end,
      label: formatWeekRange(start, end),
      current: today >= start && today <= end,
      modules,
      sessions,
    });
    cursor += 7 * DAY_MS;
  }
  return weeks;
}

/** One day cell of the month grid of the Calendrier view (EF-6, `ios-programme-calendrier.png`). */
export interface CalendarDay {
  readonly day: string;
  readonly number: number;
  readonly inFormation: boolean;
  readonly today: boolean;
  readonly session: boolean;
}

/** Weeks of day cells covering the whole programme, Monday first (EF-6). */
export function calendarGrid(
  calendar: readonly ProgrammeCalendarEntryDto[],
  today: string,
): readonly (readonly CalendarDay[])[] {
  if (calendar.length === 0) return [];
  const starts = calendar.map((entry) => parseDay(entry.start));
  const ends = calendar.map((entry) => parseDay(entry.end));
  const first = parseDay(mondayOf(isoDay(Math.min(...starts))));
  const last = Math.max(...ends);
  const sessionDays = new Set(calendar.map((entry) => entry.quizOn));
  const formationStart = isoDay(Math.min(...starts));
  const formationEnd = isoDay(last);
  const rows: CalendarDay[][] = [];
  let cursor = first;
  while (cursor <= last) {
    const row: CalendarDay[] = [];
    for (let index = 0; index < 7; index += 1) {
      const day = isoDay(cursor + index * DAY_MS);
      row.push({
        day,
        number: dayNumber(day),
        inFormation: day >= formationStart && day <= formationEnd,
        today: day === today,
        session: sessionDays.has(day),
      });
    }
    rows.push(row);
    cursor += 7 * DAY_MS;
  }
  return rows;
}
