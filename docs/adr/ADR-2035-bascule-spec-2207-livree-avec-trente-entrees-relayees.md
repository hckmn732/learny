# ADR-2035 — Bascule SPEC-2207 livrée avec trente entrées relayées

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-22
- **Liens** : SPEC-2207, ADR-2019, ADR-2023

## Contexte

SPEC-2207 EF-4 et CA-1 demandent que la façade ne relaie plus aucune entrée. Les huit tranches
livrent **190 des 217 opérations**, **29 des 32 routes spéciales**, les **23 consommateurs** et les
**deux crons** en Python, mais **27 opérations** (les 26 démonstrations `dev.sdd.spec-*` et
`home.get`) et **3 routes spéciales** restent `ts`. Chacune a une raison mesurée, consignée au
handover §8 et §9.2 :

- les fabriques de `@learny/db/testing` (`createTestUser`, `createTestProgramme`, `asUser`) et les
  dépôts `@learny/db` qu'elles composent n'existent pas en Python — dix démonstrations d'état ;
- les services `@learny/llm` (`resolveModel`, `createSession`) et `@learny/tutor`
  (`buildTutorDemo`, `suggestResource`, `decideResourceSuggestion`, `searchWeb`) ne sont pas
  portés, et `createBrick`/`getPublicBrick` manquent — onze démonstrations d'action ;
- cinq pages rejouent un pipeline d'ingestion ou de notation réel dans une transaction annulée,
  au-delà d'une démonstration ;
- `home.get` est un agrégat de dix-huit lectures SQL sans aucun oracle dans `api/inventory.json`
  (ADR-2023, toujours ouverte) ;
- les trois routes spéciales exigent respectivement `@commitlint/config-conventional` (embarquer
  une bibliothèque Node a été écarté), l'adaptateur d'étapes `executeDirect` de l'outillage de
  démonstration, et `planSprintsBeforeMilestones`, un service de 857 lignes (automatisme 8).

## Décision

La bascule est livrée avec ces **trente entrées encore relayées**, listées et justifiées dans
`evidence/SPEC-2207/acceptance.md` et dans la page `/_dev/sdd/SPEC-2207`. **CA-1 est satisfait au
sens de l'absence de régression** (modèle ADR-2019, précédent CP-20) et non au sens littéral de
« plus aucun relais » : les consommateurs, les crons, 190 opérations et 29 routes spéciales sont
servis par Python, et les 30 entrées différées répondent toujours, par le relais de la façade.
Aucune n'est une régression fonctionnelle ; toute entrée portée plus tard retire sa ligne du
tableau et de la page.

## Conséquences

Aucune assertion d'oracle, aucun libellé et aucune ligne de base ne sont modifiés. La façade
continue de relayer ces 30 entrées sans changement visible ; le retrait du TypeScript (SPEC-2302)
est repoussé pour elles, qui restent nécessaires. ADR-2023 reste ouverte pour `home.get`.
