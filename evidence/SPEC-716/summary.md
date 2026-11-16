# Preuves — SPEC-716 : Automatisme 5 : jeu choisi selon la lacune

- Date : 2026-11-16T11:11:07.080Z
- Commit : 1a3a71ae
- Spécification : `specs/p7-engagement/SPEC-716-automatisme-5-jeu-choisi-selon-la-lacune.md`

## Rapports

- `unit.json`
- `integration.json`
- `e2e.json`
- `e2e.xml`
- `checks.json` (résultat des validations), `acceptance.md` (critères d'acceptation)

## Vidéos

- `video/06-raison-du-choix-dans-le-quiz-global-desktop.webm` — SHA-256 f92bdc40d69292188871455c76ee65ed99f0a60a2f7b2316cca743ae70c3ee68 (hors Git : Git LFS indisponible, ADR-0050)
- `video/07-raison-du-choix-dans-le-quiz-global-desktop.webm` — SHA-256 2b2204f570e209a17e4f65616b19f0493b855f40560977385f6930e3088a5870 (hors Git : Git LFS indisponible, ADR-0050)
- `video/11-quiz-global-raison-du-jeu-desktop.webm` — SHA-256 88dd84e63540001da8dbcbf0b6ff7e569bacf03d64f7c8e112b4f877024b911f (hors Git : Git LFS indisponible, ADR-0050)
- `video/12-quiz-global-raison-du-jeu-desktop.webm` — SHA-256 31ebfd658b7b19594e7e5a8a7f604058539a19f17d050bb8086c408495fe5a9f (hors Git : Git LFS indisponible, ADR-0050)

## Captures

- `screenshots/` : 5 capture(s) finale(s) des tests
- `visual/` : 0 comparaison(s) maquette ↔ application et diff

## Mesures CA-4 — préférence de jeux

1 000 tirages déterministes sur 5 formats disponibles (`choice_question`, `cloze`, `matching`, `categorization`, `recall_card`), consignés dans `distribution-ca4.json` :

- préférence `cards` : 430 cartes de rappel (43,0 %), attendu entre 40 % et 60 % (poids 3/7 ≈ 42,9 %) ;
- préférence `vary` : format le plus fréquent 216/1 000 (21,6 %), sous le plafond de 30 %.
