# Tests, validation et preuves

Normatif. Le socle est livré par SPEC-001 (minimal) et SPEC-004 (complet). Une spécification n'est **terminée** que si toutes ses validations obligatoires passent (§7).

## 1. Niveaux de tests

| Niveau | Outil | Emplacement | Commande | Contenu |
|---|---|---|---|---|
| Unitaire | Vitest | `**/src/**/*.test.ts(x)` | `pnpm test:unit` | fonctions pures, composants (Testing Library), schémas |
| Intégration | Vitest (projet `integration`) | `**/test/integration/**/*.test.ts` | `pnpm test:int` | services + base réelle (Supabase local), RLS, jobs Inngest (exécution directe des handlers), API (route handlers via `next-test-api-route-handler` ou appels HTTP sur serveur de test) |
| End-to-end | Playwright | `apps/web/e2e/specs/**/*.spec.ts` | `pnpm test:e2e` | parcours navigateur réels sur `next start`, base locale réinitialisée et ensemencée |
| Visuel | Playwright | dans les tests e2e, étiquette `@visual` | `pnpm test:visual` | conformité aux maquettes et non-régression (§6) |
| Accessibilité | `@axe-core/playwright` | dans les tests e2e | inclus dans `test:e2e` | aucune violation `serious`/`critical` sur les pages testées |

Pyramide visée : unitaire ≥ 80 % de couverture de lignes sur `learning-engine`, `bricks`, `core`, `llm/budget` ; ≥ 70 % sur `services` ; les autres paquets sans seuil mais chaque comportement d'une spécification a au moins un test.

## 2. Étiquetage par spécification

- Vitest : chaque fichier de test commence par un `describe('[SPEC-402] …')`. Filtre : `pnpm test:unit -t "SPEC-402"`.
- Playwright : chaque test porte l'étiquette `@SPEC-402` dans son titre (`test('… @SPEC-402', …)`) ; les tests visuels portent aussi `@visual`. Filtre : `pnpm test:e2e --grep @SPEC-402`.
- Un test peut porter plusieurs étiquettes s'il couvre plusieurs spécifications ; la non-régression d'une spécification antérieure se fait en rejouant ses étiquettes.

## 3. Données et environnement de test

- Base : Supabase local (Docker). `pnpm db:reset` (migrations + `supabase/seed.sql` minimal) avant la suite d'intégration ; chaque test d'intégration s'exécute dans une transaction annulée (`withRollback`) ou utilise des utilisateurs créés par fabrique avec un suffixe unique.
- Fabriques : `packages/testing/src/factories/*.ts` (utilisateur, formation complète, module, notions, tentatives…).
- Jeu de démonstration (SPEC-115) : `pnpm db:seed:demo` charge les données des maquettes (Alex Perrin, SAP S/4HANA Finance…). Les tests e2e des écrans maquettés l'utilisent.
- Horloge figée (ADR-0047) : e2e → `page.clock.setFixedTime(new Date('2026-11-11T12:20:00Z'))` (13:20 à Paris) et serveur démarré avec `CLOCK_FIXED_AT=2026-11-11T12:20:00Z` ; unitaires → `createFixedClock()`.
- IA : `LLM_MODE=mock` obligatoire en test ; les fixtures de `packages/llm/fixtures/` couvrent chaque scénario testé (ADR-0048).
- E-mails : Mailpit (dev) / transport `memory` (tests) inspectable via `packages/testing/src/mail.ts`.
- Navigateurs : Chromium (obligatoire) ; Firefox et WebKit dans le projet `cross-browser` exécuté aux checkpoints CP-6, CP-7, CP-8.

## 4. Configuration Playwright (SPEC-004)

`apps/web/playwright.config.ts` : `use: { baseURL, trace: 'on', video: 'on', screenshot: 'on', viewport: { width: 1440, height: 900 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' }` ; projets `desktop` (1440×900) et `mobile` (390×844, `isMobile`) ; reporters `list`, `json` (`test-results/playwright.json`), `junit` (`test-results/playwright.xml`), `html` (`test-results/html`, ouvert jamais). `outputDir: test-results/artifacts`.

## 5. Preuves (evidence)

Après une validation réussie, `node tools/sdd/evidence.mjs SPEC-xxx` (appelé par `validate.mjs`) produit `evidence/SPEC-xxx/` :

```
evidence/SPEC-xxx/
  summary.md          résumé : date, commit, résultat par validation, liens vers les fichiers
  acceptance.md       chaque critère d'acceptation de la spec : ✅/❌ + preuve (test, capture, mesure)
  unit.json           rapport Vitest (JSON) filtré sur la spec
  integration.json    rapport Vitest d'intégration
  e2e.json, e2e.xml   rapports Playwright
  video/*.webm        vidéos Playwright des tests @SPEC-xxx (au moins une)
  screenshots/*.png   captures finales de chaque test, et captures demandées par la spec
  visual/*.png        comparaisons maquette ↔ application (côte à côte) et diff
  checks.json         résultats lint, typecheck, couverture, axe
```

- Les vidéos sont suivies par Git LFS (`.gitattributes`). Si Git LFS est indisponible, `evidence.mjs` les écrit quand même, les ajoute à `.git/info/exclude`, et consigne leur empreinte SHA-256 dans `summary.md` ; ce n'est pas un blocage (ADR-0050).
- Rien n'est inventé : une preuve manquante = validation en échec.

## 6. Conformité visuelle (ADR-0034)

Trois contrôles automatisés, pour chaque écran couvert par une spécification :
1. **Jetons** : `expectTokens(page, selectors)` (`packages/testing/src/visual.ts`) vérifie les styles calculés des éléments clés (couleurs exactes des jetons, familles Space Grotesk/Inter, tailles, rayons) contre `@learny/ui/tokens`.
2. **Structure** : la spécification liste les régions et éléments obligatoires de l'écran (repris de la maquette) ; le test vérifie leur présence, leur ordre et leurs textes.
3. **Comparaison maquette** : capture de l'application et capture de référence (`design/references/<SCR>-desktop.png`, générée depuis la maquette avec la même horloge et le même jeu de données) → image côte à côte + diff (`pixelmatch`) enregistrées dans `evidence/<SPEC>/visual/`. Le taux de pixels différents est mesuré et doit rester ≤ 12 % (seuil de conformité structurelle, ADR-0034 ; les écarts de rendu de polices et d'anticrénelage sont tolérés). Un écart supérieur échoue.
4. **Non-régression** : une fois la spécification validée, `toHaveScreenshot()` fige l'apparence de l'application (`apps/web/e2e/__screenshots__/`, `maxDiffPixelRatio: 0.01`) ; toute spécification ultérieure qui la modifie doit mettre à jour la ligne de base en le justifiant dans son rapport.

Pour les écrans sans maquette (SCR-16 à 20) et les pages de démonstration SDD, seuls les contrôles 1, 2 et 4 s'appliquent.

## 7. Définition de « terminé » (commune à toutes les spécifications)

1. Tous les critères d'acceptation de la spécification sont vérifiés et cochés dans `evidence/<SPEC>/acceptance.md`.
2. `pnpm lint`, `pnpm typecheck`, `pnpm build` passent sur tout le dépôt.
3. Tests unitaires, d'intégration et e2e étiquetés `@SPEC-xxx` passent ; au moins un test e2e avec vidéo existe.
4. Contrôles visuels (§6) passent pour les écrans concernés ; axe sans violation serious/critical.
5. Non-régression : `pnpm test:unit`, `pnpm test:int` complets et les e2e de la phase en cours passent.
6. Preuves générées (§5) ; `progress/state.json` mis à jour ; commit(s) conformes à `docs/engineering/git.md`.
