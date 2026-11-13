import type { TutorProfile } from '@learny/contracts';
import type { StepInput, SystemPart } from '@learny/llm';

import { PROMPT_SOURCES } from '../prompts.generated';

// Versioned instructions of the contextual discussion (SPEC-610 ET-4, ADR-0072, ADR-0178).
// The English Markdown headers stay the source of truth; the code only substitutes the learner
// profile and appends the included context keys. A prompt change bumps its `version:` header and
// the fixtures that assert it.

export const TUTOR_CHAT_PROMPT_ID = 'tutor-chat.tutor-chat';
export const SELF_TEST_QUESTION_PROMPT_ID = 'self-test-question.self-test-question';
export const SELF_TEST_GRADE_PROMPT_ID = 'self-test-grade.self-test-grade';

export interface ChatPromptInput {
  profile: TutorProfile;
  includedKeys: readonly string[];
  /** Escaped `<context>` block, already built by the service. */
  contextBlock: string;
  history: readonly { role: 'learner' | 'tutor'; content: string }[];
  message: string;
  /** BR-TUT-05 — one checking question first when the gap is included. */
  gapFirst: boolean;
}

export interface BuiltChatPrompt {
  id: string;
  version: number;
  system: SystemPart[];
  messages: StepInput['messages'];
}

function render(
  key: 'tutor-chat' | 'self-test-question' | 'self-test-grade',
  profile: TutorProfile,
): string {
  return PROMPT_SOURCES[key].content
    .replaceAll('{{tone}}', profile.tone)
    .replaceAll('{{courseLanguage}}', profile.courseLanguage)
    .replaceAll('{{course_language}}', profile.courseLanguage);
}

function profileLine(profile: TutorProfile): string {
  return [
    `Learner profile (fixed): tone=${profile.tone}, courseLanguage=${profile.courseLanguage}.`,
    'Fixed interface labels stay in French.',
  ].join('\n');
}

/** ET-4 — the `<context>` block is data, never an instruction; only included keys reach it. */
export function buildTutorChatPrompt(input: ChatPromptInput): BuiltChatPrompt {
  const source = PROMPT_SOURCES['tutor-chat'];
  const guidance = [
    `Included context keys: ${input.includedKeys.length === 0 ? '(none)' : input.includedKeys.join(', ')}.`,
    input.gapFirst
      ? 'The followed gap is included and the question concerns it: ask one short checking question first and end the answer with it.'
      : '',
    'The current learner question is inside <learner-message>; the context is inside <context>.',
  ]
    .filter((line) => line !== '')
    .join('\n');
  const messages: StepInput['messages'] = input.history.map((entry) => ({
    role: entry.role === 'learner' ? 'user' : 'assistant',
    content: entry.content,
  }));
  messages.push({
    role: 'user',
    content: `${input.contextBlock}\n<learner-message>${input.message}</learner-message>`,
  });
  return {
    id: TUTOR_CHAT_PROMPT_ID,
    version: source.version,
    system: [
      { text: render('tutor-chat', input.profile), cache: true },
      { text: `${profileLine(input.profile)}\n${guidance}`, cache: false },
    ],
    messages,
  };
}

export function buildSelfTestQuestionPrompt(input: {
  profile: TutorProfile;
  notionLabel: string;
  context: string;
}): BuiltChatPrompt {
  const source = PROMPT_SOURCES['self-test-question'];
  return {
    id: SELF_TEST_QUESTION_PROMPT_ID,
    version: source.version,
    system: [
      { text: render('self-test-question', input.profile), cache: true },
      { text: profileLine(input.profile), cache: false },
    ],
    messages: [
      {
        role: 'user',
        content: `<notion>${input.notionLabel}</notion>\n<context>${input.context}</context>`,
      },
    ],
  };
}

export function buildSelfTestGradePrompt(input: {
  profile: TutorProfile;
  question: string;
  expected: readonly string[];
  answer: string;
}): BuiltChatPrompt {
  const source = PROMPT_SOURCES['self-test-grade'];
  return {
    id: SELF_TEST_GRADE_PROMPT_ID,
    version: source.version,
    system: [
      { text: render('self-test-grade', input.profile), cache: true },
      { text: profileLine(input.profile), cache: false },
    ],
    messages: [
      {
        role: 'user',
        content: [
          `<question>${input.question}</question>`,
          `<expected>${input.expected.join(' | ')}</expected>`,
          `<answer>${input.answer}</answer>`,
        ].join('\n'),
      },
    ],
  };
}

/** Versions exported for the fixtures test and the course demonstration. */
export const TUTOR_CHAT_PROMPT_VERSIONS = {
  chat: PROMPT_SOURCES['tutor-chat'].version,
  question: PROMPT_SOURCES['self-test-question'].version,
  grade: PROMPT_SOURCES['self-test-grade'].version,
} as const;
