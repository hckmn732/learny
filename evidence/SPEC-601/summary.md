# Preuves — SPEC-601 : Inscription, connexion et vérification de l'e-mail

- Date : 2026-11-13T06:07:27.898Z
- Commit : c630476
- Spécification : `specs/p6-parcours/SPEC-601-inscription-connexion-et-verification-de-l-e-mail.md`

## Rapports

- `unit.json`
- `integration.json`
- `e2e.json`
- `e2e.xml`
- `checks.json` (résultat des validations), `acceptance.md` (critères d'acceptation)

## Vidéos

- `video/04-inscription-par-lien-magique-jusqu-aux-premiers-pa-desktop.webm` — SHA-256 c57efb8b705ffbf556877b9b6906b3d4d7835d4d86f03475a6d3e758f0816c13 (hors Git : Git LFS indisponible, ADR-0050)
- `video/05-inscription-par-lien-magique-jusqu-aux-premiers-pa-desktop.webm` — SHA-256 e2ffe2a474a14d5557f260804ff22f419ced83afe46a8deef7eab11b50bc8597 (hors Git : Git LFS indisponible, ADR-0050)
- `video/10-inscription-par-mot-de-passe-et-solidite-desktop.webm` — SHA-256 16249c3dcb1050a7277cd80db2345c3974a6dcad41448b0244f02a4d514c1942 (hors Git : Git LFS indisponible, ADR-0050)
- `video/11-inscription-par-mot-de-passe-et-solidite-desktop.webm` — SHA-256 c48fc70f6dd8b5ec770af7dfac66a7b5d69d3f594047348133228624a2d00ed7 (hors Git : Git LFS indisponible, ADR-0050)
- `video/17-renvoi-limite-a-60-s-desktop.webm` — SHA-256 c6f549a1b7aee5621a770651a7abe464f86fcdb76a5fe015a2f7164b950d7cb7 (hors Git : Git LFS indisponible, ADR-0050)
- `video/18-renvoi-limite-a-60-s-desktop.webm` — SHA-256 05ff6c6dd26d3ec713d3faf235b722a6f7364dd076917d4ead5a16acc68185a8 (hors Git : Git LFS indisponible, ADR-0050)
- `video/23-connexion-par-mot-de-passe-erreurs-et-lien-expire-desktop.webm` — SHA-256 143fdc4fdf8f638e4b68ae578a17dcaf22c74e8517a3449478fb1a70c2ddbb53 (hors Git : Git LFS indisponible, ADR-0050)
- `video/24-connexion-par-mot-de-passe-erreurs-et-lien-expire-desktop.webm` — SHA-256 f91fbe4f9852e919b4e5942abd58b7ad08028cdbf7e8c6af75017becc8395d3a (hors Git : Git LFS indisponible, ADR-0050)
- `video/38-conformite-scr-01-compte-connexion-et-verification-desktop.webm` — SHA-256 e70db7a399a628f657d6f8a70d456f92ad5ae44f20267411feb238aae12c310c (hors Git : Git LFS indisponible, ADR-0050)
- `video/39-conformite-scr-01-compte-connexion-et-verification-desktop.webm` — SHA-256 2a89096bd7216bc6774dd262eea9e5d6b9633745c4cb47304718b5339ba4766a (hors Git : Git LFS indisponible, ADR-0050)
- `video/42-conformite-scr-01-mobile-desktop.webm` — SHA-256 a0297e2177f21acf11360ffb4c1fa17f41df1da3552293ac104b32af8fb23698 (hors Git : Git LFS indisponible, ADR-0050)
- `video/47-conformite-scr-01-mobile-mobile.webm` — SHA-256 d805c0532f32ebe57293d77f1d7bf23a9309eac2ad3ce886623462b02bbf7422 (hors Git : Git LFS indisponible, ADR-0050)
- `video/48-conformite-scr-01-mobile-mobile.webm` — SHA-256 783f1ed600cad4868766bd50fad5e52db31ff035f2e39ed9f7162869a3a1cb93 (hors Git : Git LFS indisponible, ADR-0050)

## Captures

- `screenshots/` : 17 capture(s) finale(s) des tests
- `visual/` : 6 comparaison(s) maquette ↔ application et diff

## Mesure JavaScript (ET-9)

Le manifeste client de `/inscription` référence les mêmes 14 fragments que les autres pages
authentifiées. Comparé à la page statique `/hors-ligne`, le code propre aux écrans d'authentification
(`AccountForm`, `VerifyEmailCard`, `ChoiceGroup`, contrats et messages) représente **7,0 ko gzip**
(2 fragments : 1,5 ko et 5,5 ko), très en dessous de la limite de 60 ko. Le total du lot de fragments
de la route, framework React/Next compris, est de 247,9 ko gzip ; aucune requête base n'est faite au
rendu des trois pages.
