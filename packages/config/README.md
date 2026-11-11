# @learny/config

Configuration produit et plateforme, miroir des règles de `docs/product/business-rules.md`.

## Entrées

- `@learny/config` — entrées sûres : environnement **public**, constantes produit, règles d'outillage.
- `@learny/config/server` — variables **serveur** (secrets inclus) et constantes qui ne doivent jamais
  atteindre un navigateur. Un composant client ne peut pas l'importer : le lint de frontière
  (`eslint.config.mjs`) ne l'autorise que depuis `apps/web/lib/server-env.ts` (SPEC-009, ET-6).

## API publique

- `HOSTING_REGIONS` : région déclarée pour chaque service hébergé (`vercel`, `supabase`, `inngest`).
- `EU_REGIONS` : régions reconnues comme situées dans l'Union européenne.
- `isEuRegion(region)` : `true` si la région est dans l'UE (BR-PLA-04).
- `PUBLIC_ENV_KEYS`, `parsePublicEnv(raw)` : les six variables `NEXT_PUBLIC_*` autorisées, et rien
  d'autre (SPEC-009, EF-2).

```ts
import { HOSTING_REGIONS, isEuRegion, parsePublicEnv } from '@learny/config';

isEuRegion(HOSTING_REGIONS.vercel); // true
parsePublicEnv({ NEXT_PUBLIC_APP_URL: 'http://localhost:3000' });
```

## API serveur

- `parseServerEnv(raw, appEnv?)` : valide toutes les variables côté serveur et renvoie un objet typé.
  En `production`, une variable obligatoire absente ou invalide lève une `EnvConfigError` qui nomme
  les variables à corriger sans jamais afficher de valeur (EF-1, CL-1, CL-7).
- `serverEnvSchema`, `SERVER_ENV_KEYS`, `PRODUCTION_REQUIRED_KEYS`, `envDefaults(appEnv)`.
- `EnvConfigError` (`code: 'INVALID_ENVIRONMENT'`, `names`, `issues`).

```ts
import { parseServerEnv } from '@learny/config/server';

const env = parseServerEnv(process.env); // refus du démarrage si la production est incomplète
```

Les valeurs par défaut et la matrice des modes (`local`, `test`, `preview`, `production`) sont
documentées dans `.env.example` et vérifiées par les tests `[SPEC-009]`.
