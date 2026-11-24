// Metro configuration for the Learny monorepo (SPEC-3001 ET-2, canevas § 6).
// pnpm links the workspace packages from a single content-addressable store: Metro must watch the
// whole workspace (the store lives under <root>/node_modules/.pnpm) and resolve both the project
// and the workspace node_modules roots. Hierarchical lookup stays enabled: `@learny/core` imports
// its own dependencies (`@date-fns/tz`) from its own node_modules link.
const path = require('node:path');

const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the workspace so the shared TypeScript packages are transpiled from their sources.
config.watchFolders = [workspaceRoot];

// Resolve from the app first, then from the workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Follow the pnpm symlinks (packages/<name> -> <store>) and transpile the shared packages.
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
