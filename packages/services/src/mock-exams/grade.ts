// Pure grading of a mock exam (SPEC-614 EF-4, ET-5, BR-PRA-04, ADR-0028). The service corrects the
// answers with the code graders of SPEC-502 and passes the corrected rows here: no I/O, no clock,
// no AI. The studied score only counts the modules already studied; the diagnostic score of the
// unseen modules is reported separately and never lowers the studied score. Only failures of a
// studied module become gaps (BR-PRA-04).
import type { ExamModuleResult, ExamReviewRow } from '@learny/contracts';

export interface ExamGradedQuestion {
  position: number;
  brickVersionId: string;
  typeLabel: string;
  question: string;
  notionId: string;
  notionLabel: string;
  moduleId: string;
  modulePosition: number;
  moduleLabel: string;
  studied: boolean;
  isCorrect: boolean;
  /** Earned points on the question scale. */
  score: number;
  maxScore: number;
  given: string;
  expected: string | null;
  explanation: string | null;
}

export interface ExamModuleInfo {
  moduleId: string;
  position: number;
  label: string;
  studied: boolean;
}

export interface ExamScore {
  correct: number;
  total: number;
  score: number;
}

export interface ExamGradeSummary {
  score: number;
  passed: boolean;
  studied: ExamScore;
  diagnostic: ExamScore;
  modules: ExamModuleResult[];
  gaps: {
    notionId: string;
    notionLabel: string;
    moduleId: string;
    modulePosition: number;
    moduleLabel: string;
  }[];
  plan: string[];
  review: ExamReviewRow[];
}

export interface ExamGradeInput {
  questions: readonly ExamGradedQuestion[];
  modules: readonly ExamModuleInfo[];
  threshold: number;
}

function percent(correct: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((correct / total) * 100);
}

function scoreOf(questions: readonly ExamGradedQuestion[]): {
  correct: number;
  total: number;
  score: number;
} {
  const correct = questions.filter((question) => question.isCorrect).length;
  return { correct, total: questions.length, score: percent(correct, questions.length) };
}

/**
 * EF-4, ET-5 — separates the global score, the studied score and the diagnostic score, details
 * every module, keeps only studied failures as gaps and builds the review rows in exam order.
 * The review keeps the `brickVersionId` actually played, so a later version never rewrites it.
 */
export function gradeExam(input: ExamGradeInput): ExamGradeSummary {
  const ordered = [...input.questions].sort((left, right) => left.position - right.position);
  const studiedQuestions = ordered.filter((question) => question.studied);
  const diagnosticQuestions = ordered.filter((question) => !question.studied);
  const studied = scoreOf(studiedQuestions);
  const diagnostic = scoreOf(diagnosticQuestions);
  const global = scoreOf(ordered);

  const modules: ExamModuleResult[] = [...input.modules]
    .sort((left, right) => left.position - right.position)
    .map((module) => {
      const questions = ordered.filter((question) => question.moduleId === module.moduleId);
      const moduleScore = scoreOf(questions);
      return {
        moduleId: module.moduleId,
        position: module.position,
        label: module.label,
        studied: module.studied,
        correct: moduleScore.correct,
        total: moduleScore.total,
        score: moduleScore.score,
      };
    });

  const gaps: ExamGradeSummary['gaps'] = [];
  const seenGaps = new Set<string>();
  for (const question of ordered) {
    if (!question.studied || question.isCorrect) continue;
    if (seenGaps.has(question.notionId)) continue;
    seenGaps.add(question.notionId);
    gaps.push({
      notionId: question.notionId,
      notionLabel: question.notionLabel,
      moduleId: question.moduleId,
      modulePosition: question.modulePosition,
      moduleLabel: question.moduleLabel,
    });
  }

  const studiedPositions = input.modules
    .filter((module) => module.studied)
    .map((module) => module.position)
    .sort((left, right) => left - right);
  const studiedLabel =
    studiedPositions.length === 0
      ? 'vos modules étudiés'
      : studiedPositions.length === 1
        ? `le module ${String(studiedPositions[0])}`
        : `les modules ${String(studiedPositions[0])} à ${String(studiedPositions.at(-1))}`;
  const plan =
    gaps.length === 0
      ? [
          `Vos prochains quiz globaux entretiennent ${studiedLabel}.`,
          'Un sprint de révision sera proposé avant le prochain quiz de validation.',
        ]
      : [
          `${String(gaps.length)} notion${gaps.length > 1 ? 's' : ''} ajoutée${gaps.length > 1 ? 's' : ''} en priorité dans vos prochains quiz globaux.`,
          `Un sprint de révision sera proposé avant le prochain quiz de validation de ${studiedLabel}.`,
        ];
  if (diagnosticQuestions.length > 0) {
    plan.push(
      `Les modules diagnostiques seront travaillés dans l’ordre du programme, sans pénaliser ${studiedLabel}.`,
    );
  }

  return {
    score: global.score,
    passed: global.score >= input.threshold,
    studied,
    diagnostic,
    modules,
    gaps,
    plan,
    review: ordered.map((question) => ({
      position: question.position,
      brickVersionId: question.brickVersionId,
      typeLabel: question.typeLabel,
      question: question.question,
      notionLabel: question.notionLabel,
      modulePosition: question.modulePosition,
      moduleLabel: question.moduleLabel,
      studied: question.studied,
      isCorrect: question.isCorrect,
      given: question.given,
      expected: question.isCorrect ? null : question.expected,
      explanation: question.explanation,
    })),
  };
}
