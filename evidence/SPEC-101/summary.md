# Preuves — SPEC-101 : Paquet db : Drizzle, migrations et harnais de test

- Date : 2026-11-11T23:48:15.324Z
- Commit : f827729
- Spécification : `specs/p1-donnees/SPEC-101-paquet-db-drizzle-migrations-et-harnais-de-test.md`

## Rapports

- `unit.json`
- `integration.json`
- `e2e.json`
- `e2e.xml`
- `checks.json` (résultat des validations), `acceptance.md` (critères d'acceptation)

## Vidéos

- `video/04-page-de-demonstration-du-paquet-db-desktop.webm` — SHA-256 2dda9e8ad04264b1c04e1d06516d7e0f3f3e8fe6fe06e65702af4c40f0b1355e (hors Git : Git LFS indisponible, ADR-0050)
- `video/05-page-de-demonstration-du-paquet-db-desktop.webm` — SHA-256 47f8f83d095b1daa4d3fda764c1538667bd628f246fef1a3efa86ed21543898b (hors Git : Git LFS indisponible, ADR-0050)
- `video/09-page-db-conforme-desktop.webm` — SHA-256 cb603eb9f8bd31b3e3c64944a00ecc6e2158c9c5f4eba9fb94c82a4862a7f8e1 (hors Git : Git LFS indisponible, ADR-0050)
- `video/10-page-db-conforme-desktop.webm` — SHA-256 8bc89dfdb226d0ae1c01385d86de667eff692e70cc99826e6affa4a9348aaeb2 (hors Git : Git LFS indisponible, ADR-0050)

## Captures

- `screenshots/` : 3 capture(s) finale(s) des tests
- `visual/` : 0 comparaison(s) maquette ↔ application et diff

## Mesure de latence (CA-7, ET-10)

- 50 itérations de `userDb(...).run(tx => tx.execute(sql\`select 1\`))` sur la base Supabase locale.
- p50 = 0,626 ms · p95 = 0,781 ms · max = 8,167 ms · seuil p95 < 15 ms respecté.
- Mesure brute : `latency.json` ; test d'intégration « opens a userDb transaction and runs a trivial query under 15 ms p95 (CA-7) ».

## Migrations

- `pnpm db:check` réussi (`drizzle-kit check` + 2 migrations identiques) : sortie complète dans `db-check.txt`.
