# SPEC-1004 — Table d'implémentation des routes (`@learny/api-routes`)

Branche : `spec/SPEC-1004-table-d-implementation-des-routes` (depuis `migration`).

## 1. Ce qui est livré

| Élément | Fichier / commande |
|---|---|
| Paquet serveur | `packages/api-routes` (`@learny/api-routes`) : `ROUTE_IMPLEMENTATIONS`, `SPECIAL_HANDLERS`, `routeCoverage`, `nextRoute`, `nextSpecial` |
| Table standard | `src/tables.ts` + `src/implementations/*.ts` (42 fichiers de domaine, 142 routes) |
| Gestionnaires spéciaux | `src/special/*.ts` + `src/special/manifest.ts` (32 entrées) |
| Dépendances injectées | `src/deps/*` (env, santé, Sentry, jobs inline, Supabase, onboarding, ressources/push/données personnelles, `http-boot`) |
| Fichiers Next générés | 153 `apps/web/app/api/**/route.ts` (une délégation d'une ligne par méthode) |
| Générateur + contrôle | `tools/migration/generate-next-routes.mjs`, `pnpm migration:routes` / `pnpm migration:routes:check` (appelé par `pnpm lint`) |
| Entrée web | `apps/web/lib/api/next-route.ts` (seul import des fichiers générés) |
| Démonstration | `/_dev/sdd/SPEC-1004` (`apps/web/components/sdd-demos/spec-1004.tsx`) |

Mesures (`node tools/migration/generate-next-routes.mjs --check`, sortie brute dans
`routes-check.txt`) :

- 169 routes au registre `ROUTES` ;
- 142 implémentations standard + 32 gestionnaires spéciaux = 174 entrées pour 169 routes
  (les 5 entrées hors registre sont `/api/inngest`, les 3 outils `_dev` et `sprints`) ;
- 153 fichiers Next attendus, 153 présents, **dérive 0**, 0 doublon, 0 route non couverte.

## 2. Vérifications exécutées sur la VM

| Commande | Résultat |
|---|---|
| `pnpm --filter @learny/api-routes typecheck` | OK |
| `pnpm --filter @learny/web typecheck` | OK |
| `pnpm typecheck` (tous les paquets + outils) | **22/22 tâches réussies** |
| `pnpm --filter @learny/api-routes lint` | OK |
| `pnpm --filter @learny/web lint` | OK |
| `pnpm run lint:root` | OK |
| `pnpm migration:routes:check` | « 153 fichiers présents, 153 attendus. Aucune dérive » |
| `pnpm exec vitest run --project unit -t 'SPEC-1004'` | **13 tests / 13** (`coverage.test.ts` 6, `routes-check.test.ts` 7) |
| `pnpm exec vitest run --project integration apps/web/test/integration/generated-routes.test.ts` | **4 tests / 4** |

## 3. Critères d'acceptation

| Critère | État | Preuve |
|---|---|---|
| CA-1 — une implémentation par route, 100 %, 0 doublon | ✅ | `coverage.test.ts` (registre 169, `uncovered` vide, `duplicates` 0) + typecheck du `satisfies` |
| CA-2 — `migration:routes:check` passe, éditer un fichier généré le fait échouer | ✅ | `routes-check.test.ts` (dérive/orphelin/absent) + `routes-check.txt` |
| CA-3 — suites d'intégration et e2e sans modification d'assertion | ⏳ partiel | `generated-routes.test.ts` (153 modules chargés, méthode par route, santé 200) ; suite d'intégration complète et e2e complète à exécuter par le lead (`validate.mjs`) |
| CA-4 — aucun `route.ts` ne contient de logique | ✅ | `routes-check.test.ts` + `generated-routes.test.ts` (une seule importation, seules des délégations) |
| CA-5 — page de démonstration, couverture complète, dérive nulle | ⏳ partiel | page et e2e écrites (`apps/web/e2e/specs/p10/spec-1004.spec.ts`, `@visual`) ; exécution e2e/visuel à faire par le lead |

## 4. Écarts à la spécification (justifiés)

1. **ET-4 — liste d'imports élargie à `@learny/i18n` et `@learny/ui`.** Le §9 impose de déplacer
   `apps/web/lib/email/unsubscribe-page.ts` dans le paquet : cette page HTML utilise les messages
   `fr` (`@learny/i18n/fr/email`) et les jetons de design (`@learny/ui/tokens`, sous-chemin pur
   listé comme partagé par ADR-1007). La frontière ESLint du paquet autorise donc `i18n` et
   `ui` (seul `ui/tokens` est réellement importé) ; `ui` reste interdit ailleurs.
2. **`/formations/:fid/sprints` absente du registre.** `sprintPlanRoute` (SPEC-719) est exportée par
   `@learny/contracts` mais jamais ajoutée à `ROUTES` : la route existait donc hors registre et
   hors OpenAPI. Pour ne pas modifier le registre dans cette spécification, elle est déclarée comme
   gestionnaire spécial (`formationSprints`, corps standard `routeHandler`) : le fichier généré
   reste couvert (EF-4) et le comportement est identique. La lacune de registre est signalée ici
   pour une spécification ultérieure (ou un correctif dédié).
3. **`apps/web/lib/sentry.ts` déplacé** vers `src/deps/sentry.ts` (non listé au §9) : le boot HTTP
   (`deps/http-boot.ts`, importé par `src/index.ts`) doit conserver le reporter Sentry de SPEC-010
   sans que `next-route.ts` n'importe autre chose que `@learny/http` et `@learny/api-routes`
   (ET-4). `apps/web/lib/sentry.ts` reste un réexport d'une ligne. SPEC-1101 pourra injecter un
   reporter Node/Hono.
4. **Le paquet configure la couche HTTP à l'import** (`deps/http-boot.ts` : reporter, limitation,
   garde d'origine, registre inline) au lieu de `apps/web/lib/api/handler.ts`. Comportement
   identique (le module était importé par chaque route), et `apps/web/lib/api/handler.ts` reste en
   place pour les tests d'intégration qui utilisent la forme `handler({ route }, fn)`.
5. **`nextRoute` / `nextSpecial` acceptent un segment (resp. une requête) facultatif** : les tests
   d'intégration appellent directement les exports des modules générés avec un seul argument (ou
   aucun pour `/health`), comme avant la génération. `handler()` n'a pas été modifié (ET-2).
6. **`src/implementations/ai-usage.ts`** (et non `ai.ts`) : la règle ESLint `no-restricted-imports`
   utilise la sémantique gitignore, où le motif `ai` (SDK fournisseur, SPEC-504) correspond à tout
   segment de chemin `ai` — y compris `@learny/services/ai/qualify`, légitimement importé par les
   routes de qualification. Le fichier de domaine est renommé, la table reste identique.
7. **`apps/web/lib/api/dev-guard.ts` conservé** (réexport d'une ligne de `@learny/http/dev-guard`) :
   plus aucun fichier généré ne l'importe, il reste pour les consommateurs historiques.

## 5. Reste à faire (hors périmètre de cet agent)

- `validate.mjs SPEC-1004` : build, suite d'intégration complète, suite e2e complète (CA-3),
  captures et rapport visuel (CA-5), `checks.json`.
- `complete.mjs SPEC-1004 --no-merge --no-push` puis fusion par le lead.
- Réexécuter `pnpm migration:routes:check` après toute fusion de `main` touchant un `route.ts`
  (procédure déjà écrite dans `docs/engineering/git.md` §1.0).
