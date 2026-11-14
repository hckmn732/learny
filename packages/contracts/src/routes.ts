import { agendaRoutes } from './agenda';
import { aiRoutes } from './ai';
import { aiCredentialRoutes } from './ai-credentials';
import { quizRoutes } from './attempts';
import { authRoutes } from './auth';
import { billingRoutes } from './billing';
import { brickRoutes } from './bricks';
import { cadrageRoutes, formationRoutes } from './cadrage';
import { courseRoutes } from './course';
import { courseReadingRoutes } from './course-reading';
import { devRoutes } from './dev';
import { billingDevRoutes } from './dev-billing';
import { devJobsRoutes } from './dev-jobs';
import { devEmailRoutes, emailRoutes } from './email';
import { exerciseRoutes } from './exercises';
import { finalReviewRoutes } from './final-review';
import { formationManagementRoutes } from './formation-management';
import { gapRoutes } from './gaps';
import { headerRoutes } from './header';
import { healthRoutes } from './health';
import { homeRoutes } from './home';
import { meRoutes } from './me';
import { examRoutes } from './mock-exams';
import { notificationRoutes, notificationsDevRoutes } from './notifications';
import { notionGraphRoutes } from './notion-graph';
import { personalDataDevRoutes, personalDataRoutes } from './personal-data';
import { programmeRoutes } from './programme';
import { pushDevRoutes, pushRoutes } from './push';
import { remediationRoutes } from './quiz-result';
import { moduleRoutes } from './resources';
import { searchRoutes } from './search';
import { securityRoutes } from './security';
import { sidebarRoutes } from './sidebar';
import { tutorChatRoutes } from './tutor-chat';
import { uploadsDevRoutes, uploadsRoutes } from './uploads';

// Registry of every route (SPEC-201 ET-1). Each domain exports its routes; they are merged here.
// A test checks the uniqueness of `id` and of `method + path`.
export const ROUTES = {
  ...agendaRoutes,
  ...healthRoutes,
  ...authRoutes,
  ...meRoutes,
  ...devRoutes,
  ...securityRoutes,
  ...uploadsRoutes,
  ...uploadsDevRoutes,
  ...pushRoutes,
  ...pushDevRoutes,
  ...devJobsRoutes,
  ...searchRoutes,
  ...headerRoutes,
  ...homeRoutes,
  ...sidebarRoutes,
  ...aiRoutes,
  ...billingRoutes,
  ...brickRoutes,
  ...formationRoutes,
  ...cadrageRoutes,
  ...formationManagementRoutes,
  ...finalReviewRoutes,
  ...programmeRoutes,
  ...moduleRoutes,
  ...courseRoutes,
  ...courseReadingRoutes,
  ...billingDevRoutes,
  ...emailRoutes,
  ...devEmailRoutes,
  ...notificationRoutes,
  ...notificationsDevRoutes,
  ...personalDataRoutes,
  ...personalDataDevRoutes,
  ...aiCredentialRoutes,
  ...gapRoutes,
  ...notionGraphRoutes,
  ...exerciseRoutes,
  ...tutorChatRoutes,
  ...quizRoutes,
  ...examRoutes,
  ...remediationRoutes,
} as const;

export type RouteName = keyof typeof ROUTES;
