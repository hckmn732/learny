#!/usr/bin/env node
// Commande locale `pnpm db:seed:demo` (SPEC-115 EF-5, ET-4, CL-3).
//
// La garde d'environnement s'exécute dans `seedDemo` avant toute connexion en écriture. Le résumé
// par table et les contrôles 7 modules / 48 notions / 3 formations actives / 2 terminées /
// 3 membres / agenda 9–13 novembre sont affichés ; une anomalie annule la transaction (CL-2).
import { closeDb } from '../client';

import { formatSeedSummary, seedDemo } from './demo';
import { describeSeedFailure } from './demo-guard';

try {
  const summary = await seedDemo();
  console.log(formatSeedSummary(summary));
} catch (error) {
  console.error(`✖ ${describeSeedFailure(error)}`);
  process.exitCode = 1;
} finally {
  await closeDb();
}
