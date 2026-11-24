import { describe, expect, it } from 'vitest';

import * as contracts from './index';

/**
 * [SPEC-201] The public surface of the contracts package (ET-1): the barrel is what every client
 * imports, and no unit suite used to import it, so its re-exports were never measured.
 */
describe('[SPEC-201] surface publique du paquet de contrats', () => {
  it('réexporte les schémas, les routes et le constructeur OpenAPI', () => {
    expect(Object.keys(contracts).length).toBeGreaterThan(150);
    expect(contracts.ProblemDetails).toBeDefined();
    expect(contracts.PushSubscriptionBody).toBeDefined();
    expect(contracts.PushUnsubscribeBody).toBeDefined();
    expect(contracts.healthRoutes).toBeDefined();
    expect(contracts.ROUTES).toBeDefined();
    expect(contracts.buildOpenApiDocument).toBeTypeOf('function');
    expect(contracts.serializeOpenApiDocument).toBeTypeOf('function');
  });
});
