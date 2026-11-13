// Controlled contract of the brick views (SPEC-503 EF-1). A view never calls the API: the screen
// owns the response, the status and the correction.
import type { BrickType } from './brick-types';
import type { CorrectionView, SelfGrade } from './correction-view';
import type { PublicPayload } from './payloads';
import type { ResourceExcerptLocation } from './types/resource-excerpt/schema';
import type { BrickViewLabelsOverride } from './view/labels';

export type BrickVariant = 'quiz' | 'game' | 'exam' | 'review' | 'course' | 'exercise';

export type BrickViewStatus = 'idle' | 'answered' | 'checking' | 'corrected' | 'locked';

export interface ChoiceQuestionResponse {
  optionIds: string[];
}

export interface ClozeResponse {
  gaps: Record<string, string>;
}

export interface MatchingResponse {
  pairs: Record<string, string | null>;
}

export interface OrderingResponse {
  order: string[];
}

export interface CategorizationResponse {
  assignments: Record<string, string | null>;
}

export interface RecallCardResponse {
  selfGrade: SelfGrade;
}

export interface OpenQuestionResponse {
  text: string;
}

export interface InstructionResponse {
  fields: Record<string, string>;
  rows: Record<string, string>[];
  text?: string;
  resourceId?: string;
  url?: string;
  explanation?: string;
}

export interface BrickResponseMap {
  text: null;
  resource_excerpt: null;
  choice_question: ChoiceQuestionResponse;
  open_question: OpenQuestionResponse;
  cloze: ClozeResponse;
  matching: MatchingResponse;
  ordering: OrderingResponse;
  categorization: CategorizationResponse;
  recall_card: RecallCardResponse;
  instruction: InstructionResponse;
  scripted_dialogue: null;
  timer: null;
  scoring: null;
}

export type BrickResponse<T extends BrickType> = BrickResponseMap[T];

export type ExcerptLocation = ResourceExcerptLocation;

export interface ExcerptOpenRef {
  resourceId: string;
  location: ExcerptLocation;
}

export interface BrickViewBrick<T extends BrickType> {
  versionId: string;
  type: T;
  notionLabels: string[];
  publicPayload: PublicPayload<T>;
}

export interface BrickViewProps<T extends BrickType> {
  brick: BrickViewBrick<T>;
  variant: BrickVariant;
  value: BrickResponse<T> | null;
  onChange?: (value: BrickResponse<T>) => void;
  status: BrickViewStatus;
  correction?: CorrectionView<T>;
  onExcerptOpen?: (ref: ExcerptOpenRef) => void;
  labelledBy?: string;
  /** Screen-level labels override (ET-1). */
  labels?: BrickViewLabelsOverride;
  /** Verification requested by an internal game button (CL-4). */
  onCheck?: () => void;
  /** Internal “Recommencer” of the game variants (EF-5). */
  onReset?: () => void;
  /** Due labels of the four self-assessment buttons (EF-8), supplied by the screen. */
  dueLabels?: Partial<Record<SelfGrade, string>>;
  /** Hints revealed by the screen (EF-10); the public payload only carries their count. */
  hints?: readonly string[];
  hintsUsed?: number;
  onHintRequest?: () => void;
  /** File production callback (EF-10); the view never uploads by itself. */
  onFileSelect?: (file: File | null) => void;
  /** Resources still available; a missing id renders « Source supprimée » (EF-12). */
  availableResourceIds?: readonly string[];
  /** Deterministic “now” for the timer; omitted in the browser, the injected clock ticks. */
  now?: Date;
  /** Timer start instant; optional for the exam screen (EF-13). */
  startedAt?: Date | string;
}
