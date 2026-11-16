
# SPEC-713 — critères d'acceptation

- ✅ CA-1 — Au tick de 20 h d'un jour d'étude sans activité, une action `micro_session_proposed` `applied`, un créneau `micro_session` de 5 min à 20:00 et une notification au texte d'EF-4 sont créés. Preuves : intégration `packages/automations/test/integration/micro-seance.test.ts` → « CA-1 — au tick de 20 h, action, créneau de 5 min et notification » ; capture `screenshots/` `notification-micro`.
- ✅ CA-2 — Si une activité qualifiante a eu lieu dans la journée, ou si le jour n'est pas prévu, ou si l'automatisme est désactivé, ou en pause globale, rien n'est créé. Preuves : intégration « CA-2 — activité faite, jour non prévu, automatisme coupé, pause ou aucune notion » ; unitaires `packages/automations/src/micro-seance/should-propose.test.ts` (CL-5, CL-9, CL-10).
- ✅ CA-3 — Le lien de la notification ouvre le quiz global en mode micro avec le mode sélectionné et la durée réglée (3, 5 ou 10 min). Preuves : e2e `apps/web/e2e/specs/p7/automations/micro-seance.spec.ts` → « micro-séance proposée puis faite » (URL `?mode=micro`, `aria-pressed="true"`, « Micro-séance · 5 min ») ; visuel « quiz global en mode micro, jetons et structure » ; intégration EF-1/EF-8 (3 min).
- ✅ CA-4 — Terminer la micro-séance passe l'action `consumed`, le créneau `done`, le jour `qualifying = true` et la série n'est pas interrompue. Preuves : intégration « CA-4 — la micro-séance faite consomme, termine le créneau et garde la série » (série 5 → 6, refus 422 ensuite) ; e2e (action `consumed`, créneau `done`, journée qualifiante, carte d'accueil `accueil-micro-faite`).
- ✅ CA-5 — Non faite à minuit, l'action est `expired` et le créneau `missed` ; l'annulation avant consommation retire le créneau. Preuves : intégration « CA-5 — à minuit l'action expire… ; l'annulation avant consommation retire le créneau » ; unitaires `explain` (`expired`, `undone`).
- ✅ CA-6 — Un tick rejoué le même jour ne crée aucun doublon ; une notification hors application en heures calmes est supprimée après expiration. Preuves : intégration « CA-6 — un tick rejoué ne duplique rien ; heures calmes à 21 h puis livraison supprimée » et « CA-6 — plafond atteint » (livraisons `deferred_quiet` puis `skipped_pref`/`stale`, plafond `capped`).
- ✅ CA-7 — Les textes d'explication respectent les deux tons et les quatre statuts. Preuves : unitaires `packages/automations/src/definitions/micro-seance.test.ts` (`applied` vous/tu, `consumed`, `expired`, `undone`, carte d'accueil et dernière action) ; e2e/captures montrant les textes réels.

## Validations

- `unit` : condition pure EF-2 (CL-5, CL-9, CL-10), quatre statuts et deux tons d'`explain`, textes de carte et de dernière action.
- `integration` : base Postgres réelle, moteur, index de déduplication, créneau `micro_session`, notification, consommation par la session micro, série, expiration/minuit, annulation, heures calmes et plafond.
- `e2e` : parcours Playwright avec vidéo (`video/micro-seance.webm`), captures `notification-micro`, `quiz-global-micro`, `accueil-micro-faite`, axe sans violation.
- `visual` : jetons du mode micro et de la pastille de révision, structure §10, ligne de base `quiz-global-micro.png` (≤ 1 %), comparaison maquette par les captures `visual/`.
