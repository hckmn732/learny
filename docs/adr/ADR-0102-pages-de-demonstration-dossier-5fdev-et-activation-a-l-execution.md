# ADR-0102 — Pages de démonstration : dossier `%5Fdev` et activation à l'exécution

- **Statut** : Acceptée
- **Origine** : Déduite (décision prise lors de la rédaction des spécifications P0, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-001, SPEC-003, SPEC-006, ADR-0049

## Contexte

ADR-0049 place les pages de démonstration sous `apps/web/app/_dev/sdd/[specId]`. Dans l'App Router de Next.js, un dossier dont le nom commence par `_` est un **dossier privé** exclu du routage : l'URL `/_dev/sdd/…` n'existerait pas. La documentation de Next.js prévoit le préfixe encodé `%5F` pour obtenir un segment d'URL commençant par un tiret bas. Par ailleurs, une variable lue à la construction serait figée dans l'image et ne permettrait pas de prouver la désactivation en production.

## Décision

1. Les pages sont dans `apps/web/app/%5Fdev/sdd/` : `page.tsx` (index `/_dev/sdd`), `[specId]/page.tsx`, `registry.ts`, `layout.tsx`. L'URL publique reste `/_dev/sdd/SPEC-xxx` (ADR-0049 inchangé sur le fond).
2. Les pages sont rendues dynamiquement (`export const dynamic = 'force-dynamic'`) et appellent `notFound()` sauf si `ENABLE_SDD_PAGES === 'true'` **et** `APP_ENV !== 'production'` à l'exécution. `packages/config` refuse en outre de démarrer si `APP_ENV=production` et `ENABLE_SDD_PAGES=true` (SPEC-009).
3. Toutes les pages utilisent la coquille `apps/web/components/sdd/demo-shell.tsx` (`data-testid` : `sdd-demo`, `sdd-demo-spec`, `sdd-demo-title`, `sdd-demo-clock`) ; le contenu propre à une spécification est un composant `apps/web/components/sdd-demos/spec-xxx.tsx` enregistré dans `registry.ts`.
4. Les actions déclenchées par une page de démonstration passent par des route handlers sous `/api/v1/_dev/…` soumis à la même garde (404 si désactivé).

## Conséquences

Les tests vérifient le 404 sans la variable, avec une valeur autre que `true`, et avec `APP_ENV=production`.
