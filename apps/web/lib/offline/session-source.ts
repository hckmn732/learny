// Data-source seam of the quiz screen (SPEC-801 ET-9). The online screen reads the API; the
// offline screen reads the pack and grades locally with the same brick code. The interface keeps
// the two modes interchangeable without changing the shared presentational components.
import type {
  GlobalQuizSessionDto,
  ReviewAnswerInput,
  ReviewAnswerResultDto,
  ReviewSummaryDto,
} from '@learny/contracts';

export interface SessionSource {
  mode: 'online' | 'offline';
  load: () => Promise<GlobalQuizSessionDto>;
  answer: (input: ReviewAnswerInput) => Promise<ReviewAnswerResultDto>;
  complete: () => Promise<ReviewSummaryDto>;
}
