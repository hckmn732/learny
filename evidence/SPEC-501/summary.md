# Preuves — SPEC-501 : Paquet bricks : registre, schémas et validation

- Date : 2026-11-13T00:23:16.183Z
- Commit : 831db82
- Spécification : `specs/p5-ia/SPEC-501-paquet-bricks-registre-schemas-et-validation.md`

## Rapports

- `unit.json`
- `integration.json`
- `e2e.json`
- `e2e.xml`
- `checks.json` (résultat des validations), `acceptance.md` (critères d'acceptation)

## Mesure de performance (ET-10)

- `validateBrick` d'une question à choix sans référence : **p95 = 0,1312 ms** sur 1 000 exécutions
  (`pnpm exec tsx` sur `validateBrick` + résolveur en mémoire, même jeu que le test unitaire
  `[SPEC-501]` « valide une brique sans référence en moins de 2 ms »).

## Vidéos

- `video/06-validation-et-cycle-de-vie-d-une-brique-desktop.webm` — SHA-256 098a08b5e1ff283293e7c5c11e5b9bdb490eebba3942d4019f957a68efbfcbf0 (hors Git : Git LFS indisponible, ADR-0050)
- `video/07-validation-et-cycle-de-vie-d-une-brique-desktop.webm` — SHA-256 6e7ebbb3abade9dd426b782708280ee4753470905875887fa5063c9c46258231 (hors Git : Git LFS indisponible, ADR-0050)
- `video/11-conformite-visuelle-de-la-demonstration-spec-501-desktop.webm` — SHA-256 3bed829a74f934f78a5fa8b113a1fc6b09bd5528d43b406203b85c4f0416ac43 (hors Git : Git LFS indisponible, ADR-0050)
- `video/12-conformite-visuelle-de-la-demonstration-spec-501-desktop.webm` — SHA-256 25c5f6e5602584f444ee656a39174afe81296d17dd55148e866178d65dad38be (hors Git : Git LFS indisponible, ADR-0050)

## Captures

- `screenshots/` : 5 capture(s) finale(s) des tests
- `visual/` : 0 comparaison(s) maquette ↔ application et diff
