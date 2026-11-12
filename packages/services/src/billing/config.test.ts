import { describe, expect, it } from 'vitest';

import { AppError } from '@learny/core';

import { resolveBillingConfig } from './config';

describe('[SPEC-210] configuration de facturation', () => {
  it('le mode par défaut suit APP_ENV : mock en local et en test, test en préproduction', () => {
    expect(resolveBillingConfig({ APP_ENV: 'local' }).mode).toBe('mock');
    expect(resolveBillingConfig({ APP_ENV: 'test' }).mode).toBe('mock');
    expect(resolveBillingConfig({ APP_ENV: 'preview' }).mode).toBe('test');
    expect(resolveBillingConfig({}).mode).toBe('mock');
  });

  it('STRIPE_MODE=mock est refusé en production (ADR-0215)', () => {
    expect(() => resolveBillingConfig({ APP_ENV: 'production', STRIPE_MODE: 'mock' })).toThrow(
      AppError,
    );
    expect(resolveBillingConfig({ APP_ENV: 'production' }).mode).toBe('live');
    expect(resolveBillingConfig({ APP_ENV: 'production', STRIPE_MODE: 'live' }).mode).toBe('live');
  });

  it('normalise l’adresse publique et ignore les valeurs vides', () => {
    const config = resolveBillingConfig({
      STRIPE_MODE: 'test',
      NEXT_PUBLIC_APP_URL: 'https://learny.example///',
      STRIPE_PRICE_ID: '  ',
    });
    expect(config.appUrl).toBe('https://learny.example');
    expect(config.priceId).toBeUndefined();
    expect(resolveBillingConfig({}).appUrl).toBe('http://localhost:3000');
  });
});
