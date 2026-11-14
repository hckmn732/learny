// Public API of @learny/automations: the engine of the automations (SPEC-711, ADR-0190) and the
// product definitions (SPEC-712 and later) registered on the singleton.
export * from './moteur-d-automatismes';
export * from './reprise';
export { repriseAutomation } from './definitions/reprise';

import { repriseAutomation } from './definitions/reprise';
import { automationRegistry } from './moteur-d-automatismes';

// ET-3 — the product registry holds one definition per key. Registering is idempotent at module
// load: a second evaluation (tests, hot reload) keeps the first definition.
if (automationRegistry.get('reprise') === undefined) {
  automationRegistry.register(repriseAutomation);
}
