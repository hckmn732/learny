// Fingerprint of the seven question types (BR-BRI-07, ADR-0151): SHA-256 of the normalized stem,
// a unit separator and the normalized canonical answer. Non-question bricks have no fingerprint.
import type { BrickType } from './brick-types';
import { normalizeText } from './normalize';
import { sha256Hex } from './sha256';
import type { CategorizationPayload } from './types/categorization/schema';
import type { ChoiceQuestionPayload } from './types/choice-question/schema';
import type { ClozePayload } from './types/cloze/schema';
import type { MatchingPayload } from './types/matching/schema';
import type { OpenQuestionPayload } from './types/open-question/schema';
import type { OrderingPayload } from './types/ordering/schema';
import type { RecallCardPayload } from './types/recall-card/schema';

const SEPARATOR = '\u241F';

function sorted(values: readonly string[]): string {
  return [...values].sort().join('|');
}

/** Canonical answer of a question type, or null for a non-question brick (ET-6). */
export function canonicalAnswer(type: BrickType, payload: unknown): string | null {
  switch (type) {
    case 'choice_question': {
      const choice = payload as ChoiceQuestionPayload;
      return sorted(
        choice.options
          .filter((option) => option.correct)
          .map((option) => normalizeText(option.text)),
      );
    }
    case 'open_question': {
      const open = payload as OpenQuestionPayload;
      return sorted(open.expectedElements.map((element) => normalizeText(element)));
    }
    case 'cloze': {
      const cloze = payload as ClozePayload;
      return [...cloze.gaps]
        .sort((left, right) => left.id - right.id)
        .map((gap) => normalizeText(gap.answers[0] ?? ''))
        .join('|');
    }
    case 'matching': {
      const matching = payload as MatchingPayload;
      return sorted(
        matching.pairs.map((pair) => `${normalizeText(pair.left)}=>${normalizeText(pair.right)}`),
      );
    }
    case 'ordering': {
      const ordering = payload as OrderingPayload;
      return ordering.items.map((item) => normalizeText(item.text)).join('|');
    }
    case 'categorization': {
      const categorization = payload as CategorizationPayload;
      const labels = new Map(
        categorization.categories.map((category) => [category.id, normalizeText(category.label)]),
      );
      return sorted(
        categorization.items.map(
          (item) => `${normalizeText(item.text)}=>${labels.get(item.categoryId) ?? ''}`,
        ),
      );
    }
    case 'recall_card': {
      return normalizeText((payload as RecallCardPayload).back);
    }
    default:
      return null;
  }
}

/** Normalized stem of a question type, or null for a non-question brick (ET-6). */
export function stemText(type: BrickType, payload: unknown): string | null {
  switch (type) {
    case 'choice_question':
      return normalizeText((payload as ChoiceQuestionPayload).stem);
    case 'open_question':
      return normalizeText((payload as OpenQuestionPayload).stem);
    case 'cloze':
      return normalizeText((payload as ClozePayload).template);
    case 'matching': {
      const matching = payload as MatchingPayload;
      return `${normalizeText(matching.instruction)}|${sorted(
        matching.pairs.map((pair) => normalizeText(pair.left)),
      )}`;
    }
    case 'ordering': {
      const ordering = payload as OrderingPayload;
      return `${normalizeText(ordering.instruction)}|${sorted(
        ordering.items.map((item) => normalizeText(item.text)),
      )}`;
    }
    case 'categorization': {
      const categorization = payload as CategorizationPayload;
      return `${normalizeText(categorization.instruction)}|${sorted(
        categorization.items.map((item) => normalizeText(item.text)),
      )}`;
    }
    case 'recall_card':
      return normalizeText((payload as RecallCardPayload).front);
    default:
      return null;
  }
}

/** Lower-case hexadecimal SHA-256 of a question, or null for a non-question brick. */
export function brickFingerprint(type: BrickType, payload: unknown): string | null {
  const stem = stemText(type, payload);
  const answer = canonicalAnswer(type, payload);
  if (stem === null || answer === null) return null;
  return sha256Hex(`${stem}${SEPARATOR}${answer}`);
}
