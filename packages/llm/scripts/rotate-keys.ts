#!/usr/bin/env tsx
// Rotation of the personal AI key master key (SPEC-505 ET-4, ADR-0154). Run after deploying the new
// APP_ENCRYPTION_KEY while the old one is still in APP_ENCRYPTION_KEY_PREVIOUS:
//   pnpm ai:rotate-keys
// The command is idempotent: a second run reports the rows already up to date.
import { EnvConfigError } from '@learny/config';
import { closeDb, serviceDb } from '@learny/db';

import { loadKeyring, rotateCredentialKeys } from '../src/credentials/index';

async function main(): Promise<number> {
  let ring;
  try {
    ring = loadKeyring(process.env);
  } catch (error) {
    if (error instanceof EnvConfigError) {
      console.error(`✖ ${error.message}`);
      console.error('  Définissez APP_ENCRYPTION_KEY (32 octets base64) et, pendant la rotation,');
      console.error('  APP_ENCRYPTION_KEY_PREVIOUS (ancienne clé).');
      return 2;
    }
    throw error;
  }

  const report = await rotateCredentialKeys(serviceDb(), ring);
  console.log('Rotation des clés IA personnelles');
  console.log(`Lignes examinées : ${String(report.total)}`);
  console.log(`Rechiffrées      : ${String(report.rotated)}`);
  console.log(`Déjà à jour      : ${String(report.upToDate)}`);
  console.log(`En échec         : ${String(report.failed.length)}`);
  if (report.failed.length > 0) {
    console.log(`Identifiants en échec (aucune clé affichée) : ${report.failed.join(', ')}`);
    return 1;
  }
  return 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  // Never echo a ciphertext, a key or SQL parameters: only the error class name.
  console.error(`✖ Rotation interrompue (${error instanceof Error ? error.name : 'Error'}).`);
  process.exitCode = 1;
} finally {
  await closeDb();
}
