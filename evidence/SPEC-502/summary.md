# Preuves — SPEC-502 : Correction automatique des briques

- Date : 2026-11-13T00:52:29.508Z
- Commit : 5a267d5
- Spécification : `specs/p5-ia/SPEC-502-correction-automatique-des-briques.md`

## Rapports

- `unit.json`
- `integration.json`
- `e2e.json`
- `e2e.xml`
- `checks.json` (résultat des validations), `acceptance.md` (critères d'acceptation)

## Vidéos

- `video/05-correction-par-le-code-des-six-types-desktop.webm` — SHA-256 6ae2f5e5586b73d1a38b9eb6c500e48965e7e172cc970f87dec426185068c18c (hors Git : Git LFS indisponible, ADR-0050)
- `video/06-correction-par-le-code-des-six-types-desktop.webm` — SHA-256 f456b0b2abbf65cfb6fec8aed28555e8442cc6f41b75bc3483483847566530b9 (hors Git : Git LFS indisponible, ADR-0050)
- `video/10-demonstration-de-correction-desktop.webm` — SHA-256 f9bda6c8b64e0ede2b17e2407cc5cfd6dd58b78f822643469de65fde249db075 (hors Git : Git LFS indisponible, ADR-0050)
- `video/11-demonstration-de-correction-desktop.webm` — SHA-256 88be4c5574d1511e2cac337d32a77a27943718b554097e6eb6d19ed1aa7bab46 (hors Git : Git LFS indisponible, ADR-0050)

## Captures

- `screenshots/` : 4 capture(s) finale(s) des tests
- `visual/` : 0 comparaison(s) maquette ↔ application et diff

## Mesure ET-7

- 1 000 corrections d'une question à choix : 4,82 ms au total, p95 0,0067 ms (mesure locale, test `packages/bricks/src/grade.test.ts`).
