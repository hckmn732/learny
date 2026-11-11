# ADR-0221 — Versions retenues à l'installation de SPEC-001

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-001, ADR-0003

## Contexte

ADR-0003 et conventions.md §1 demandent la dernière version stable. Au 2026-11-11, TypeScript 7.0.2 et ESLint 10.14 sont publiés, mais typescript-eslint 8.72 exige typescript <6.1 et eslint-plugin-import 2.32 ainsi qu'eslint-plugin-jsx-a11y 6.10 exigent eslint ^9 (dépendances pairs non satisfaites). @types/node 26 décrit une version de Node postérieure à Node 24 LTS imposé.

## Décision

Retenir les dernières versions compatibles entre elles : typescript 6.0.x, eslint 9.x et @eslint/js 9.x, @types/node 24.x. Les autres dépendances sont à leur dernière version stable (next 16.4, react 19.3, tailwindcss 4.3, vitest 5.1, @playwright/test 1.65, turbo 2.11, zod 4.6, typescript-eslint 8.72, prettier 3.10), figées par pnpm-lock.yaml.

## Conséquences

Montée vers TypeScript 7 et ESLint 10 dès que typescript-eslint et les plugins import et jsx-a11y les prennent en charge ; dérogation consignée ici.
