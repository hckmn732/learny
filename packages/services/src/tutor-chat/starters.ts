import type { CourseStarter } from '@learny/contracts';

// SPEC-610 EF-2 — the three starter questions of the tutor card are computed without AI from the
// selected chapter. The primary notion is the most cited one in `course_sections.notion_ids`;
// ties choose the weakest notion of the chapter (the followed gap when one exists) so the card
// opens on what the learner needs most. The label is used as provided, without automatic agreement.

export interface StarterSection {
  kind: string;
  contentMd: string | null;
  data?: Record<string, unknown> | null;
  notionIds: readonly string[];
}

export interface StarterNotion {
  id: string;
  label: string;
  mastery?: number;
}

export interface StarterInput {
  sections: readonly StarterSection[];
  notions: readonly StarterNotion[];
  gapNotionId?: string | null;
}

export interface ConfusionPairLabels {
  left: string;
  right: string;
}

function lowerInitial(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function objectText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export function confusionOf(sections: readonly StarterSection[]): ConfusionPairLabels | null {
  for (const section of sections) {
    if (section.kind !== 'dont_confuse' || section.data === null || section.data === undefined)
      continue;
    const left = section.data.left;
    const right = section.data.right;
    const leftTitle =
      left !== null && typeof left === 'object'
        ? objectText((left as Record<string, unknown>).title)
        : null;
    const rightTitle =
      right !== null && typeof right === 'object'
        ? objectText((right as Record<string, unknown>).title)
        : null;
    if (leftTitle !== null && rightTitle !== null) return { left: leftTitle, right: rightTitle };
  }
  return null;
}

function shortLeft(label: string): string {
  return label.split(/\s+de\s+/i)[0]?.trim() ?? label;
}

export function startersOf(input: StarterInput): CourseStarter[] {
  const counts = new Map<string, number>();
  for (const section of input.sections) {
    for (const id of section.notionIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const max = Math.max(0, ...counts.values());
  const tied = input.notions.filter((notion) => (counts.get(notion.id) ?? 0) === max);
  const primary =
    tied.find((notion) => notion.id === input.gapNotionId) ??
    tied.sort((left, right) => (left.mastery ?? 101) - (right.mastery ?? 101))[0] ??
    input.notions[0];

  const hasNumber = input.sections.some(
    (section) =>
      /\d/.test(section.contentMd ?? '') || /\d/.test(JSON.stringify(section.data ?? {})),
  );
  const confusion = confusionOf(input.sections);

  const starters: CourseStarter[] = [];
  if (primary !== undefined) {
    const label = `Explique-moi les ${lowerInitial(primary.label)} autrement`;
    starters.push({ label, prompt: label });
  }
  const example = hasNumber ? 'Donne-moi un exemple chiffré' : 'Donne-moi un exemple concret';
  starters.push({ label: example, prompt: example });
  if (confusion !== null) {
    const left = shortLeft(confusion.left);
    const right = confusion.right;
    const label = `${left} ou ${right.charAt(0).toLowerCase()}${right.slice(1)} : quelle différence ?`;
    starters.push({ label, prompt: label });
  }
  return starters.slice(0, 3);
}

/** A question pair usable by ET-6 when only the section payload is known. */
export function confusionPairOf(sections: readonly StarterSection[]): ConfusionPairLabels | null {
  return confusionOf(sections);
}
