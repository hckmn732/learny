// Public API of @learny/automations: the engine of the automations (SPEC-711, ADR-0190) and the
// product definitions (SPEC-712 and later) registered on the singleton.
export * from './moteur-d-automatismes';
export * from './parametres-automatismes';
export * from './reprise';
export {
  drawSmoothQuizSession,
  explainQuizSmoothed,
  plafondQuizAutomation,
  reintroduceDeferredNotions,
} from './automatisme-7-quiz-global-plafonne-et-lisse';
export { repriseAutomation } from './definitions/reprise';
export {
  echauffementAutomation,
  explainEchauffement,
  explainWarmupLastAction,
} from './definitions/echauffement';
export { explainJeuLacune, jeuLacuneAutomation } from './definitions/jeu-lacune';
export {
  explainQuestionsCartes,
  questionCardDedupeKey,
  questionCardSkipReason,
  questionsCartesAutomation,
} from './definitions/questions-cartes';
export { explainRemediation, remediationAutomation } from './definitions/remediation';
export {
  explainMicroSeance,
  microCardSummary,
  microLastActionSummary,
  microSeanceAutomation,
} from './definitions/micro-seance';
export {
  shouldProposeMicroSession,
  type MicroFormationCandidate,
  type MicroProposalDecision,
  type MicroProposalInput,
} from './micro-seance/should-propose';

import { plafondQuizAutomation } from './automatisme-7-quiz-global-plafonne-et-lisse';
import { echauffementAutomation } from './definitions/echauffement';
import { jeuLacuneAutomation } from './definitions/jeu-lacune';
import { microSeanceAutomation } from './definitions/micro-seance';
import { questionsCartesAutomation } from './definitions/questions-cartes';
import { remediationAutomation } from './definitions/remediation';
import { repriseAutomation } from './definitions/reprise';
import { automationRegistry } from './moteur-d-automatismes';

// ET-3 — the product registry holds one definition per key. Registering is idempotent at module
// load: a second evaluation (tests, hot reload) keeps the first definition.
if (automationRegistry.get('reprise') === undefined) {
  automationRegistry.register(repriseAutomation);
}
if (automationRegistry.get('echauffement') === undefined) {
  automationRegistry.register(echauffementAutomation);
}
if (automationRegistry.get('remediation') === undefined) {
  automationRegistry.register(remediationAutomation);
}
if (automationRegistry.get('micro_seance') === undefined) {
  automationRegistry.register(microSeanceAutomation);
}
if (automationRegistry.get('jeu_lacune') === undefined) {
  automationRegistry.register(jeuLacuneAutomation);
}
if (automationRegistry.get('plafond_quiz') === undefined) {
  automationRegistry.register(plafondQuizAutomation);
}
if (automationRegistry.get('questions_cartes') === undefined) {
  automationRegistry.register(questionsCartesAutomation);
}
