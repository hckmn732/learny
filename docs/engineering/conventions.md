# Conventions de développement

Normatif pour tout le code du dépôt. Les outils qui les imposent sont installés par SPEC-001 et SPEC-002.

## 1. Langages et versions (ADR-0003)

- Node.js 24 LTS (`.nvmrc`, `engines`), pnpm 10 (`packageManager`), TypeScript ≥ 5.9 en mode `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.
- Modules ES partout (`"type": "module"`), résolution `bundler`.
- Versions des dépendances : dernière version stable disponible au moment de l'installation, figées par `pnpm-lock.yaml`. Majeures minimales : Next.js 15, React 19, Tailwind CSS 4, Drizzle ORM 0.44, Zod 4 (repli 3.25 si incompatibilité documentée en ADR), Vitest 3, Playwright 1.50, Inngest SDK 3, AI SDK 5, ts-fsrs 5, Supabase CLI 2. Toute dérogation est consignée par un ADR.

## 2. Style

- Prettier (largeur 100, guillemets simples, virgules finales) ; ESLint (config plate) : `typescript-eslint` strict, `react-hooks`, `jsx-a11y`, `import` (ordre, cycles interdits, frontières de paquets cf. `docs/architecture/overview.md` §3), `no-restricted-syntax` interdisant `Date.now()`/`new Date()` hors `packages/core/src/clock.ts`.
- Nommage : fichiers `kebab-case.ts`, composants React `PascalCase.tsx`, fonctions et variables `camelCase`, constantes `SCREAMING_SNAKE_CASE`, types `PascalCase`. Code et commentaires en anglais ; textes d'interface en français (fichier de messages, §5).
- Fonctions pures dès que possible ; pas d'exceptions pour le contrôle de flux métier : `Result<T, AppError>` (`packages/core/src/result.ts`) dans les services ; les route handlers convertissent en `problem+json`.
- Aucune valeur métier en dur dans le code : les défauts et bornes viennent de `packages/config/src/product.ts` (miroir de `docs/product/business-rules.md`).

## 3. Arborescence d'un paquet

```
packages/<nom>/
  package.json        (name: @learny/<nom>, exports, scripts: build?, test, lint, typecheck)
  src/index.ts        (API publique uniquement)
  src/**              (code)
  src/**/*.test.ts    (tests unitaires, à côté du code)
  test/integration/** (tests d'intégration)
  README.md           (rôle, API publique, exemples)
```

## 4. Frontend

- App Router ; Server Components par défaut ; `"use client"` seulement pour l'interactivité.
- Composants d'interface **uniquement** depuis `@learny/ui` ; un écran ne définit pas ses propres boutons, champs, onglets, etc.
- Styles : Tailwind CSS 4 avec les jetons de `@learny/ui/tokens` ; aucune couleur, taille ou rayon hors jetons ; pas de styles en ligne sauf valeurs dynamiques (largeurs de barres, positions du graphe).
- Chaque élément interactif ou vérifié par un test porte `data-testid` en `kebab-case` (`data-testid="quiz-submit"`) ; les tests préfèrent `getByRole`/`getByLabel`, `data-testid` en dernier recours.
- États obligatoires pour toute donnée asynchrone : chargement (squelette), vide (EmptyState), erreur (message + réessayer).
- Accessibilité : rôles ARIA corrects (onglets, menus, dialogues, interrupteurs `role="switch"`, groupes), focus visible, gestion du focus à l'ouverture/fermeture des panneaux, `aria-live` pour les mises à jour asynchrones.

## 5. Textes et langue

- Interface en français ; tous les libellés dans `apps/web/messages/fr.ts` (objet typé par écran), y compris les textes repris des maquettes. Typographie française : espace insécable avant `: ; ! ? %` et dans « », apostrophe typographique `’` dans les contenus, guillemets « ».
- Les formats : `Intl.DateTimeFormat('fr-FR', { timeZone })`, nombres `Intl.NumberFormat('fr-FR')`, durées « 1 h 30 ».
- Les textes produits par le tuteur respectent le ton (`vous`/`tu`) et la langue des cours.

## 6. Temps

- Toutes les dates sont stockées en UTC (`timestamptz`), affichées et planifiées dans le fuseau de l'utilisateur (`packages/core/src/time.ts` : `toUserZone`, `startOfUserDay`, `isQuietHours`, `userLocalHour`).
- L'horloge passe par `clock.now()` (injectable). Les tests fixent l'horloge (ADR-0047).

## 7. Base de données

- Accès uniquement via `packages/db` (Drizzle). Deux clients : `userDb(ctx)` (JWT de l'utilisateur → RLS appliquée) et `serviceDb()` (rôle service, réservé aux jobs et aux opérations système explicitement listées dans la spécification qui l'utilise).
- Toute écriture multi-tables dans une transaction. Migrations jamais modifiées après fusion : on ajoute une nouvelle migration.

## 8. Journalisation et erreurs

- `logger` (pino) de `packages/core` : niveau `info` en production, champs `requestId`, `userId` (jamais d'e-mail, de clé, de contenu d'apport), `spec` facultatif.
- Erreurs inattendues → Sentry (SPEC-010) ; erreurs métier → `AppError` avec `code`.

## 9. Sécurité

- Secrets uniquement côté serveur ; seules les variables `NEXT_PUBLIC_*` listées dans `packages/config` atteignent le navigateur.
- Entrées utilisateur toujours validées par Zod ; rendu Markdown du cours via `react-markdown` + `rehype-sanitize` (aucun HTML brut).
- Contenus d'apports transmis aux modèles uniquement dans des balises de données (BR-IA-10).

## 10. Pages de démonstration SDD (ADR-0049)

Chaque spécification sans écran métier propre expose une page `apps/web/app/_dev/sdd/[specId]/page.tsx` (rendue seulement si `ENABLE_SDD_PAGES=true`, jamais en production) qui exerce la capacité livrée et en affiche le résultat de façon lisible ; c'est elle que filme le test end-to-end de la spécification.
