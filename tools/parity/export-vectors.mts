// SPEC-2001 — cross-runtime oracle vectors (P20 plan §4).
//
// Writes the JSON vectors the Python unit tests replay so that `learny.shared.*` and the learning
// engine produce exactly what TypeScript produces. Everything is deterministic: fixed clock,
// fixed identifiers, no network, no AI.
//
//   corepack pnpm exec tsx tools/parity/export-vectors.mts [--check]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AES_GCM_IV_BYTES,
  AES_GCM_TAG_BYTES,
  credentialAad,
  decryptSecret,
  encryptSecret,
  keyFingerprint,
  keyLast4Of,
  keyPrefixOf,
  maskKey,
} from '../../packages/llm/src/credentials/crypto';
import { calculateMastery } from '../../packages/learning-engine/src/mastery/calculate';
import { createNotionCard } from '../../packages/learning-engine/src/fsrs/review';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(REPO_ROOT, 'api', 'oracles', 'vectors');
const FIXED_NOW = '2026-11-11T12:20:00.000Z';
const FIXED_KEY = Buffer.from(Array.from({ length: 32 }, (_, index) => index));

/** `JSON.stringify`, `Date#toISOString`, `Math.round` and `toFixed` as JavaScript renders them. */
export function jsonxVectors() {
  const numbers = [0, -0, 1, 1.5, 1e21, 1e-7, 1 / 3, 1e300, -1e-7, 123456789012345678901234567890];
  const dates = [
    '2026-11-11T12:20:00.000Z',
    '2026-03-29T01:30:00.000Z',
    '2026-10-25T01:30:00.000Z',
    '1970-01-01T00:00:00.000Z',
  ];
  const rounding = [2.5, -2.5, 0.5, -0.5, 1.4999999, 2.4999999, -1.5];
  return {
    stringify: numbers.map((value) => ({ value, json: JSON.stringify(value) })),
    toIsoString: dates.map((value) => ({ value, iso: new Date(value).toISOString() })),
    round: rounding.map((value) => ({ value, js: Math.round(value), pyBanker: Math.round(value) })),
    toFixed: [1.005, 2.675, 1.1, 0.125, 1.2345].map((value) => ({
      value,
      digits: 2,
      text: value.toFixed(2),
    })),
    canonical: [
      {
        // Keys sorted by UTF-16 code units, `null` members omitted.
        input: { b: 1, a: null, A: 2, 'é': 3, z: [1, { d: 4, c: 5 }] },
        keys: Object.keys({ b: 1, a: null, A: 2, 'é': 3, z: [1, { d: 4, c: 5 }] }).sort((left, right) =>
          Buffer.compare(Buffer.from(left, 'utf16le'), Buffer.from(right, 'utf16le')),
        ),
      },
    ],
  };
}

/** Mastery and card creation of the learning engine on fixed inputs (P20 plan §4). */
export function learningEngineVectors() {
  const answers = [
    { answerId: 'a1', attemptId: 't1', score: 1, answeredAt: '2026-11-01T09:00:00.000Z' },
    { answerId: 'a2', attemptId: 't2', score: 0.5, answeredAt: '2026-11-05T18:30:00.000Z' },
    { answerId: 'a3', attemptId: 't3', score: 0, answeredAt: '2026-11-10T07:15:00.000Z' },
    { answerId: 'a4', attemptId: 't4', score: 1, answeredAt: '2026-11-11T12:00:00.000Z' },
  ];
  return {
    now: FIXED_NOW,
    mastery: [
      { at: '2026-11-11T12:20:00.000Z', threshold: 80, halfLifeDays: 14 },
      { at: '2026-11-20T00:00:00.000Z', threshold: 60, halfLifeDays: 7 },
    ].map((options) => ({
      input: { answers, ...options },
      output: calculateMastery({ answers, ...options }),
    })),
    notionCard: [0.9, 0.8, 0.95].map((retention) => ({
      retention,
      output: createNotionCard(FIXED_NOW, retention),
    })),
  };
}

/** AES-256-GCM envelope constants, AAD, fingerprints and masking (P20 plan §4). */
export function cryptoVectors() {
  const aad = credentialAad('cred-1', 'user-1');
  const plain = 'sk-live-0123456789abcdef';
  const envelope = encryptSecret(plain, aad, FIXED_KEY);
  const decrypted = decryptSecret(envelope, aad, { current: FIXED_KEY, previous: null });
  return {
    constants: { ivBytes: AES_GCM_IV_BYTES, tagBytes: AES_GCM_TAG_BYTES },
    keyHex: FIXED_KEY.toString('hex'),
    aad: { credentialId: 'cred-1', userId: 'user-1', value: aad },
    // The envelope carries a random IV, so only its length and the round-trip are recorded.
    roundTrip: {
      plain,
      envelopeLength: envelope.length,
      decrypted: decrypted.plain,
      usedPrevious: decrypted.usedPrevious,
      ok: decrypted.plain === plain,
    },
    fingerprint: { plain, value: keyFingerprint(plain, FIXED_KEY) },
    mask: {
      prefix: keyPrefixOf(plain),
      last4: keyLast4Of(plain),
      masked: maskKey(keyLast4Of(plain), keyPrefixOf(plain)),
    },
  };
}

export function allVectors() {
  return {
    jsonx: jsonxVectors(),
    'learning-engine': learningEngineVectors(),
    crypto: cryptoVectors(),
  };
}

export function writeVectors(checkOnly = false): string[] {
  const written: string[] = [];
  for (const [name, value] of Object.entries(allVectors())) {
    const file = path.join(OUT, `${name}.json`);
    const text = `${JSON.stringify(value, null, 2)}\n`;
    if (checkOnly) {
      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      if (current !== text) {
        console.error(`Vector drift: ${path.relative(REPO_ROOT, file)}`);
        process.exitCode = 1;
        continue;
      }
      written.push(file);
      continue;
    }
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(file, text);
    written.push(file);
  }
  return written;
}

const invokedDirectly = process.argv[1]?.endsWith('export-vectors.mts') ?? false;
if (invokedDirectly) {
  const files = writeVectors(process.argv.includes('--check'));
  console.log(`${process.argv.includes('--check') ? 'Checked' : 'Wrote'} ${String(files.length)} vector files`);
}
