// Flat ESLint configuration shared by every package (SPEC-001, ET-5).

import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import importPlugin from 'eslint-plugin-import';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// Server-side packages the mobile client may never import (SPEC-3001 ET-3, ADR-1007).
const MOBILE_SERVER_PACKAGES = [
  '@learny/db',
  '@learny/services',
  '@learny/jobs',
  '@learny/llm',
  '@learny/tutor',
  '@learny/ingestion',
  '@learny/automations',
  '@learny/notifications',
  '@learny/http',
  '@learny/api-routes',
].flatMap((name) => [name, `${name}/*`]);

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
  'api-client': ['contracts', 'core'],
  'api-routes': [
    'contracts',
    'core',
    'config',
    'db',
    'services',
    'jobs',
    'notifications',
    'llm',
    'tutor',
    'ingestion',
    'automations',
    'learning-engine',
    'bricks',
    'http',
    'i18n',
    'ui',
  ],
  http: ['contracts', 'core', 'config', 'db', 'services'],
  bricks: ['core', 'contracts', 'ui'],
  domain: ['contracts', 'core', 'learning-engine', 'bricks'],
  llm: ['core', 'config', 'contracts', 'db', 'i18n'],
  ingestion: ['core', 'config', 'contracts', 'db', 'llm'],
  tutor: ['llm', 'bricks', 'learning-engine', 'contracts', 'core', 'db', 'ingestion'],
  db: ['core', 'config'],
  contracts: ['core'],
  i18n: [],
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
  'packages/http/src/idempotency.ts',
  'apps/web/test/integration/**',
  // End-to-end tests build their own committed fixtures (SPEC-206), like the integration tests.
  'apps/web/e2e/**',
];

const WEB_IS_A_CLIENT_PACKAGES = [
  '@learny/db',
  '@learny/services',
  '@learny/jobs',
  '@learny/llm',
  '@learny/tutor',
  '@learny/ingestion',
  '@learny/automations',
  '@learny/notifications',
  '@learny/http',
  '@learny/api-routes',
];
const WEB_IS_A_CLIENT_GROUP = WEB_IS_A_CLIENT_PACKAGES.flatMap((name) => [name, `${name}/*`]);
const WEB_IS_A_CLIENT_MESSAGE =
  "apps/web est un client de l'API (ADR-1003) : passer par @learny/api-client.";

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
  {
    files: ['apps/api/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@learny/ui',
              message: 'apps/api est un serveur : aucun composant UI.',
            },
            {
              name: '@learny/api-client',
              message: 'apps/api n’utilise pas le client du navigateur.',
            },
          ],
          patterns: [
            {
              group: ['@learny/ui/*', '@learny/bricks/view', '@learny/bricks/view/*'],
              message: 'apps/api n’importe aucune couche de rendu.',
            },
            {
              group: ['@learny/web', '@learny/web/*', '@learny/worker', '@learny/worker/*'],
              message: 'apps/api ne peut importer une autre application.',
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
      'apps/mobile/android/**',
      'apps/mobile/.expo/**',
      'test-results/**',
      'coverage/**',
      'design/**',
      'docs/**',
      'evidence/**',
      'progress/**',
      'apps/web/public/sw.js',
      'apps/web/public/swe-worker-*.js',
      // Generated by openapi-typescript from api/openapi.yaml (pnpm sdk:generate): never edited.
      'packages/api-sdk/src/schema.d.ts',
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
    // SPEC-1002 ET-2 — @learny/api-client est un paquet partagé (ADR-1007) : exécutable dans un
    // navigateur, sous Node et sous React Native. Ce bloc remplace le bloc généré par
    // ALLOWED_IMPORTS pour ce paquet (le dernier bloc gagne) : il réplique la liste blanche et
    // interdit Node, Next, react-dom et l'entrée serveur de core.
    files: ['packages/api-client/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...AI_SDK_PATHS,
            {
              name: '@learny/core/server',
              message: "@learny/api-client est partagé : jamais l'entrée serveur de core (ET-2).",
            },
          ],
          patterns: [
            {
              group: [
                '@learny/*',
                '!@learny/api-client',
                '!@learny/api-client/*',
                '!@learny/contracts',
                '!@learny/contracts/*',
                '!@learny/core',
                '!@learny/core/*',
              ],
              message: 'packages/api-client ne peut importer que contracts, core.',
            },
            {
              group: ['@radix-ui/*'],
              message: 'Radix est encapsulé par packages/ui (SPEC-303, ET-1).',
            },
            {
              group: ['ai', 'ai/*', '@ai-sdk/*'],
              message: 'Seul packages/llm importe un SDK de fournisseur (SPEC-504, BR-IA-09).',
            },
            {
              group: ['node:*'],
              message: '@learny/api-client est partagé : aucun module Node (ET-2, ADR-1007).',
            },
            {
              group: ['next', 'next/*'],
              message: '@learny/api-client est partagé : aucun framework (ET-2).',
            },
            {
              group: ['react-dom'],
              message: '@learny/api-client est partagé : aucun rendu DOM (ET-2).',
            },
          ],
        },
      ],
    },
  },
  {
    // SPEC-1002 ET-2 — @learny/domain, même principe que api-client. bricks est autorisé : le
    // module review/game-response importe opaqueMapping de @learny/bricks (écart ADR-1007
    // consigné dans evidence/SPEC-1002/acceptance.md ; bricks est pur et déjà bundlé client).
    files: ['packages/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...AI_SDK_PATHS,
            {
              name: '@learny/core/server',
              message: "@learny/domain est partagé : jamais l'entrée serveur de core (ET-2).",
            },
          ],
          patterns: [
            {
              group: [
                '@learny/*',
                '!@learny/domain',
                '!@learny/domain/*',
                '!@learny/contracts',
                '!@learny/contracts/*',
                '!@learny/core',
                '!@learny/core/*',
                '!@learny/learning-engine',
                '!@learny/learning-engine/*',
                '!@learny/bricks',
                '!@learny/bricks/*',
              ],
              message:
                'packages/domain ne peut importer que contracts, core, learning-engine, bricks.',
            },
            {
              group: ['@radix-ui/*'],
              message: 'Radix est encapsulé par packages/ui (SPEC-303, ET-1).',
            },
            {
              group: ['ai', 'ai/*', '@ai-sdk/*'],
              message: 'Seul packages/llm importe un SDK de fournisseur (SPEC-504, BR-IA-09).',
            },
            {
              group: ['node:*'],
              message: '@learny/domain est partagé : aucun module Node (ET-2, ADR-1007).',
            },
            {
              group: ['next', 'next/*'],
              message: '@learny/domain est partagé : aucun framework (ET-2).',
            },
            {
              group: ['react-dom'],
              message: '@learny/domain est partagé : aucun rendu DOM (ET-2).',
            },
          ],
        },
      ],
    },
  },
  {
    // SPEC-1002 ET-2 — @learny/i18n : messages purs, aucune dépendance interne autorisée.
    files: ['packages/i18n/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...AI_SDK_PATHS,
            {
              name: '@learny/core/server',
              message: "@learny/i18n est partagé : jamais l'entrée serveur de core (ET-2).",
            },
          ],
          patterns: [
            {
              group: ['@learny/*'],
              message: "packages/i18n n'importe aucun autre paquet (ET-2, ADR-1007).",
            },
            {
              group: ['@radix-ui/*'],
              message: 'Radix est encapsulé par packages/ui (SPEC-303, ET-1).',
            },
            {
              group: ['ai', 'ai/*', '@ai-sdk/*'],
              message: 'Seul packages/llm importe un SDK de fournisseur (SPEC-504, BR-IA-09).',
            },
            {
              group: ['node:*'],
              message: '@learny/i18n est partagé : aucun module Node (ET-2, ADR-1007).',
            },
            {
              group: ['next', 'next/*'],
              message: '@learny/i18n est partagé : aucun framework (ET-2).',
            },
            {
              group: ['react-dom'],
              message: '@learny/i18n est partagé : aucun rendu DOM (ET-2).',
            },
          ],
        },
      ],
    },
  },

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
    // Test fixtures may use server configuration; this block only keeps Radix encapsulated.
    files: SERVICE_DB_ALLOWED,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
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
    // SPEC-1001 EF-4 — `learny/web-is-a-client` (ADR-1003): the last block for regular apps/web
    // files replicates the restrictions of the blocks above and adds the server packages, minus
    // the reference baseline, the tests and the demo/webhook entry points (handled just below).
    files: ['apps/web/**/*.{ts,tsx}'],
    ignores: ['apps/web/lib/server-env.ts', 'apps/web/test/**', 'apps/web/e2e/**'],
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
            {
              group: WEB_IS_A_CLIENT_GROUP,
              message: WEB_IS_A_CLIENT_MESSAGE,
            },
          ],
        },
      ],
    },
  },
  {
    // Same rule for the _dev demo pages and the webhooks, which may import `serviceDb`: the
    // config/server and Radix restrictions stay, the baseline still applies, and any new file
    // importing a server package is refused (SPEC-1001 EF-4).
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
            {
              group: WEB_IS_A_CLIENT_GROUP,
              message: WEB_IS_A_CLIENT_MESSAGE,
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
    // SPEC-3001 ET-3 — the mobile application is a client of the API (ADR-1007, ADR-3005): no
    // server package, no Next/React DOM module, no Node builtin. The shared client packages and
    // the pure token entry of @learny/ui are allowed.
    files: ['apps/mobile/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...AI_SDK_PATHS,
            {
              name: '@learny/core/server',
              message: "@learny/mobile est un client : jamais l'entrée serveur de core (ET-3).",
            },
          ],
          patterns: [
            {
              group: [...MOBILE_SERVER_PACKAGES, '@learny/web', '@learny/web/*'],
              message:
                'apps/mobile est un client (ADR-1007) : aucun paquet serveur, aucun import du web.',
            },
            {
              group: ['next', 'next/*'],
              message: 'apps/mobile ne peut importer aucun module Next (ET-3).',
            },
            {
              group: ['react-dom', 'react-dom/*'],
              message: 'apps/mobile ne peut importer react-dom (ET-3).',
            },
            {
              group: ['node:*'],
              message: 'apps/mobile ne peut importer aucun module Node (ET-3).',
            },
          ],
        },
      ],
    },
  },
  {
    // SPEC-3502 — outillage de publication : fiches des stores, générateur de licences et test de
    // configuration. Ces fichiers sont exécutés par Node (jamais empaquetés par Metro) et lisent le
    // disque et `node_modules` ; l'interdiction des modules Node (ET-3) vise le code de
    // l'application, pas cet outillage hors application.
    files: [
      'apps/mobile/store/**/*.{ts,mjs}',
      'apps/mobile/scripts/**/*.mjs',
      'apps/mobile/test/integration/release-config.int.test.ts',
    ],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // SPEC-3001 ET-4 — the application reads the time through src/lib/clock.ts only (ADR-0047).
    files: ['apps/mobile/**/*.{ts,tsx}'],
    ignores: ['apps/mobile/src/lib/clock.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'Utiliser clock.now() de @learny/core via src/lib/clock.ts (ADR-0047).',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Utiliser clock.now() de @learny/core via src/lib/clock.ts (ADR-0047).',
        },
      ],
    },
  },
  {
    // SPEC-3001 § 10 — colours and radii come from src/theme (itself built from @learny/ui/tokens).
    files: ['apps/mobile/**/*.{ts,tsx}'],
    ignores: [
      'apps/mobile/src/theme/**',
      'apps/mobile/**/*.test.{ts,tsx}',
      'apps/mobile/e2e/**',
      // The Expo configuration runs in the config loader, not in the bundle: it repeats the
      // canvas colour of the theme because the token sources are not resolvable there.
      'apps/mobile/app.config.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/#[0-9A-Fa-f]{3,8}\\b/]',
          message: 'Couleur hors du thème : importer src/theme (SPEC-3001 § 10).',
        },
        {
          selector: 'TemplateElement[value.raw=/#[0-9A-Fa-f]{3,8}\\b/]',
          message: 'Couleur hors du thème : importer src/theme (SPEC-3001 § 10).',
        },
      ],
    },
  },
  {
    // Unit tests of the mobile application run in Node (Vitest, canevas § 5): they read the
    // design references (tokens, fonts) and drive ESLint to prove CA-5, which the application
    // bundle never does. Only test files get this exemption: production code stays a pure
    // client of the API (SPEC-3001 ET-3).
    files: ['apps/mobile/src/**/*.test.ts', 'apps/mobile/test/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // The icon set is generated from `design/app-mobile/assets/icons.js` (SPEC-3002 § 8.3): the
    // brand marks of Apple and Google carry their own colours, and `Rect` attributes named `x`/`y`
    // are the SVG geometry of the mockup, not the deprecated DOM props of the base rule.
    files: ['apps/mobile/src/ui/icons.tsx'],
    rules: { 'no-restricted-syntax': 'off', '@typescript-eslint/no-deprecated': 'off' },
  },
  {
    // The Expo configuration files (Metro, Babel, Jest) and the asset stub are CommonJS.
    files: [
      'apps/mobile/*.config.js',
      'apps/mobile/test/**/*.js',
      'apps/mobile/e2e/**/*.mjs',
      'apps/mobile/plugins/**/*.cjs',
    ],
    languageOptions: {
      globals: {
        module: 'writable',
        exports: 'writable',
        require: 'readonly',
        __dirname: 'readonly',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        fetch: 'readonly',
        AbortSignal: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
  },
  {
    // The device agent, the Maestro runner and the build wrapper are Node programs of the e2e
    // harness: out-of-product tooling, free to read the system time (like tools/sdd, ADR-0101).
    files: ['apps/mobile/e2e/**/*.mjs'],
    rules: { 'import/order': 'off', 'no-restricted-syntax': 'off' },
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
  {
    // SPEC-1003 ET-2 — final block for all HTTP files, including idempotency (also listed in
    // SERVICE_DB_ALLOWED). It repeats the package allowlist because the last block wins.
    files: ['packages/http/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: AI_SDK_PATHS,
          patterns: [
            {
              group: [
                '@learny/*',
                '!@learny/http',
                '!@learny/http/*',
                '!@learny/contracts',
                '!@learny/contracts/*',
                '!@learny/core',
                '!@learny/core/*',
                '!@learny/config',
                '!@learny/config/*',
                '!@learny/db',
                '!@learny/db/*',
                '!@learny/services',
                '!@learny/services/*',
              ],
              message: 'packages/http ne peut importer que contracts, core, config, db, services.',
            },
            {
              group: ['@radix-ui/*'],
              message: 'Radix est encapsulé par packages/ui (SPEC-303, ET-1).',
            },
            {
              group: ['ai', 'ai/*', '@ai-sdk/*'],
              message: 'Seul packages/llm importe un SDK de fournisseur (SPEC-504, BR-IA-09).',
            },
            {
              group: ['next', 'next/*'],
              message: '@learny/http est indépendant du framework : aucun import Next (ET-2).',
            },
          ],
        },
      ],
    },
  },
  {
    // SPEC-1004 ET-4 - @learny/api-routes est un paquet serveur : la table d'implementation et les
    // gestionnaires speciaux importent les services, jamais un ecran ni un framework. Seul le
    // sous-chemin @learny/ui/tokens est admis (jetons purs de la page HTML de desinscription,
    // ADR-1007) ; ecart documente de l'ET-4 dans evidence/SPEC-1004/acceptance.md.
    files: ['packages/api-routes/**/*.{ts,tsx}'],
    rules: {
      // A route without parameters still receives the parsed arguments: the leading underscore
      // marks the ones the table intentionally ignores (`_args`).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: AI_SDK_PATHS,
          patterns: [
            {
              group: [
                '@learny/*',
                '!@learny/api-routes',
                '!@learny/api-routes/*',
                '!@learny/contracts',
                '!@learny/contracts/*',
                '!@learny/core',
                '!@learny/core/*',
                '!@learny/config',
                '!@learny/config/*',
                '!@learny/db',
                '!@learny/db/*',
                '!@learny/services',
                '!@learny/services/*',
                '!@learny/jobs',
                '!@learny/jobs/*',
                '!@learny/notifications',
                '!@learny/notifications/*',
                '!@learny/llm',
                '!@learny/llm/*',
                '!@learny/tutor',
                '!@learny/tutor/*',
                '!@learny/ingestion',
                '!@learny/ingestion/*',
                '!@learny/automations',
                '!@learny/automations/*',
                '!@learny/learning-engine',
                '!@learny/learning-engine/*',
                '!@learny/bricks',
                '!@learny/bricks/*',
                '!@learny/http',
                '!@learny/http/*',
                '!@learny/i18n',
                '!@learny/i18n/*',
                '!@learny/ui',
                '!@learny/ui/*',
              ],
              message:
                'packages/api-routes ne peut importer que les paquets serveur et @learny/ui/tokens.',
            },
            {
              group: ['@radix-ui/*'],
              message: 'Radix est encapsule par packages/ui (SPEC-303, ET-1).',
            },
            {
              group: ['@ai-sdk/*'],
              message: 'Seul packages/llm importe un SDK de fournisseur (SPEC-504, BR-IA-09).',
            },
            {
              group: ['next', 'next/*', '!inngest/next'],
              message:
                '@learny/api-routes est independant du framework : aucun import Next (SPEC-1101).',
            },
          ],
        },
      ],
    },
  },
);
