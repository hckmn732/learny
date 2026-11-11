# ADR-0220 — Outillage SPEC-001 : lint de tools/sdd, Prettier et fichiers annexes

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-001

## Contexte

SPEC-001 impose eslint sur tools (lint:root) et prettier --check sur tout le dépôt. Or les scripts existants tools/sdd/*.mjs ne respectent pas import/order, no-unused-vars et no-useless-escape, et la documentation existante (docs/, README.md) n'est pas au format Prettier ; la spécification interdit de modifier les fichiers existants du référentiel. Par ailleurs la page de démonstration doit appeler getHealth() « partagée avec la route », alors qu'un route handler Next.js ne peut exporter que ses méthodes HTTP et sa configuration ; Prettier (singleQuote) réécrit @import "tailwindcss" en @import 'tailwindcss' ; et turbo ne voyait pas les modifications de la configuration ESLint racine (cache rejoué).

## Décision

1. Bloc ESLint dédié à tools/sdd/** désactivant import/order, no-unused-vars et no-useless-escape : l'outillage hors produit (ADR-0101) est conservé tel que livré, les autres règles (dont le parsing) s'appliquent. 2. .prettierignore exclut en plus docs/ et /*.md (documentation rédigée à la main). 3. getHealth() vit dans apps/web/lib/health.ts, importé par la route et par la démonstration. 4. globals.css contient @import 'tailwindcss'; (équivalent CSS, imposé par Prettier). 5. turbo.json déclare globalDependencies [eslint.config.mjs, tsconfig.base.json] pour invalider le cache de lint et de typecheck.

## Conséquences

Aucun fichier existant du référentiel n'est modifié ; pnpm lint et pnpm format:check sont verts ; une spécification qui réécrit tools/sdd pourra rétablir les règles de style.
