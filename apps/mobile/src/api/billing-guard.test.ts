// Vitest [SPEC-3401] — garde des règles des stores sur le client d'API du mobile (ET-3, CA-5).
//
// Deux preuves : la garde refuse les deux routes d'achat, et le code de l'application n'en contient
// aucune occurrence — ni l'identifiant de route, ni le nom de la méthode du client, ni le chemin
// HTTP. Un écran qui les appellerait ferait échouer ce test avant même la campagne.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertNoPurchaseRoute,
  isPurchaseRoute,
  PURCHASE_CLIENT_METHODS,
  PURCHASE_ROUTE_IDS,
  PurchaseRouteRefusedError,
} from './billing-guard';

const APP_DIR = path.resolve(__dirname, '..', '..');

/** Tous les fichiers `.ts`/`.tsx` d'un répertoire, récursivement. */
function sources(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'android' || entry.name === '.expo') {
        continue;
      }
      found.push(...sources(full));
      continue;
    }
    if (/\.(ts|tsx)$/u.test(entry.name)) found.push(full);
  }
  return found;
}

/** Occurrences d'un motif dans le code de production (les tests sont exclus). */
function occurrences(pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const file of [
    ...sources(path.join(APP_DIR, 'src')),
    ...sources(path.join(APP_DIR, 'app')),
  ]) {
    if (/\.test\.(ts|tsx)$/u.test(file)) continue;
    if (file.endsWith(path.join('api', 'billing-guard.ts'))) continue;
    // Les commentaires citent les routes pour expliquer la règle : seule la code les appellerait.
    const text = fs
      .readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//gu, '')
      .replace(/^\s*\/\/.*$/gmu, '');
    if (pattern.test(text)) hits.push(path.relative(APP_DIR, file));
  }
  return hits;
}

describe('[SPEC-3401] garde d’achat du client d’API', () => {
  it('refuse une route d’achat et de portail (ET-3, CA-5)', () => {
    expect(() => {
      assertNoPurchaseRoute(PURCHASE_ROUTE_IDS[0]);
    }).toThrow(PurchaseRouteRefusedError);
    expect(() => {
      assertNoPurchaseRoute(PURCHASE_ROUTE_IDS[1]);
    }).toThrow(PurchaseRouteRefusedError);
    expect(isPurchaseRoute('billing.checkout')).toBe(true);
    expect(isPurchaseRoute('billing.portal')).toBe(true);
  });

  it('laisse passer la seule route d’abonnement du périmètre mobile (BR-SET-06)', () => {
    expect(() => {
      assertNoPurchaseRoute('billing.subscription');
    }).not.toThrow();
    expect(isPurchaseRoute('billing.subscription')).toBe(false);
  });

  it('n’appelle jamais checkout ni portail depuis l’application (CA-5)', () => {
    const methods = PURCHASE_CLIENT_METHODS.join('|');
    const routes = PURCHASE_ROUTE_IDS.join('|');
    expect(occurrences(new RegExp(`\\b(${methods})\\b`, 'u'))).toEqual([]);
    expect(occurrences(new RegExp(`billing/(checkout|portal)`, 'u'))).toEqual([]);
    expect(occurrences(new RegExp(`(${routes.replace(/\./gu, '\\.')})`, 'u'))).toEqual([]);
  });

  it('lit l’abonnement par `billingSubscription` seulement (BR-SET-06)', () => {
    const subscription = fs.readFileSync(
      path.join(APP_DIR, 'src', 'data', 'subscription.ts'),
      'utf8',
    );
    expect(subscription).toContain('billingSubscription');
    expect(subscription).not.toContain('billingCheckout');
    expect(subscription).not.toContain('billingPortal');
  });
});
