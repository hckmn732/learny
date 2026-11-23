import { ROUTES } from '@learny/contracts';

import { agendaImplementations } from './implementations/agenda';
import { agendaDeplacerEtReajusterLePlanningImplementations } from './implementations/agenda-deplacer-et-reajuster-le-planning';
import { aiCredentialsImplementations } from './implementations/ai-credentials';
import { attemptsImplementations } from './implementations/attempts';
import { authImplementations } from './implementations/auth';
import { automatisme10ModePauseEtRetourImplementations } from './implementations/automatisme-10-mode-pause-et-retour';
import { automatisme9BilanDeLaSemaineImplementations } from './implementations/automatisme-9-bilan-de-la-semaine';
import { billingImplementations } from './implementations/billing';
import { bricksImplementations } from './implementations/bricks';
import { cadrageImplementations } from './implementations/cadrage';
import { courseImplementations } from './implementations/course';
import { courseReadingImplementations } from './implementations/course-reading';
import { devStripeSessionImplementations } from './implementations/dev-stripe-session';
import { emailImplementations } from './implementations/email';
import { exercisesImplementations } from './implementations/exercises';
import { finalReviewImplementations } from './implementations/final-review';
import { formationManagementImplementations } from './implementations/formation-management';
import { formationsAPlusieursImplementations } from './implementations/formations-a-plusieurs';
import { gapsImplementations } from './implementations/gaps';
import { headerImplementations } from './implementations/header';
import { homeImplementations } from './implementations/home';
import { legalImplementations } from './implementations/legal';
import { meImplementations } from './implementations/me';
import { mockExamsImplementations } from './implementations/mock-exams';
import { moteurDAutomatismesImplementations } from './implementations/moteur-d-automatismes';
import { notificationsImplementations } from './implementations/notifications';
import { notionGraphImplementations } from './implementations/notion-graph';
import { offlineImplementations } from './implementations/offline';
import { parametresModelesDIaImplementations } from './implementations/parametres-modeles-d-ia';
import { parametresNotificationsImplementations } from './implementations/parametres-notifications';
import { parametresOngletsEtProfilImplementations } from './implementations/parametres-onglets-et-profil';
import { personalDataImplementations } from './implementations/personal-data';
import { programmeImplementations } from './implementations/programme';
import { pushImplementations } from './implementations/push';
import { quizResultImplementations } from './implementations/quiz-result';
import { resourcesImplementations } from './implementations/resources';
import { reviewImplementations } from './implementations/review';
import { searchImplementations } from './implementations/search';
import { serieRegulariteEtJalonsInterfaceImplementations } from './implementations/serie-regularite-et-jalons-interface';
import { sidebarImplementations } from './implementations/sidebar';
import { tutorChatImplementations } from './implementations/tutor-chat';
import { uploadsImplementations } from './implementations/uploads';
import { warmupImplementations } from './implementations/warmup';
import { SPECIAL_HANDLERS } from './special';
import type { RouteImplementation } from './types';

/** Every standard route of the registry, keyed by its registry identifier (EF-1). */
export const ROUTE_IMPLEMENTATIONS = {
  ...agendaImplementations,
  ...attemptsImplementations,
  ...quizResultImplementations,
  ...authImplementations,
  ...billingImplementations,
  ...bricksImplementations,
  ...resourcesImplementations,
  ...uploadsImplementations,
  ...courseReadingImplementations,
  ...devStripeSessionImplementations,
  ...tutorChatImplementations,
  ...emailImplementations,
  ...exercisesImplementations,
  ...formationManagementImplementations,
  ...cadrageImplementations,
  ...finalReviewImplementations,
  ...gapsImplementations,
  ...reviewImplementations,
  ...formationsAPlusieursImplementations,
  ...mockExamsImplementations,
  ...notionGraphImplementations,
  ...programmeImplementations,
  ...agendaDeplacerEtReajusterLePlanningImplementations,
  ...homeImplementations,
  ...aiCredentialsImplementations,
  ...parametresModelesDIaImplementations,
  ...meImplementations,
  ...moteurDAutomatismesImplementations,
  ...personalDataImplementations,
  ...headerImplementations,
  ...legalImplementations,
  ...parametresNotificationsImplementations,
  ...automatisme10ModePauseEtRetourImplementations,
  ...parametresOngletsEtProfilImplementations,
  ...pushImplementations,
  ...sidebarImplementations,
  ...automatisme9BilanDeLaSemaineImplementations,
  ...serieRegulariteEtJalonsInterfaceImplementations,
  ...courseImplementations,
  ...notificationsImplementations,
  ...offlineImplementations,
  ...searchImplementations,
  ...warmupImplementations,
} satisfies {
  [K in Exclude<keyof typeof ROUTES, keyof typeof SPECIAL_HANDLERS>]: RouteImplementation<
    (typeof ROUTES)[K]
  >;
};
