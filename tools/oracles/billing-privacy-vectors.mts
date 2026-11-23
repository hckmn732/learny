// SPEC-2206 - cross-runtime oracle vectors of the billing and privacy domains.
// Runs the real TypeScript helpers and writes the JSON the Python unit tests replay with strict
// equality: corepack pnpm exec tsx tools/oracles/billing-privacy-vectors.mts [--check]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isDataExportDownloadable } from '../../packages/db/src/schema/privacy-search';
import { isSafeRelativePath } from '../../packages/contracts/src/billing';
import { resolveBillingConfig } from '../../packages/services/src/billing/config';
import { isKnownStripeStatus, mapStripeStatus, maskStripeId } from '../../packages/services/src/billing/status';
import {
  normalizeStripeEvent,
  signPayload,
  verifySignature,
} from '../../packages/services/src/billing/stripe-event';
import { AppError } from '../../packages/core/src/errors';
import {
  archiveSlug,
  buildArchiveEntries,
  buildSettingsJson,
  formatLongDate,
  formatSizeLabel,
  moduleFolder,
  normalizeArchiveName,
  type ArchiveModel,
} from '../../packages/jobs/src/personal-data/zip-layout';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VECTORS = path.join(REPO_ROOT, 'api', 'oracles', 'vectors');
const NOW = new Date('2026-11-11T12:20:00Z');
const SECRET = ['learny', 'vectors', 'billing', 'privacy', '000000'].join('-');

function codeOf(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof AppError ? error.code : 'non-app-error';
  }
}

// `absoluteUrl` is private in `billing/checkout.ts`: reproduced here (same two rules, same errors).
function absoluteUrl(path: string, appUrl: string, field: string): string {
  if (!isSafeRelativePath(path)) {
    throw new AppError('VALIDATION_FAILED', 'Chemin de retour invalide.', {
      errors: [{ path: field, message: 'Chemin externe.' }],
    });
  }
  const url = new URL(path, `${appUrl}/`);
  if (url.origin !== new URL(appUrl).origin) {
    throw new AppError('VALIDATION_FAILED', 'Chemin de retour invalide.', {
      errors: [{ path: field, message: 'Chemin externe.' }],
    });
  }
  return url.toString();
}

function billingVectors() {
  const configCases = [
    {},
    { APP_ENV: 'local' },
    { APP_ENV: 'test' },
    { APP_ENV: 'preview' },
    { APP_ENV: 'production' },
    { APP_ENV: 'production', STRIPE_MODE: 'live' },
    { STRIPE_MODE: 'test' },
    { STRIPE_MODE: 'nonsense', APP_ENV: 'preview' },
    { STRIPE_MODE: 'test', NEXT_PUBLIC_APP_URL: 'https://learny.example///' },
    { STRIPE_MODE: 'test', NEXT_PUBLIC_APP_URL: '  ', STRIPE_PRICE_ID: '  ' },
    {
      STRIPE_MODE: 'test',
      STRIPE_SECRET_KEY: ' sk_test_1 ',
      STRIPE_WEBHOOK_SECRET: 'whsec_1',
      STRIPE_PRICE_ID: 'price_1',
    },
  ];
  const config = configCases.map((env) => {
    const resolved = resolveBillingConfig(env as Record<string, string | undefined>);
    return {
      env,
      mode: resolved.mode,
      appUrl: resolved.appUrl,
      priceId: resolved.priceId ?? null,
      secretKey: resolved.secretKey ?? null,
      webhookSecret: resolved.webhookSecret ?? null,
    };
  });
  const refusedConfig = [{ APP_ENV: 'production', STRIPE_MODE: 'mock' }].map((env) => ({
    env,
    code: codeOf(() => resolveBillingConfig(env as Record<string, string | undefined>)),
  }));

  const statuses = [
    'active',
    'trialing',
    'past_due',
    'unpaid',
    'paused',
    'canceled',
    'incomplete_expired',
    'incomplete',
    'something_new',
    '',
  ].map((stripe) => ({
    stripe,
    mapped: mapStripeStatus(stripe),
    known: isKnownStripeStatus(stripe),
  }));

  const masks = ['cus_1AbCdEfGh2345', 'sub_mock_12', '', null, 'abcdefghij_99', '_x'].map((id) => ({
    id,
    masked: maskStripeId(id),
  }));

  const payload = JSON.stringify({ id: 'evt_1', type: 'x', created: 1, data: { object: {} } });
  const header = signPayload(payload, SECRET, NOW);
  const tampered = `${payload} `;
  const verifications = [
    { header, now: NOW.toISOString() },
    { header, now: new Date(NOW.getTime() + 300_000).toISOString() },
    { header, now: new Date(NOW.getTime() + 301_000).toISOString() },
    { header: null, now: NOW.toISOString() },
    { header: '', now: NOW.toISOString() },
    { header: 'v1=abcd', now: NOW.toISOString() },
    { header: 'garbage', now: NOW.toISOString() },
    { header, now: NOW.toISOString(), payload: tampered },
    { header: `${header},v1=00`, now: NOW.toISOString() },
  ].map((item) => ({
    header: item.header,
    now: item.now,
    body: item.payload === undefined ? payload : item.payload,
    code: codeOf(() =>
      verifySignature(item.payload === undefined ? payload : item.payload, item.header ?? null, SECRET, new Date(item.now)),
    ),
  }));

  const userId = '11111111-1111-4111-8111-111111111111';
  const events = [
    {
      id: 'evt_a',
      type: 'checkout.session.completed',
      created: 5,
      data: { object: { customer: 'cus_a', subscription: 'sub_a', metadata: { userId } } },
    },
    {
      id: 'evt_b',
      type: 'customer.subscription.deleted',
      created: 6,
      data: { object: { id: 'sub_b', customer: { id: 'cus_b' }, metadata: { userId } } },
    },
    {
      id: 'evt_c',
      type: 'invoice.payment_failed',
      created: 7,
      data: {
        object: {
          customer: 'cus_c',
          subscription: 'sub_c',
          subscription_details: { metadata: { userId } },
        },
      },
    },
    {
      id: 'evt_d',
      type: 'customer.subscription.updated',
      created: 8,
      data: { object: { id: 'sub_d', customer: 'cus_d', client_reference_id: userId, metadata: {} } },
    },
    { id: 'evt_e', type: 'customer.created', created: 9, data: { object: { id: 'cus_e' } } },
    { type: 'x', created: 1 },
    { id: 'evt_f', type: '', created: 1 },
    { id: 'evt_g', type: 'x' },
    { id: 'evt_h', type: 'x', created: 'soon' },
    { id: 'evt_i', type: 'x', created: 10, data: { object: 'string' } },
  ].map((raw) => {
    try {
      return { raw, normalized: normalizeStripeEvent(raw), code: null };
    } catch (error) {
      return {
        raw,
        normalized: null,
        code: error instanceof AppError ? error.code : 'non-app-error',
      };
    }
  });

  const paths = [
    '/',
    '/parametres#ia',
    '/formations/42?tab=a',
    '/_dev/sdd/SPEC-210',
    '',
    'parametres',
    'https://evil.example/x',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '/a b',
    '/a\nb',
    `/${'a'.repeat(600)}`,
    '/ok',
  ].map((value) => ({ value, safe: isSafeRelativePath(value) }));

  const urls = [
    { path: '/ok', appUrl: 'https://learny.test', field: 'successPath' },
    { path: '/parametres#abonnement', appUrl: 'https://learny.test/', field: 'successPath' },
    { path: 'https://evil.example', appUrl: 'https://learny.test', field: 'cancelPath' },
    { path: '//evil.example', appUrl: 'https://learny.test', field: 'cancelPath' },
    { path: 'x', appUrl: 'https://learny.test', field: 'cancelPath' },
  ].map((item) => {
    try {
      return { ...item, url: absoluteUrl(item.path, item.appUrl, item.field as 'successPath'), code: null };
    } catch (error) {
      return {
        ...item,
        url: null,
        code: error instanceof AppError ? error.code : 'non-app-error',
        errors: error instanceof AppError ? (error.details?.errors ?? null) : null,
      };
    }
  });

  return { config, refusedConfig, statuses, masks, signatures: { secret: SECRET, payload, header, verifications }, events, paths, urls };
}

function privacyVectors() {
  const slugs = ['SAP S/4HANA — Finance', 'Élève', 'Formation', '  ', 'a'.repeat(80)].map((value) => ({
    value,
    slug: archiveSlug(value),
  }));
  const moduleFolders = [
    { position: 1, title: 'Comptabilité générale' },
    { position: 12, title: 'Module' },
    { position: 0, title: 'Module' },
    { position: 3, title: '' },
  ].map((item) => ({ ...item, folder: moduleFolder(item.position, item.title) }));
  const normalizedNames = [
    '../../etc/passwd',
    '..\\..\\windows\\system32',
    'a\u0000b.txt',
    '',
    'C:secret?.pdf',
    '  Guide FI.pdf  ',
    'Élève – notes.txt',
    '.hidden',
    'a'.repeat(200),
  ].map((value) => ({ value, normalized: normalizeArchiveName(value) }));

  const models: ArchiveModel[] = [
    {
      readme: 'README',
      settings: { profile: {} },
      results: {},
      conversations: {},
      formations: [
        {
          title: 'SAP S/4HANA Finance',
          programme: { formation: { title: 'SAP', count: 2 }, modules: [] },
          modules: [
            {
              position: 1,
              title: 'Comptabilité générale',
              courseMarkdown: '# Cours\n',
              apports: [{ name: 'Guide FI.pdf', storagePath: 'user/resource/Guide FI.pdf' }],
            },
          ],
        },
      ],
    },
    {
      readme: '',
      settings: { a: 1, b: null, c: true },
      results: { score: 12.5, list: [1, 2] },
      conversations: {},
      formations: [
        {
          title: 'Formation',
          programme: {},
          modules: [
            {
              position: 1,
              title: 'Module',
              courseMarkdown: null,
              apports: [
                { name: 'notes.txt', text: 'a' },
                { name: 'notes.txt', text: 'b' },
                { name: 'notes.txt', text: 'c' },
                { name: '../../etc/passwd', text: 'x' },
                { name: 'vide.txt', storagePath: '' },
              ],
            },
            {
              position: 2,
              title: 'Module',
              courseMarkdown: '  ',
              apports: [],
            },
          ],
        },
        {
          title: 'Formation',
          programme: { second: true },
          modules: [],
        },
        {
          title: '',
          programme: [],
          modules: [],
        },
      ],
    },
  ];
  const entries = models.map((model) => ({
    model,
    entries: buildArchiveEntries(model).map((entry) =>
      Object.fromEntries(
        Object.entries({ name: entry.name, text: entry.text, storagePath: entry.storagePath }).filter(
          ([, value]) => value !== undefined,
        ),
      ),
    ),
  }));

  const sizes = [12_400_000, 1024, 980, 0, -5, 999, 1000, 1_000_000_000, 12_450].map((bytes) => ({
    bytes,
    label: formatSizeLabel(bytes),
  }));
  const dates = [
    { instant: '2026-11-18T12:20:00Z', timezone: 'Europe/Paris' },
    { instant: '2026-11-11T12:20:00Z', timezone: 'Europe/Paris' },
    { instant: '2026-11-11T00:05:00Z', timezone: 'America/New_York' },
    { instant: '2026-12-31T23:30:00Z', timezone: 'Pacific/Auckland' },
  ].map((item) => ({ ...item, label: formatLongDate(new Date(item.instant), item.timezone) }));

  const settings = [
    {
      profile: { email: 'eleve@test.learny.test', timezone: 'Europe/Paris' },
      studyPreferences: { hoursPerDay: 2 },
      notificationSettings: { channelEmail: true },
      automations: [
        { key: 'reprise', enabled: true, params: { apiKey: 'secret', nested: { token: 'x' } } },
      ],
    },
    { profile: {}, studyPreferences: null, notificationSettings: null, automations: [] },
  ].map((input) => ({ input, output: buildSettingsJson(input) }));

  const download = [
    { status: 'done', storagePath: 'u/x.zip', expiresAt: '2026-11-18T12:20:00Z', now: NOW.toISOString() },
    { status: 'done', storagePath: '', expiresAt: '2026-11-18T12:20:00Z', now: NOW.toISOString() },
    { status: 'done', storagePath: null, expiresAt: '2026-11-18T12:20:00Z', now: NOW.toISOString() },
    { status: 'done', storagePath: 'u/x.zip', expiresAt: null, now: NOW.toISOString() },
    { status: 'done', storagePath: 'u/x.zip', expiresAt: NOW.toISOString(), now: NOW.toISOString() },
    { status: 'running', storagePath: 'u/x.zip', expiresAt: '2026-11-18T12:20:00Z', now: NOW.toISOString() },
    { status: 'failed', storagePath: 'u/x.zip', expiresAt: '2026-11-18T12:20:00Z', now: NOW.toISOString() },
    { status: 'done', storagePath: 'u/x.zip', expiresAt: '2026-10-01T00:00:00Z', now: NOW.toISOString() },
  ].map((item) => ({
    ...item,
    downloadable: isDataExportDownloadable(
      {
        status: item.status,
        storagePath: item.storagePath,
        expiresAt: item.expiresAt === null ? null : new Date(item.expiresAt),
      } as never,
      new Date(item.now),
    ),
  }));

  return { slugs, moduleFolders, normalizedNames, entries, sizes, dates, settings, download };
}

function write(name: string, value: unknown): void {
  const output = path.join(VECTORS, name);
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '';
    if (current !== serialized) {
      console.error(`${name} is stale: run tools/oracles/billing-privacy-vectors.mts`);
      process.exitCode = 1;
    }
    return;
  }
  fs.mkdirSync(VECTORS, { recursive: true });
  fs.writeFileSync(output, serialized);
  console.log(`Wrote ${path.relative(REPO_ROOT, output)}`);
}

write('billing.json', billingVectors());
write('privacy.json', privacyVectors());
if (process.argv.includes('--check') && process.exitCode !== 1) console.log('billing.json and privacy.json are up to date.');
