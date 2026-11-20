#!/usr/bin/env node
/* global AbortSignal */
const port = process.env.PORT === undefined || process.env.PORT === '' ? '3001' : process.env.PORT;
const url = `http://127.0.0.1:${port}/health`;

try {
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  const body = await response.json();
  if (response.ok && body.status === 'ok') {
    console.log(`✔ api : ok (port ${port})`);
    process.exit(0);
  }
  console.error(`✖ api : HTTP ${String(response.status)}`);
} catch (error) {
  console.error(`✖ api : ${error instanceof Error ? error.message : String(error)}`);
}
process.exit(1);
