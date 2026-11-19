# ADR-0336 — Séparation backend / frontend en applications distinctes

- **Statut** : Acceptée — remplace ADR-0004
- **Origine** : Validée (décision prise avec le porteur du projet, 2026-11-18)
- **Date** : 2026-11-18
- **Liens** : ADR-0004, ADR-0337, ADR-0338, ADR-0339, ADR-0340, ADR-0341, ADR-0342, SPEC-1001 à SPEC-1302

## Contexte

ADR-0004 a réuni écrans, API et PWA dans un seul déploiement Next.js (`apps/web`), en prévoyant que l'API reste extractible « plus tard (Hono/Fastify) sans réécrire la logique ». Learny doit désormais servir plusieurs clients : le frontend web, une application Android, une application iOS et, à terme, d'autres consommateurs. Un serveur dont les écrans lisent la base directement (Server Components → `packages/services`) ne peut pas servir des clients natifs, et lie le cycle de vie de l'API à celui des écrans.

L'existant rend l'extraction peu coûteuse : les 152 routes `/api/v1` sont déclarées comme des données (`defineRoute` dans `packages/contracts`), leurs gestionnaires se réduisent à un appel de service, et la logique métier vit dans `packages/*`.

## Décision

1. Learny devient **quatre applications** dans le même monorepo :
   - `apps/api` — **backend** TypeScript, seul propriétaire des données, de l'IA, des jobs et des webhooks (ADR-0337) ;
   - `apps/web` — **frontend** React (Next.js conservé, ADR-0338), client pur de l'API ;
   - `apps/mobile` — **Android et iOS** (React Native + Expo, ADR-0339), spécifié après la séparation ;
   - `apps/worker` est absorbé par `apps/api` (ADR-0337).
2. **Seul `apps/api` importe** `@learny/db`, `@learny/services`, `@learny/jobs`, `@learny/llm`, `@learny/tutor`, `@learny/ingestion`, `@learny/automations` et `@learny/notifications`. Les clients ne parlent au backend qu'au travers de l'API HTTP `/api/v1` décrite par `@learny/contracts`.
3. Ce qui est partagé entre clients et serveur est regroupé dans des paquets **sans I/O serveur** (ADR-0342) : contrats, client d'API typé, logique pure, messages, jetons de design.
4. **Invariant de la migration : aucun changement fonctionnel.** Contrats d'API, codes d'erreur, libellés, écrans, comportements, données et budgets de performance restent identiques ; la suite de non-régression existante (unitaires, intégration, 253 suites e2e, comparaisons visuelles) est la preuve de parité. Un écart observable est une anomalie, jamais une évolution.
5. La migration est conduite comme une **piste SDD dédiée** (ADR-0341) sur la branche `migration`.

## Conséquences

- ADR-0004 est remplacée ; ADR-0017 et ADR-0049 sont amendés (ADR-0337, ADR-0341).
- `docs/architecture/overview.md` et `docs/architecture/api.md` décrivent la topologie cible ; ils sont mis à jour dans le même commit que cet ADR et complétés par les spécifications qui livrent chaque étape.
- Les écrans rendus côté serveur font un aller-retour HTTP supplémentaire vers l'API : il est mesuré et borné (SPEC-1202, ADR-0338).
- Le périmètre produit (ADR-0005) n'est pas étendu : la migration est technique ; les applications mobiles feront l'objet de spécifications distinctes après la clôture de la piste.
