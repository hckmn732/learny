# SPEC-1002 — critères d'acceptation

- ✅ **CA-1** — `evidence/SPEC-1002/unit.json` contient 7 tests de portabilité réussis :
  les six entrées `contracts`, `core` (`.`), `api-client`, `domain`, `i18n` et
  `learning-engine` se construisent sans module Node ni paquet serveur, tandis que le cas
  négatif `node:fs` ajouté à `@learny/domain` est détecté.
- ✅ **CA-2** — les 17 tests `[SPEC-1002]` de `unit.json` et la suite unitaire complète
  (3 558/3 558 tests) réussissent. `integration.json` confirme 1/1 test d'intégration. Les
  assertions des modules déplacés sont inchangées.
- ✅ **CA-3** — le test `[SPEC-1002] boundary` de `unit.json`, `pnpm lint` et le rapport
  `node tools/migration/report.mjs` réussissent. La liste de référence diminue de 80 à
  75 fichiers et le nombre de composants client couplés de 6 à 4.
- ✅ **CA-4** — les tests `[SPEC-1002] api client` de `unit.json` vérifient `baseUrl`,
  les en-têtes synchrones et asynchrones, `problem+json`, la relance unique après 401
  avec nouveaux en-têtes, l'absence de seconde relance et la réutilisation de la clé
  d'idempotence.
- ✅ **CA-5** — `e2e.json` et `e2e.xml` comptent 3/3 parcours réussis, 2 tests
  `@visual`, axe sans anomalie serious/critical et 6 vidéos dans `evidence/SPEC-1002/video/`.
  La démonstration affiche « Statut : ok » et reçoit l'identifiant de requête ; les captures
  desktop (1440×900) et mobile (390×844) correspondent aux deux baselines ajoutées.

## Preuves complémentaires (§13)

- Portabilité : sortie Vitest détaillée dans `unit.json` (six paquets plus cas négatif).
- Différence de la liste de référence : avant `80 fichiers / 6 composants client couplés`,
  après `75 fichiers / 4 composants client couplés`. Cinq fichiers quittent effectivement
  la baseline : `components/home/home-view.tsx`,
  `components/offline/OfflineQuizGlobal.tsx`, `components/final-review/Stats.tsx`,
  `components/final-review/FinalReviewScreen.tsx` et
  `components/final-review/MilestoneList.tsx`.
- TutorActivityCard et WarmupCard restent couplés hors périmètre EF-3 par leurs imports
  `@learny/services/home/…` (`accueil-le-tuteur-a-agi…`) et `warmup/derive`.
- `@learny/domain` importe `@learny/bricks` pour `opaqueMapping` dans `game-response` :
  cet écart ADR-1007 est accepté car `bricks` est pur et déjà bundlé côté client ; il est
  consigné dans le bloc ESLint des dépendances autorisées.
- `apps/web/messages/fr/bricks.ts` et `bricks-settings.ts` restent dans le web car
  `bricks.ts` importe `@learny/bricks/view`, ce qui préserverait l'invariant
  « i18n n'importe rien » de façon incorrecte s'ils étaient déplacés.
- ET-5 de `@learny/core/server` n'est pas déclenché : les accès pino/AsyncLocalStorage ne
  sont atteints que par des réexportations `type`, et le test de portabilité de l'entrée
  `.` est vert.
