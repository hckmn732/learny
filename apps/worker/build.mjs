// Bundles the worker and its workspace packages into dist/server.mjs (ET-6).
import { build } from 'esbuild';

await build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.mjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  logLevel: 'warning',
  // CommonJS dependencies bundled in ESM still call require().
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});
