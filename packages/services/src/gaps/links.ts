import { RECOMMENDED_ACTION_BY_NATURE, type GapNature } from '@learny/learning-engine';

// Link derivation of the gap cards (SPEC-615 EF-3, ET-4, ET-5; BR-LAC-04).
//
// The target never comes from free text: the stored nature selects the remediation family of the
// learning engine and the URL, and a course link only exists when a live section can anchor the
// notion. A deleted course therefore hides the action instead of exposing a broken `#anchor`.

export type GapTrainingKind = 'quiz' | 'exercise';

export interface GapTrainingLink {
  kind: GapTrainingKind;
  href: string;
}

export interface GapTrainingInput {
  formationId: string;
  moduleId: string;
  notionId: string;
  nature: GapNature;
}

/** BR-LAC-04 — forgetting, confusion and misunderstanding open the targeted global quiz. */
export function trainingTarget(input: GapTrainingInput): GapTrainingLink {
  const { formationId, moduleId, notionId, nature } = input;
  const action = RECOMMENDED_ACTION_BY_NATURE[nature];
  if (action === 'practice_exercise') {
    return {
      kind: 'exercise',
      href: `/formations/${encodeURIComponent(formationId)}/modules/${encodeURIComponent(
        moduleId,
      )}/exercices?notion=${encodeURIComponent(notionId)}`,
    };
  }
  return {
    kind: 'quiz',
    href: `/formations/${encodeURIComponent(
      formationId,
    )}/quiz-global?cible=${encodeURIComponent(notionId)}`,
  };
}

export interface CourseSectionRef {
  sectionId: string;
  anchor: string;
}

export interface GapCourseLink {
  sectionId: string;
  anchor: string;
  href: string;
}

export interface CourseTargetInput {
  formationId: string;
  moduleId: string;
  chapterId: string;
  section: CourseSectionRef | null;
}

/**
 * ET-5 — the course action points to the exact section of the module, with the chapter as a query
 * parameter so the reading page can open the right table of contents. A missing or blank anchor
 * means no live section: the card must not render a broken link.
 */
export function courseTarget(input: CourseTargetInput): GapCourseLink | null {
  const anchor = input.section?.anchor.trim() ?? '';
  if (input.section === null || anchor === '') return null;
  const href = `/formations/${encodeURIComponent(input.formationId)}/modules/${encodeURIComponent(
    input.moduleId,
  )}/cours?chapitre=${encodeURIComponent(input.chapterId)}#${encodeURIComponent(anchor)}`;
  return { sectionId: input.section.sectionId, anchor, href };
}
