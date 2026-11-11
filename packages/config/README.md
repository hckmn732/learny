# @learny/config

Configuration produit et plateforme, miroir des règles de `docs/product/business-rules.md`.

## API publique

- `HOSTING_REGIONS` : région déclarée pour chaque service hébergé (`vercel`, `supabase`, `inngest`).
- `EU_REGIONS` : régions reconnues comme situées dans l'Union européenne.
- `isEuRegion(region)` : `true` si la région est dans l'UE (BR-PLA-04).

```ts
import { HOSTING_REGIONS, isEuRegion } from '@learny/config';

isEuRegion(HOSTING_REGIONS.vercel); // true
```
