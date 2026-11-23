# `tools/parity` — oracle de parité contre l'API Python

Suite de régression permanente de la piste Python (P20 §3, P23 §2.7, ADR-2008). Elle
enregistre les réponses de référence d'une instance du backend **Python** et les rejoue à
l'identique contre toute autre instance (pile locale, QA, staging). Depuis SPEC-2302 et
ADR-2006, plus aucun serveur TypeScript n'existe : le harnais ne démarre rien lui-même, il
interroge l'URL passée en `--target`.

## Usage

```bash
# pile locale : la façade écoute sur 127.0.0.1:3001 (tools/dev/lib.mjs)
pnpm parity:record --target http://127.0.0.1:3001   # écrit api/oracles/recordings/reads.json
pnpm parity:check  --target http://127.0.0.1:3001   # rejoue, code 1 sur toute divergence
```

`--group <contexte>` (répétable : `learning`, `formation`, `identity`, `assessments`,
`content`, `tutor`, `engagement`, `billing`, `privacy`, `dev`, `special`) limite la campagne à
un contexte métier ; les autres groupes de l'enregistrement commité sont conservés.

## Contenu

- `run.ts` — génération des scénarios de lecture depuis `api/inventory.json` (une lecture sans
  paramètre de chemin par opération), mutations manuelles de `scenarios/mutations.json`,
  normalisation des valeurs non déterministes (UUID, instants, durées) et comparaison sémantique
  (statut, en-têtes comparés, corps JSON, flux SSE).
- `test/unit/event-stream.test.ts` — comparaison des réponses SSE `[SPEC-2204]`.
- `test/integration/parity.test.ts` — rejeu réel d'un échantillon `[SPEC-2001]` ; sauté
  explicitement quand aucune cible ne répond (`PARITY_TARGET`), jamais présenté comme vert.

## Ce que ce n'est pas

- Ce n'est pas un test de contrat : `pnpm contract:check`, `sdk:check` et
  `py:contract:check` garantissent que le contrat et ses artefacts sont à jour.
- Ce n'est pas une campagne e2e ni visuelle : Playwright reste l'oracle fonctionnel
  (`docs/engineering/testing.md` §6).
