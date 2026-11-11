# ADR-0153 — Fixtures du modèle simulé et sélection de scénario

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-504, SPEC-508, SPEC-506, SPEC-513

## Contexte

ADR-0048 impose `LLM_MODE=mock` avec des fixtures JSON « sélectionnées par une clé de scénario calculée sur l'entrée », sans en fixer le format ni l'algorithme. Les tests unitaires, d'intégration et e2e doivent pouvoir choisir un scénario (brique invalide, refus, plafond, injection) de façon déterministe, y compris quand l'appel est déclenché depuis l'interface.

## Décision

1. Fichiers `packages/llm/fixtures/<task>/<scenario>.json` (`scenario` en kebab-case), validés par le schéma Zod `FixtureFileSchema` : `{ task, scenario, promptId, promptVersion, description, match?: { contains: string[] }, steps: Step[] }` où `Step` est l'une des formes `text` (`text`, `finishReason`), `tool-calls` (`toolCalls[{ toolCallId, toolName, input }]`), `object` (`object`), `stream` (`chunks[]`), `error` (`error.kind ∈ refusal|rate_limit|timeout|auth|server|context_length|overloaded`, `message`), chacune avec `usage { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }` et `latencyMs` facultatifs.
2. Sélection (fonction pure `selectFixture`) dans cet ordre : (a) scénario explicite passé par l'appelant (`mock.scenario`, tests et pages de démonstration) ; (b) marqueur `[[mock:<scenario>]]` présent dans un texte saisi par l'utilisateur et transmis dans l'appel (actif uniquement en `LLM_MODE=mock`, retiré du texte avant l'appel) ; (c) première fixture du dossier de la tâche, par ordre alphabétique de nom de fichier, dont `promptId` est égal et dont toutes les chaînes `match.contains` figurent dans la sérialisation canonique des messages ; (d) `fixtures/<task>/<promptId>.default.json` ; (e) sinon erreur `MOCK_FIXTURE_NOT_FOUND` (le test échoue bruyamment).
3. Une session (`LlmSession`) consomme les étapes dans l'ordre, une par appel au modèle ; au-delà de la dernière étape : erreur `MOCK_STEPS_EXHAUSTED`.
4. `promptVersion` d'une fixture doit être égal à la `version` de la consigne `promptId` ; un test unitaire le vérifie pour toutes les fixtures (une consigne modifiée impose la mise à jour de ses fixtures).

## Conséquences

Les scénarios d'erreur sont reproductibles sans réseau ; un e2e peut déclencher un scénario depuis l'interface en saisissant le marqueur.
