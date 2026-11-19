# SPEC-1003 — critères d'acceptation

- ✅ **CA-1** — `unit.json` passe le test `[SPEC-1003] no next import`; `pnpm lint`
  applique le dernier bloc ESLint sur tout `packages/http/**` et interdit `next`,
  `next/*`, `NextRequest` et `request.nextUrl`.
- ✅ **CA-2** — `api-regression.json` passe les 58 assertions inchangées de
  `api-handler`, `rate-limit`, `security-headers`, `observability` et `public-routes`.
  `integration.json` ajoute 1/1 test de parité. Aucun fichier `route.ts` ni assertion
  existante n'a été modifié.
- ✅ **CA-3** — les 5 tests `[SPEC-1003]` de `unit.json` construisent des `Request`
  standard sans serveur et vérifient statut, validation, `problem+json` et
  `X-Request-Id`. Le test d'intégration compare `@learny/http` direct au handler Next.
- ✅ **CA-4** — `handler.test.ts` prouve que les registres restent sur les implémentations
  no-op à l'import, puis que `configureHttp` enregistre et remplace les protections et
  exécute `onBoot`.
- ✅ **CA-5** — `e2e.json` compte 3/3 parcours, 2 visuels desktop/mobile, axe sans
  violation serious/critical et 6 vidéos. La démo affiche 201/400/400 et
  `X-Request-Id : présent` pour les trois cas.

## Table de parité (§13)

| Cas | @learny/http direct | Adaptateur Next | Content-Type | Code |
|---|---:|---:|---|---|
| Requête valide | 201 | 201 | `application/json; charset=utf-8` | — |
| Corps invalide | 400 | 400 | `application/problem+json; charset=utf-8` | `VALIDATION_FAILED` |
| Idempotency-Key absent | 400 | 400 | `application/problem+json; charset=utf-8` | `IDEMPOTENCY_KEY_REQUIRED` |

Le statut 201 est celui du contrat `dev.echo` inchangé ; ADR-1008 résout l'écart entre ce
contrat et les valeurs 200/400/400 initialement citées par la spécification.

## Frontière web

`node tools/migration/report.mjs --write-baseline` réduit la référence de 75 à 72 fichiers.
Les réexportations `apps/web/lib/api` conservent les importeurs de transition ; la logique,
l'idempotence et les protections vivent dans `packages/http`.
