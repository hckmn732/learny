// Read model of the course screen (SPEC-3302 EF-2 to EF-5, ET-1, ET-3; BR-COU-02 to BR-COU-11).
//
// Pure functions, free of React Native: the Jest screen tests, the Vitest unit tests and the Maestro
// flows read the same labels. The server owns every value (percentage, reading time, contribution
// count, version); this module only formats what the DTOs already contain (ADR-3002 § 1) and bounds
// the passage handed to the tutor (BR-TUT-01, ADR-3010 § 1).
import type {
  CourseCitation,
  CourseCitationSource,
  CourseSection,
  CourseView,
  ModuleCourseScreen,
} from '@learny/contracts';
import { fr } from '@learny/i18n';

import { civilDayMonth, formatIsoDay } from '../../lib/dates';

const t = fr.course;
const m = fr.mobile.cours;

/** Longest passage sent to the tutor: the bound of `BR-TUT-01`, applied on mobile (ADR-3010 § 1). */
export const PASSAGE_MAX_LENGTH = 1_000;

export interface ChapterLocation {
  /** Position of the selected chapter, 1-based (BR-COU-11). */
  readonly position: number;
  /** Number of chapters of the module. */
  readonly total: number;
}

/** « Chapitre 2 sur 4 » of the header, read from the chapters of the module (BR-NAV-04). */
export function chapterLocation(screen: ModuleCourseScreen): ChapterLocation {
  const chapterId = screen.course?.chapter.id ?? screen.selectedChapterId;
  const index = screen.chapters.findIndex((chapter) => chapter.id === chapterId);
  const selected = index >= 0 ? screen.chapters[index] : undefined;
  return {
    position: selected?.position ?? 1,
    total: Math.max(1, screen.chapters.length),
  };
}

/** Header badge of the chapter (BR-NAV-04, EF-1). */
export function chapterBadge(location: ChapterLocation): string {
  return m.header.badge(location.position, location.total);
}

/** `8 min de lecture · 4 apports · mis à jour le 9 novembre` (EF-2, BR-COU-11). */
export function courseMeta(course: CourseView, timeZone: string): string {
  const parts = [m.meta.reading(course.readingMinutes)];
  parts.push(
    course.baseCourse ? m.meta.base : m.meta.contributions(Math.max(0, course.resourceCount)),
  );
  if (typeof course.generatedAt === 'string' && course.generatedAt !== '') {
    parts.push(m.meta.updated(civilDayMonth(formatIsoDay(course.generatedAt, timeZone))));
  }
  return parts.join(' · ');
}

/** Label of one section in the summary sheet (BR-COU-11): its title, else what it holds. */
export function sectionLabel(section: CourseSection): string {
  if (section.title !== null && section.title !== '') return section.title;
  if (section.kind === 'retain') return t.takeaway;
  if (section.kind === 'flash_question') return t.quickQuestion.split(' · ')[0] ?? t.quickQuestion;
  if (section.kind === 'summary_prompt') return t.summaryTitle;
  if (section.kind === 'dont_confuse') return t.comparison;
  // Untitled prose section: its first words, without the Markdown marks, rather than the raw anchor.
  const words = plainText(section.contentMd ?? '')
    .split(/\s+/u)
    .filter((word) => word !== '')
    .slice(0, 7)
    .join(' ');
  if (words !== '') return words.length > 48 ? `${words.slice(0, 47).trimEnd()}…` : words;
  return section.kind === 'tutor_completed' ? (t.tutorCompleted.split(' · ')[0] ?? '') : '';
}

/** Plain text of a Markdown string: what the tutor receives, without markers (ADR-3010 § 1). */
export function plainText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*_>`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whole passage of a section, bounded to the contract length (BR-TUT-01, ADR-3010 § 1). */
export function passageText(section: CourseSection): string {
  const data = section.data ?? {};
  const parts = [plainText(section.contentMd ?? ''), section.title ?? ''];
  for (const side of ['left', 'right'] as const) {
    const value = data[side];
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const sideData = value as Record<string, unknown>;
      for (const key of ['title', 'body', 'example']) {
        const text = sideData[key];
        if (typeof text === 'string') parts.push(text);
      }
    }
  }
  return parts
    .filter((part) => part !== '')
    .join(' ')
    .slice(0, PASSAGE_MAX_LENGTH);
}

/** `3:05` - the minute of a quoted video or audio passage (EF-2, BR-COU-02). */
export function minuteLabel(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, '0')}`;
}

/** Label of a citation chip: the source and where it is quoted (BR-COU-02). */
export function citationLabel(citation: CourseCitation): string {
  if (citation.deleted) return `${citation.label} · ${t.citationDeleted}`;
  const location = citation.location ?? {};
  const page = typeof location.page === 'number' ? location.page : null;
  if (page !== null) return t.sourcePage(citation.label, page);
  const startSec = typeof location.startSec === 'number' ? location.startSec : null;
  if (startSec !== null) return t.sourceMinute(citation.label, minuteLabel(startSec));
  if (typeof location.anchor === 'string') return t.sourceAnchor(citation.label);
  if (citation.mediaKind === 'note') return t.sourceNote(citation.label);
  if (citation.mediaKind === 'image') return t.sourceImage(citation.label);
  return t.sourceWeb(citation.label);
}

/** Where the resolved source opens: a page, a minute or an anchor (CL-4, EF-2). */
export function sourceLocationLabel(source: CourseCitationSource): string {
  if (source.page !== null) return m.source.page(source.page);
  if (source.startSec !== null) return m.source.minute(minuteLabel(source.startSec));
  if (source.anchor !== null) return m.source.anchor;
  return '';
}

/** The summary prompt of the chapter, when the tutor asked for one (BR-COU-07, EF-4). */
export function summaryPrompt(sections: readonly CourseSection[]): CourseSection | null {
  return sections.find((section) => section.kind === 'summary_prompt') ?? null;
}

export interface SectionActions {
  /** « Demander au tuteur sur ce passage » - the native sheet arrives with SPEC-3303. */
  readonly askTutor: boolean;
  /** « Signaler une erreur » (BR-COU-09); offline, it is not offered (CL-1). */
  readonly report: boolean;
  /** « Corriger sur le web » (BR-COU-09, ADR-3002 § 3). */
  readonly editOnWeb: boolean;
}

/** Actions offered by the section menu (EF-5): the passage stays readable offline (CL-1). */
export function sectionActions(section: CourseSection, online: boolean): SectionActions {
  return {
    askTutor: true,
    report: online && !section.reported,
    editOnWeb: online,
  };
}

/** True when the section menu would only show its notice (EF-5, CL-1). */
export function hasSectionAction(actions: SectionActions): boolean {
  return actions.askTutor || actions.report || actions.editOnWeb;
}

/** Web page of the course of one chapter - the hand-off of the two destinations not yet native. */
export function courseWebHref(screen: ModuleCourseScreen, chapterId: string | null): string {
  const base = `/formations/${screen.formation.id}/modules/${screen.module.id}/cours`;
  return chapterId === null ? base : `${base}?chapitre=${chapterId}`;
}

/** Web page of the validation quiz of the module (BR-QUI-01, ADR-3002 § 3). */
export function quizWebHref(screen: ModuleCourseScreen): string {
  return `/formations/${screen.formation.id}/modules/${screen.module.id}/quiz`;
}

/** Whether the empty state speaks of a generation in progress or of a course never asked (EF-7). */
export type EmptyCourseReason = 'generating' | 'failed' | 'none';

export function emptyCourseReason(screen: ModuleCourseScreen): EmptyCourseReason {
  if (screen.generation.status === 'generating') return 'generating';
  if (screen.generation.status === 'failed') return 'failed';
  return 'none';
}
