// Dependencies of the billing service (SPEC-210 ET-2): configuration, Stripe gateway, database,
// clock, logger. The default gateway is chosen by `STRIPE_MODE` and shared by every route bundle of
// the server through `globalThis` (the simulated Stripe keeps its customers and subscriptions in
// memory, and the checkout page, the API routes and the webhook run in different bundles).
import { randomBytes } from 'node:crypto';

import { sql } from 'drizzle-orm';

import type { WebhookResult } from '@learny/contracts';
import { clock as systemClock, type Clock, type LearnyLogger } from '@learny/core';
import { logger as rootLogger } from '@learny/core/server';
import { serviceDb, type Db } from '@learny/db';

import { resolveBillingConfig, type BillingConfig } from './config';
import { MockStripeGateway, isMockGateway } from './mock-stripe';
import { StripeSdkGateway, type StripeGateway } from './stripe-client';

export interface JournalEntry {
  eventId: string;
  type: string;
  userId: string | null;
  at: string;
  result: WebhookResult;
  /** Raw body, kept so that the demonstration can replay the delivery. */
  payload: string;
}

const JOURNAL_LIMIT = 200;

/** Recent webhook outcomes, in memory, for the simulated mode only (EF-8). */
export class WebhookJournal {
  readonly entries: JournalEntry[] = [];

  add(entry: JournalEntry): void {
    this.entries.push(entry);
    if (this.entries.length > JOURNAL_LIMIT) this.entries.shift();
  }

  list(userId: string): JournalEntry[] {
    return this.entries.filter((entry) => entry.userId === userId);
  }

  last(userId: string): JournalEntry | undefined {
    return this.list(userId).at(-1);
  }
}

export interface BillingDeps {
  db: Db;
  gateway: StripeGateway;
  clock: Clock;
  logger: LearnyLogger;
  config: BillingConfig;
  /** Present in the simulated mode only. */
  journal?: WebhookJournal | undefined;
}

interface Shared {
  fingerprint: string;
  gateway: StripeGateway;
  journal: WebhookJournal | undefined;
  seeded: boolean;
}

const GLOBAL_KEY = Symbol.for('learny.billing.shared');
type GlobalWithBilling = typeof globalThis & { [GLOBAL_KEY]?: Shared };

function fingerprint(config: BillingConfig): string {
  return [
    config.mode,
    config.secretKey ?? '',
    config.webhookSecret ?? '',
    config.priceId ?? '',
  ].join('|');
}

/** Simulated identifiers restart at 1 with the process: continue after what the database holds. */
async function seedMockCounters(gateway: MockStripeGateway, db: Db): Promise<void> {
  const max = async (query: ReturnType<typeof sql>): Promise<number> => {
    const rows = await db.execute<{ n: number | null }>(query);
    return rows[0]?.n ?? 0;
  };
  const counters = gateway.state.counters;
  counters.customer = await max(
    sql`select max(substring(stripe_customer_id from 'cus_mock_(\d+)$')::int) as n from public.subscriptions`,
  );
  counters.subscription = await max(
    sql`select max(substring(stripe_subscription_id from 'sub_mock_(\d+)$')::int) as n from public.subscriptions`,
  );
  counters.event = await max(
    sql`select max(substring(event_id from 'evt_mock_(\d+)$')::int) as n from public.stripe_events`,
  );
}

export async function resolveBillingDeps(
  overrides: Partial<BillingDeps> = {},
): Promise<BillingDeps> {
  const config = overrides.config ?? resolveBillingConfig();
  const db = overrides.db ?? serviceDb();
  const clock = overrides.clock ?? systemClock;
  const base = { db, clock, logger: overrides.logger ?? rootLogger, config };
  if (overrides.gateway !== undefined) {
    return { ...base, gateway: overrides.gateway, journal: overrides.journal };
  }

  const holder = globalThis as GlobalWithBilling;
  const print = fingerprint(config);
  let shared = holder[GLOBAL_KEY];
  if (shared?.fingerprint !== print) {
    if (config.mode === 'mock') {
      // A webhook key generated per process when none is configured: only this process signs.
      const webhookSecret = config.webhookSecret ?? `whsec_${randomBytes(24).toString('hex')}`;
      shared = {
        fingerprint: print,
        gateway: new MockStripeGateway({ clock, webhookSecret }),
        journal: new WebhookJournal(),
        seeded: false,
      };
    } else {
      shared = {
        fingerprint: print,
        gateway: new StripeSdkGateway(config),
        journal: undefined,
        seeded: true,
      };
    }
    holder[GLOBAL_KEY] = shared;
  }
  if (!shared.seeded && isMockGateway(shared.gateway)) {
    await seedMockCounters(shared.gateway, db);
    shared.seeded = true;
  }
  return { ...base, gateway: shared.gateway, journal: overrides.journal ?? shared.journal };
}
