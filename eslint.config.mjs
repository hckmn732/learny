// Flat ESLint configuration shared by every package (SPEC-001, ET-5).
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import importPlugin from 'eslint-plugin-import';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const CLOCK_MESSAGE = 'Utiliser clock.now() de @learny/core (ADR-0047).';

const NODE_GLOBALS = Object.fromEntries(
  [
    'process',
    'console',
    'Buffer',
    'URL',
    'URLSearchParams',
    'setTimeout',
    'clearTimeout',
    'setInterval',
    'clearInterval',
    'structuredClone',
    'fetch',
    'Response',
    'Request',
    'Headers',
  ].map((name) => [name, 'readonly']),
);

// Package boundaries (docs/architecture/overview.md §3): target -> packages it may import.
const ALLOWED_IMPORTS = {
  'learning-engine': ['core'],
  bricks: ['core', 'contracts', 'ui'],
  llm: ['core', 'config', 'contracts', 'db'],
  tutor: ['llm', 'bricks', 'learning-engine', 'contracts', 'core', 'db', 'ingestion'],
};

const boundaryZones = [
  ...Object.entries(ALLOWED_IMPORTS).map(([target, allowed]) => ({
    target: `./packages/${target}`,
    from: './packages',
    except: [target, ...allowed].map((name) => `./${name}`),
    message: `packages/${target} ne peut importer que ${allowed.join(', ')}.`,
  })),
  {
    target: './packages/services',
    from: './packages/ui',
    message: 'packages/services ne peut pas importer packages/ui.',
  },
  {
    target: './packages',
    from: './apps',
    message: 'Un paquet ne peut pas importer une application.',
  },
];

const restrictedImportBlocks = [
  {
    files: ['packages/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@learny/web', '@learny/web/*'],
              message: 'Un paquet ne peut pas importer une application.',
            },
          ],
        },
      ],
    },
  },
  ...Object.entries(ALLOWED_IMPORTS).map(([target, allowed]) => ({
    files: [`packages/${target}/**`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@learny/*',
                ...[target, ...allowed].flatMap((n) => [`!@learny/${n}`, `!@learny/${n}/*`]),
              ],
              message: `packages/${target} ne peut importer que ${allowed.join(', ')}.`,
            },
          ],
        },
      ],
    },
  })),
  {
    files: ['packages/services/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@learny/ui', '@learny/ui/*'],
              message: 'packages/services ne peut pas importer packages/ui.',
            },
            {
              group: ['@learny/web', '@learny/web/*'],
              message: 'Un paquet ne peut pas importer une application.',
            },
          ],
        },
      ],
    },
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/next-env.d.ts',
      'test-results/**',
      'coverage/**',
      'design/**',
      'docs/**',
      'evidence/**',
      'progress/**',
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: NODE_GLOBALS,
    },
    plugins: { import: importPlugin },
    settings: {
      'import/resolver': {
        node: { extensions: ['.ts', '.tsx', '.mjs', '.js'] },
      },
      'import/internal-regex': '^@learny/',
    },
    rules: {
      'import/no-cycle': 'error',
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/no-restricted-paths': ['error', { zones: boundaryZones }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: CLOCK_MESSAGE,
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: CLOCK_MESSAGE,
        },
      ],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Root configs and tools have no tsconfig.json of their own: use tsconfig.tools.json.
    files: ['*.config.ts', 'tools/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: './tsconfig.tools.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['**/*.tsx'],
    ...jsxA11y.flatConfigs.recommended,
  },
  {
    files: ['**/*.tsx'],
    rules: {
      // Scrollable regions must be keyboard-reachable (WCAG 2.1.1, scrollable-region-focusable).
      'jsx-a11y/no-noninteractive-tabindex': [
        'error',
        { tags: [], roles: ['tabpanel', 'region'], allowExpressionValues: true },
      ],
    },
  },
  {
    files: ['apps/web/**'],
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      // App Router only: there is no pages/ directory.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  ...restrictedImportBlocks,
  {
    // Server configuration never reaches a client component: apps/web has exactly one adapter
    // (SPEC-009, ET-6). Any other import of the server entry is a lint error.
    files: ['apps/web/**/*.{ts,tsx}'],
    ignores: ['apps/web/lib/server-env.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@learny/config/server', '@learny/config/server/*'],
              message:
                'Seul apps/web/lib/server-env.ts importe la configuration serveur (SPEC-009, ET-6).',
            },
          ],
        },
      ],
    },
  },
  {
    // The clock module and the out-of-product SDD tooling may read the system time (ADR-0101).
    files: ['packages/core/src/clock.ts', 'tools/sdd/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // Pre-existing SDD tooling is kept as delivered: style rules are relaxed, not rewritten (ADR-0220).
    files: ['tools/sdd/**'],
    rules: {
      'import/order': 'off',
      'no-unused-vars': 'off',
      'no-useless-escape': 'off',
    },
  },
);
