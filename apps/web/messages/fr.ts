import { accessibility } from './fr/accessibility';
import { agenda } from './fr/agenda';
import { auth } from './fr/auth';
import { bricks } from './fr/bricks';
import { cadrage } from './fr/cadrage';
import { course } from './fr/course';
import { email } from './fr/email';
import { exercises } from './fr/exercises';
import { finalReview } from './fr/finalReview';
import { gaps } from './fr/gaps';
import { globalQuiz } from './fr/globalQuiz';
import { group } from './fr/group';
import { home } from './fr/home';
import { legal } from './fr/legal';
import { meta } from './fr/meta';
import { mockExam } from './fr/mockExam';
import { moduleMessages } from './fr/module';
import { notionGraph } from './fr/notionGraph';
import { offline } from './fr/offline';
import { onboarding } from './fr/onboarding';
import { programme } from './fr/programme';
import { quiz } from './fr/quiz';
import { remediation } from './fr/remediation';
import { sdd } from './fr/sdd';
import { search } from './fr/search';
import { settings } from './fr/settings';
import { shell } from './fr/shell';
import { system } from './fr/system';
import { tutorChat } from './fr/tutorChat';
import { ui } from './fr/ui';

export const fr = {
  accessibility,
  bricks,
  home,
  offline,
  globalQuiz,
  finalReview,
  cadrage,
  programme,
  module: moduleMessages,
  course,
  shell,
  search,
  gaps,
  notionGraph,
  exercises,
  ui,
  sdd,
  email,
  onboarding,
  auth,
  legal,
  system,
  tutorChat,
  meta,
  quiz,
  mockExam,
  remediation,
  settings,
  group,
  agenda,
} as const;

export type Messages = typeof fr;
