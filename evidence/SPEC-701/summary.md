# Preuves — SPEC-701 : Quiz global : session du jour et cartes de rappel

- Date : 2026-11-14T10:34:21.937Z
- Commit : 43871da1
- Spécification : `specs/p7-engagement/SPEC-701-quiz-global-session-du-jour-et-cartes-de-rappel.md`

## Rapports

- `unit.json`
- `integration.json`
- `e2e.json`
- `e2e.xml`
- `checks.json` (résultat des validations), `acceptance.md` (critères d'acceptation)

## Vidéos

- `video/06-session-du-jour-et-carte-de-rappel-desktop.webm` — SHA-256 c38734a8022d7c4a61c10be4934bdde8b89464cfeebde9317ec28338e6e46ee8 (hors Git : Git LFS indisponible, ADR-0050)
- `video/07-session-du-jour-et-carte-de-rappel-desktop.webm` — SHA-256 646fbc135e18bcb15bcaec711c8173697465b745c5f019950e54ab8167596848 (hors Git : Git LFS indisponible, ADR-0050)
- `video/12-ecran-de-fin-de-demonstration-desktop.webm` — SHA-256 72b947c901631a4d032f59b4946a672480fb35391013ed073b166a7f3a5c8e9a (hors Git : Git LFS indisponible, ADR-0050)
- `video/13-ecran-de-fin-de-demonstration-desktop.webm` — SHA-256 ca6311436dbd1efaa62da406af5eda6b7575e5f11add186a770541c1332aadf4 (hors Git : Git LFS indisponible, ADR-0050)
- `video/16-etat-vide-desktop.webm` — SHA-256 61034a810cef18897938afbfb3583974730ea6386ce56b8b9feca6e00d0c9d30 (hors Git : Git LFS indisponible, ADR-0050)
- `video/23-conformite-visuelle-du-quiz-global-desktop.webm` — SHA-256 d4e3b9e668e76a988a106871c8c0515b06f223575b2b02906f6ec969d661b98f (hors Git : Git LFS indisponible, ADR-0050)
- `video/24-conformite-visuelle-du-quiz-global-desktop.webm` — SHA-256 9b5a26d5128e09b74e902d455f7e1bf1ca807dafa74fb18299a2a0fd61b48fff (hors Git : Git LFS indisponible, ADR-0050)

## Captures

- `screenshots/` : 9 capture(s) finale(s) des tests
- `visual/` : 2 comparaison(s) maquette ↔ application et diff

## Mesures

- `GET /api/v1/formations/:fid/global-quiz/today` idempotent sur la session de démonstration : **p95 = 5,75 ms** sur 20 lectures (min 4,73 ms, médiane 5,26 ms, max 5,99 ms), seuil ET-11 de 300 ms respecté.
- Conformité à `SCR-10-base-desktop.png` : **11,07 %** de pixels différents (seuil 12 %, annotation `mockup-diff-ratio` de `e2e.json`).
- Accessibilité axe : **0 violation** sérieuse ou critique sur le recto, le verso, l'écran de fin et la capture visuelle (`attachments/*-axe.json` valent `[]`).
- Aucun appel IA pendant une session : tirage déterministe et banques locales ; la demande de remplissage (CL-7) est une ligne `question_bank_jobs` asynchrone.
