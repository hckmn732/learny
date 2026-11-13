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
  // `config` and `testing` are only partially allowed; the dedicated engine blocks below restrict
  // them to `@learny/config/product` and to fixtures (SPEC-401 ET-9).
  'learning-engine': ['core', 'config', 'testing'],
  bricks: ['core', 'contracts', 'ui'],
  llm: ['core', 'config', 'contracts', 'db'],
  ingestion: ['core', 'config', 'contracts', 'db', 'llm'],
  tutor: ['llm', 'bricks', 'learning-engine', 'contracts', 'core', 'db', 'ingestion'],
  db: ['core', 'config'],
  contracts: ['core'],
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

// Web modules explicitly allowed to use the owner-role client (ADR-0022, SPEC-201 ET-4): the
// idempotency store of the API wrapper and the integration tests that inspect the database.
const SERVICE_DB_ALLOWED = [
  'apps/web/lib/api/idempotency.ts',
  'apps/web/test/integration/**',
  // End-to-end tests build their own committed fixtures (SPEC-206), like the integration tests.
  'apps/web/e2e/**',
];

// The `ai` package and its `ai/test` subpath are exact names: a gitignore pattern `ai` would also
// match an internal folder such as `packages/services/src/ai`, which is not provider code.
const AI_SDK_MESSAGE = 'Seul packages/llm importe un SDK de fournisseur (SPEC-504, BR-IA-09).';
const AI_SDK_PATHS = [
  { name: 'ai', message: AI_SDK_MESSAGE },
  { name: 'ai/test', message: AI_SDK_MESSAGE },
];

const restrictedImportBlocks = [
  {
    files: ['packages/**'],
    ignores: ['packages/ui/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: AI_SDK_PATHS,
          patterns: [
            {
              group: ['@learny/web', '@learny/web/*'],
              message: 'Un paquet ne peut pas importer une application.',
            },
            {
              group: ['@radix-ui/*'],
              message: 'Radix est encapsulé par packages/ui (SPEC-303, ET-1).',
            },
            {
              group: ['@ai-sdk/*'],
              message: AI_SDK_MESSAGE,
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
          ...(target === 'llm' ? {} : { paths: AI_SDK_PATHS }),
          patterns: [
            {
              group: [
                '@learny/*',
                ...[target, ...allowed].flatMap((n) => [`!@learny/${n}`, `!@learny/${n}/*`]),
              ],
              message: `packages/${target} ne peut importer que ${allowed.join(', ')}.`,
            },
            {
              group: ['@radix-ui/*'],
              message: 'Radix est encapsulé par packages/ui (SPEC-303, ET-1).',
            },
            ...(target === 'llm'
              ? []
              : [
                  {
                    group: ['ai', 'ai/*', '@ai-sdk/*'],
                    message:
                      'Seul packages/llm importe un SDK de fournisseur (SPEC-504, BR-IA-09).',
                  },
                ]),
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
          paths: AI_SDK_PATHS,
          patterns: [
            {
              group: ['@learny/ui', '@learny/ui/*'],
              message: 'packages/services ne peut pas importer packages/ui.',
            },
            {
              group: ['@learny/web', '@learny/web/*'],
              message: 'Un paquet ne peut pas importer une application.',
            },
            {
              group: ['@radix-ui/*'],
              message: 'Radix est encapsulé par packages/ui (SPEC-303, ET-1).',
            },
            {
              group: ['@ai-sdk/*'],
              message: AI_SDK_MESSAGE,
            },
          ],
        },
      ],
    },
  },
  {
    // Applications other than the web shell also consume the encapsulated design system.
    files: ['apps/**'],
    ignores: ['apps/web/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: AI_SDK_PATHS,
          patterns: [
            {
              group: ['@radix-ui/*'],
              message: 'Radix est encapsulé par packages/ui (SPEC-303, ET-1).',
            },
            {
              group: ['@ai-sdk/*'],
              message: AI_SDK_MESSAGE,
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
    // The pure engine may import @learny/core and the side-effect-free @learny/config/product
    // only (SPEC-401 ET-9, ADR-0140). Node built-ins and network globals are refused in src.
    files: ['packages/learning-engine/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@learny/*',
                '!@learny/core',
                '!@learny/core/*',
                '!@learny/config/',
                '@learny/config/*',
                '!@learny/config/product',
              ],
              message:
                'packages/learning-engine ne peut importer que @learny/core et @learny/config/product.',
            },
            {
              group: ['node:*'],
              message: 'packages/learning-engine est pur : aucun module Node (SPEC-401 EF-3).',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Le moteur ne fait aucun appel réseau (SPEC-401 EF-3).' },
        { name: 'process', message: 'Le moteur ne lit pas l’environnement (SPEC-401 EF-3).' },
      ],
    },
  },
  {
    // Every server-side retrieval goes through safeFetch (SPEC-510 ET-1, ADR-0159).
    files: ['packages/ingestion/src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='fetch']",
          message: 'Toute récupération serveur passe par safeFetch de @learny/core/net (ADR-0159).',
        },
      ],
    },
  },
  {
    // Test fixtures may also import @learny/testing (SPEC-401 ET-9).
    files: ['packages/learning-engine/src/fixtures/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@learny/*',
                '!@learny/core',
                '!@learny/core/*',
                '!@learny/config/',
                '@learny/config/*',
                '!@learny/config/product',
                '!@learny/testing/',
              ],
              message:
                'packages/learning-engine/src/fixtures ne peut importer que @learny/core, @learny/config/product et @learny/testing.',
            },
            {
              group: ['node:*'],
              message: 'packages/learning-engine est pur : aucun module Node (SPEC-401 EF-3).',
            },
          ],
        },
      ],
    },
  },
  {
    // Unit tests may import @learny/testing for the reference instant (ADR-0047).
    files: ['packages/learning-engine/src/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@learny/*',
                '!@learny/core',
                '!@learny/core/*',
                '!@learny/config/',
                '@learny/config/*',
                '!@learny/config/product',
                '!@learny/testing/',
              ],
              message:
                'Les tests du moteur peuvent importer @learny/core, @learny/config/product et @learny/testing.',
            },
          ],
        },
      ],
    },
  },
  {
    // Server configuration never reaches a client component: apps/web has exactly one adapter
    // (SPEC-009, ET-6). `serviceDb` is reserved to the SDD demo pages and the webhooks (SPEC-101,
    // ET-6); every other web module must use `userDb` and therefore the user's RLS context.
    files: ['apps/web/**/*.{ts,tsx}'],
    ignores: ['apps/web/lib/server-env.ts', ...SERVICE_DB_ALLOWED],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@learny/db',
              importNames: ['serviceDb'],
              message:
                'serviceDb est réservé à apps/web/app/_dev/** et apps/web/app/api/webhooks/** (SPEC-101, ET-6).',
            },
          ],
          patterns: [
            {
              group: ['@learny/config/server', '@learny/config/server/*'],
              message:
                'Seul apps/web/lib/server-env.ts importe la configuration serveur (SPEC-009, ET-6).',
            },
            {
              group: ['@radix-ui/*'],
              message: 'Radix est encapsulé par packages/ui (SPEC-303, ET-1).',
            },
          ],
        },
      ],
    },
  },
  {
    // The two web entry points allowed to use the owner-role client (SPEC-101, ET-6). They still
    // cannot import the server configuration directly.
    files: [
      'apps/web/app/%5Fdev/**/*.{ts,tsx}',
      'apps/web/app/_dev/**/*.{ts,tsx}',
      'apps/web/app/api/webhooks/**/*.{ts,tsx}',
    ],
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
            {
              group: ['@radix-ui/*'],
              message: 'Radix est encapsulé par packages/ui (SPEC-303, ET-1).',
            },
          ],
        },
      ],
    },
  },
  {
    // Same server-configuration rule, without the `serviceDb` restriction (SPEC-201 ET-4).
    files: SERVICE_DB_ALLOWED,
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
            {
              group: ['@radix-ui/*'],
              message: 'Radix est encapsulé par packages/ui (SPEC-303, ET-1).',
            },
          ],
        },
      ],
    },
  },
  {
    // Packages without any service-role use cannot import `serviceDb` (SPEC-101, ET-6).
    files: [
      'packages/core/**/*.{ts,tsx}',
      'packages/config/**/*.{ts,tsx}',
      'packages/contracts/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@learny/db',
              importNames: ['serviceDb'],
              message:
                'Seul un service, un job, le paquet llm, les tests ou packages/db/src/testing utilise serviceDb (SPEC-101, ET-6).',
            },
          ],
          patterns: [
            {
              group: ['@learny/web', '@learny/web/*'],
              message: 'Un paquet ne peut pas importer une application.',
            },
            {
              group: ['@radix-ui/*'],
              message: 'Radix est encapsulé par packages/ui (SPEC-303, ET-1).',
            },
          ],
        },
      ],
    },
  },
  {
    // Model identifiers are data of @learny/config only (SPEC-504, BR-IA-01). Seeds, tests and the
    // SDD demo pages of earlier specifications keep historical identifiers and are excluded.
    files: [
      'packages/{core,db,contracts,services,tutor,ingestion,jobs,notifications,automations,bricks,learning-engine,testing,ui}/src/**/*.{ts,tsx}',
      'apps/web/{app,components,lib}/**/*.{ts,tsx}',
    ],
    ignores: [
      'packages/*/src/seed/**',
      '**/*.test.{ts,tsx}',
      'apps/web/app/%5Fdev/**',
      'apps/web/components/sdd-demos/**',
    ],
    rules: {
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
        {
          selector: 'Literal[value=/claude-/]',
          message: 'Identifiant de modèle hors @learny/config (SPEC-504, BR-IA-01).',
        },
        {
          selector: 'TemplateElement[value.raw=/claude-/]',
          message: 'Identifiant de modèle hors @learny/config (SPEC-504, BR-IA-01).',
        },
      ],
    },
  },
  {
    // Interface colours live only in @learny/ui/tokens (SPEC-301, ET-7). Tests and the token
    // sources themselves legitimately contain hex literals.
    files: ['apps/web/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
    ignores: [
      'packages/ui/src/tokens/**',
      'packages/ui/test/**',
      'packages/ui/scripts/**',
      'apps/web/e2e/**',
      '**/*.test.{ts,tsx}',
    ],
    rules: {
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
        {
          selector: 'Literal[value=/#[0-9A-Fa-f]{3,8}\\b/]',
          message: 'Couleur hors jetons : importer @learny/ui/tokens (SPEC-301, ET-7).',
        },
        {
          selector: 'TemplateElement[value.raw=/#[0-9A-Fa-f]{3,8}\\b/]',
          message: 'Couleur hors jetons : importer @learny/ui/tokens (SPEC-301, ET-7).',
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
