#!/usr/bin/env node
// Commande `pnpm perf:seed` (SPEC-804 ET-3).
import { closeDb } from '../client';

import { seedPerf } from './perf';

try {
  const summary = await seedPerf();
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await closeDb();
}
