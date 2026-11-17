/* global require, module, __dirname */
// Configuration Lighthouse CI (SPEC-804 EF-2, ET-1). `run.mjs` fixe PERF_URLS (chemins séparés par
// des virgules), PERF_COOKIE (pages connectées) et PERF_LHCI_OUT.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const BASE = process.env.PERF_BASE_URL ?? 'http://127.0.0.1:3100';

function paths() {
  if (process.env.PERF_URLS) return process.env.PERF_URLS.split(',').filter(Boolean);
  const out = execFileSync('node', [path.join(ROOT, 'tools', 'perf', 'urls.mjs'), '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const parsed = JSON.parse(out);
  return [...parsed.anonymous, ...parsed.authenticated];
}

const urls = paths().map((p) => `${BASE}${p}`);
const cookie = process.env.PERF_COOKIE;

module.exports = {
  ci: {
    collect: {
      numberOfRuns: 5,
      url: urls,
      settings: {
        chromeFlags: '--headless=new --no-sandbox',
        skipAudits: ['is-on-https', 'redirects-http'],
        ...(cookie ? { extraHeaders: JSON.stringify({ Cookie: cookie }) } : {}),
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.85 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: process.env.PERF_LHCI_OUT ?? 'test-results/perf/lhci',
    },
  },
};
