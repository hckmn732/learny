// Static registry of the committed fixtures. JSON imports keep the fixtures available in the Next
// server bundle without reading the filesystem at runtime (SPEC-504 ET-6, ADR-0153).
import courseBase from '../../fixtures/course/course-base.json' with { type: 'json' };
import courseInvalid from '../../fixtures/course/course-invalid.json' with { type: 'json' };
import courseSourced from '../../fixtures/course/course-sourced.json' with { type: 'json' };
import remediationPlanSapM3 from '../../fixtures/gaps/remediation-plan-sap-m3.json' with { type: 'json' };
import courseSummary from '../../fixtures/light/course-summary.json' with { type: 'json' };
import lightInvalidObject from '../../fixtures/light/demo-invalid-object.json' with { type: 'json' };
import lightObject from '../../fixtures/light/demo-object.json' with { type: 'json' };
import lightSpec510Image from '../../fixtures/light/spec-510-image.json' with { type: 'json' };
import programmeAdjust from '../../fixtures/programme/programme-adjust.json' with { type: 'json' };
import programmeImport from '../../fixtures/programme/programme-import.json' with { type: 'json' };
import programmeInvalid from '../../fixtures/programme/programme-invalid.json' with { type: 'json' };
import programmeSap from '../../fixtures/programme/programme-sap.json' with { type: 'json' };
import cadrageInjection from '../../fixtures/tutor/cadrage-injection.json' with { type: 'json' };
import cadrageInvalid from '../../fixtures/tutor/cadrage-invalid.json' with { type: 'json' };
import cadrageSapDone from '../../fixtures/tutor/cadrage-sap-done.json' with { type: 'json' };
import cadrageSapQ1 from '../../fixtures/tutor/cadrage-sap-q1.json' with { type: 'json' };
import cadrageSapQ2 from '../../fixtures/tutor/cadrage-sap-q2.json' with { type: 'json' };
import cadrageSapQ3 from '../../fixtures/tutor/cadrage-sap-q3.json' with { type: 'json' };
import cadrageSapQ4 from '../../fixtures/tutor/cadrage-sap-q4.json' with { type: 'json' };
import cadrageSapQ5 from '../../fixtures/tutor/cadrage-sap-q5.json' with { type: 'json' };
import cadrageSixthQuestion from '../../fixtures/tutor/cadrage-sixth-question.json' with { type: 'json' };
import chatAutrement from '../../fixtures/tutor/chat-autrement.json' with { type: 'json' };
import chatDates from '../../fixtures/tutor/chat-dates.json' with { type: 'json' };
import chatDifference from '../../fixtures/tutor/chat-difference.json' with { type: 'json' };
import chatEquilibre from '../../fixtures/tutor/chat-equilibre.json' with { type: 'json' };
import chatExemple from '../../fixtures/tutor/chat-exemple.json' with { type: 'json' };
import chatGapFirst from '../../fixtures/tutor/chat-gap-first-question.json' with { type: 'json' };
import chatGeneric from '../../fixtures/tutor/chat-generic.json' with { type: 'json' };
import chatInjection from '../../fixtures/tutor/chat-injection.json' with { type: 'json' };
import chatSelection from '../../fixtures/tutor/chat-selection.json' with { type: 'json' };
import tutorRefusal from '../../fixtures/tutor/demo-refusal.json' with { type: 'json' };
import tutorStream from '../../fixtures/tutor/demo-stream.json' with { type: 'json' };
import tutorTimeout from '../../fixtures/tutor/demo-timeout.json' with { type: 'json' };
import tutorToolCall from '../../fixtures/tutor/demo-tool-call.json' with { type: 'json' };
import tutorDefault from '../../fixtures/tutor/demo.default.json' with { type: 'json' };
import gradeOpenGood from '../../fixtures/tutor/grade-open-good.json' with { type: 'json' };
import gradeOpenOfftopic from '../../fixtures/tutor/grade-open-offtopic.json' with { type: 'json' };
import gradeOpenPartial from '../../fixtures/tutor/grade-open-partial.json' with { type: 'json' };
import tutorLoopCompleted from '../../fixtures/tutor/loop-completed.json' with { type: 'json' };
import tutorLoopToneTuEn from '../../fixtures/tutor/loop-tone-tu-en.json' with { type: 'json' };
import tutorQuestionBankRegeneration from '../../fixtures/tutor/question-bank-regeneration.json' with { type: 'json' };
import tutorQuestionBank from '../../fixtures/tutor/question-bank.json' with { type: 'json' };
import selfTestGradeKo from '../../fixtures/tutor/self-test-grade-ko.json' with { type: 'json' };
import selfTestGradeOk from '../../fixtures/tutor/self-test-grade-ok.json' with { type: 'json' };
import selfTestQ1 from '../../fixtures/tutor/self-test-q1.json' with { type: 'json' };
import selfTestQ2 from '../../fixtures/tutor/self-test-q2.json' with { type: 'json' };

import { parseFixture, type FixtureFile } from './fixture-schema';

export interface RegisteredFixture {
  /** Repository path relative to `packages/llm/fixtures`, used by the selection order. */
  readonly path: string;
  readonly fixture: FixtureFile;
}

function entry(path: string, value: unknown): RegisteredFixture {
  return { path, fixture: parseFixture(value, path) };
}

/** Every fixture of the repository, sorted by path (ADR-0153 §2c). */
export const FIXTURE_REGISTRY: readonly RegisteredFixture[] = [
  entry('course/course-base.json', courseBase),
  entry('course/course-invalid.json', courseInvalid),
  entry('course/course-sourced.json', courseSourced),
  entry('gaps/remediation-plan-sap-m3.json', remediationPlanSapM3),
  entry('light/course-summary.json', courseSummary),
  entry('light/demo-invalid-object.json', lightInvalidObject),
  entry('light/demo-object.json', lightObject),
  entry('light/spec-510-image.json', lightSpec510Image),
  entry('programme/programme-adjust.json', programmeAdjust),
  entry('programme/programme-import.json', programmeImport),
  entry('programme/programme-invalid.json', programmeInvalid),
  entry('programme/programme-sap.json', programmeSap),
  entry('tutor/demo-tool-call.json', tutorToolCall),
  entry('tutor/demo-refusal.json', tutorRefusal),
  entry('tutor/demo-stream.json', tutorStream),
  entry('tutor/demo-timeout.json', tutorTimeout),
  entry('tutor/demo.default.json', tutorDefault),
  entry('tutor/loop-completed.json', tutorLoopCompleted),
  entry('tutor/loop-tone-tu-en.json', tutorLoopToneTuEn),
  entry('tutor/grade-open-good.json', gradeOpenGood),
  entry('tutor/grade-open-partial.json', gradeOpenPartial),
  entry('tutor/grade-open-offtopic.json', gradeOpenOfftopic),
  entry('tutor/question-bank.json', tutorQuestionBank),
  entry('tutor/question-bank-regeneration.json', tutorQuestionBankRegeneration),
  entry('tutor/cadrage-sap-q1.json', cadrageSapQ1),
  entry('tutor/cadrage-sap-q2.json', cadrageSapQ2),
  entry('tutor/cadrage-sap-q3.json', cadrageSapQ3),
  entry('tutor/cadrage-sap-q4.json', cadrageSapQ4),
  entry('tutor/cadrage-sap-q5.json', cadrageSapQ5),
  entry('tutor/cadrage-sap-done.json', cadrageSapDone),
  entry('tutor/cadrage-sixth-question.json', cadrageSixthQuestion),
  entry('tutor/cadrage-invalid.json', cadrageInvalid),
  entry('tutor/cadrage-injection.json', cadrageInjection),
  entry('tutor/chat-autrement.json', chatAutrement),
  entry('tutor/chat-dates.json', chatDates),
  entry('tutor/chat-difference.json', chatDifference),
  entry('tutor/chat-equilibre.json', chatEquilibre),
  entry('tutor/chat-exemple.json', chatExemple),
  entry('tutor/chat-gap-first-question.json', chatGapFirst),
  entry('tutor/chat-generic.json', chatGeneric),
  entry('tutor/chat-injection.json', chatInjection),
  entry('tutor/chat-selection.json', chatSelection),
  entry('tutor/self-test-grade-ko.json', selfTestGradeKo),
  entry('tutor/self-test-grade-ok.json', selfTestGradeOk),
  entry('tutor/self-test-q1.json', selfTestQ1),
  entry('tutor/self-test-q2.json', selfTestQ2),
].sort((left, right) => left.path.localeCompare(right.path));

export function fixturesForTask(task: string): readonly RegisteredFixture[] {
  return FIXTURE_REGISTRY.filter((candidate) => candidate.fixture.task === task);
}
