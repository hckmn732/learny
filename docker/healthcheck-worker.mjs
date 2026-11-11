#!/usr/bin/env node
/* global AbortSignal */
// Container healthcheck of the worker image (SPEC-012, EF-5).
// The worker only exposes /health; it reads APP_VERSION and GIT_COMMIT but never prints them.
const port = process.env.PORT === undefined || process.env.PORT === '' ? '3001' : process.env.PORT;
const url = `http://127.0.0.1:${port}/health`;

try {
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  const body = await response.json();
  if (response.ok && body.status === 'ok') {
    console.log(`✔ worker : ok (port ${port})`);
    process.exit(0);
  }
  console.error(`✖ worker : HTTP ${String(response.status)}`);
} catch (error) {
  console.error(`✖ worker : ${error instanceof Error ? error.message : String(error)}`);
}
process.exit(1);
