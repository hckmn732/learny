# Preuves — SPEC-103 : Schéma formations, programme et notions

- Date : 2026-11-12T01:13:03.922Z
- Commit : 7a91e43
- Spécification : `specs/p1-donnees/SPEC-103-schema-formations-programme-et-notions.md`

## Rapports

- `unit.json`
- `integration.json`
- `e2e.json`
- `e2e.xml`
- `checks.json` (résultat des validations), `acceptance.md` (critères d'acceptation)

## Vidéos

- `video/04-programme-et-contraintes-desktop.webm` — SHA-256 23ecda1321e11c53b8ddfbaa84d3fab3ddf4ebf0288b2fd440d29205d02fafe9 (hors Git : Git LFS indisponible, ADR-0050)
- `video/05-programme-et-contraintes-desktop.webm` — SHA-256 c55c2b85f374ffeb6ba8e8a7d9f65b7a6f5549a159ba9363801b1169d14fd4dc (hors Git : Git LFS indisponible, ADR-0050)
- `video/09-page-programme-conforme-desktop.webm` — SHA-256 e22816552c963d05cb2140c7963078ced33c37fc054181a1d16d0afc82f14bca (hors Git : Git LFS indisponible, ADR-0050)
- `video/10-page-programme-conforme-desktop.webm` — SHA-256 3c378a2c57bfec132ad5da1e3bef97a84974bba0c11b7540bb2ba7e298520162 (hors Git : Git LFS indisponible, ADR-0050)

## Captures

- `screenshots/` : 3 capture(s) finale(s) des tests
- `visual/` : 0 comparaison(s) maquette ↔ application et diff

## Mesures

- Programme complet (7 modules, 24 chapitres, 48 notions) : `EXPLAIN (ANALYZE, FORMAT JSON)` donne `Execution Time` = 0,085 ms, sous le budget de 20 ms (ET-6, CA-7).
- Recherche plein texte « ecriture » : plan `Bitmap Heap Scan` → `Bitmap Index Scan` sur `notions_fts_idx`, 1 résultat (« Écriture de régularisation ») ; « Équilibre d’une pièce » n'est pas retournée (EF-6, CA-7).
- Contrôles : 7 tests unitaires `[SPEC-103]`, 13 tests d'intégration `[SPEC-103]`, 2 tests e2e `@SPEC-103` dont 1 `@visual`, axe sans violation serious/critical.
