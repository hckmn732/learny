# Parité — SPEC-2202 (contexte `learning`)

Référence enregistrée depuis Hono sur `:3112`, rejouée contre la façade FastAPI sur `:3101` par
`corepack pnpm parity:record|check --group learning` (`tools/parity/run.ts`). La base locale est
remise à zéro sous `flock /tmp/learny-sdd-db.lock` avant l'enregistrement, les serveurs sont
démarrés avec `CLOCK_FIXED_AT=2026-11-11T12:20:00Z`, `LLM_MODE=mock`, `TZ=UTC` et
`PLAYWRIGHT_REUSE_SERVER=0` pour les campagnes Playwright.

## Méthode

1. `pnpm db:reset --yes` sous `flock`, puis Hono (`PORT=3112`) et la façade
   (`PY_HONO_UPSTREAM_URL=http://127.0.0.1:3112`) sont démarrés séparément.
2. `pnpm parity:record --target http://127.0.0.1:3112 --group learning` enregistre les scénarios
   générés pour les lectures sans paramètre de chemin.
3. `pnpm parity:check --target http://127.0.0.1:3101 --group learning` rejoue les mêmes entrées :
   les onze opérations `py` sont servies par Python, les quatre restantes sont relayées à Hono.
4. Comparaison sémantique : statut, en-têtes de `COMPARED_HEADERS`, corps JSON normalisé (UUID,
   instants, adresses) et clés triées.

## Scénarios et résultat

```
$ pnpm parity:record --target http://127.0.0.1:3112 --group learning
Recorded 4 scenarios against http://127.0.0.1:3112

$ pnpm parity:check --target http://127.0.0.1:3101 --group learning
Parity OK: 4 scenarios replay identically against http://127.0.0.1:3101.
```

| Scénario | Opération | Propriétaire | Ce qui est comparé |
|---|---|---|---|
| `agenda.get` | GET `/api/v1/agenda` sans paramètre | `py` | 400 `VALIDATION_FAILED` : ordre, chemins et messages des trois champs manquants |
| `series.streak` | GET `/api/v1/streak` | `py` | série nulle, ruban de régularité de 14 jours, prochain jalon |
| `series.milestones` | GET `/api/v1/milestones` | `py` | liste vide, prochain jalon, fuseau |
| `warmups.today.get` | GET `/api/v1/warmups/today` | `py` | liste vide |

**Zéro divergence inexpliquée.** Les quatre entrées `ts` restantes du contexte ne sont pas
générées par l'outil (paramètre de chemin `:sid`/`:fid` ou mutation) : elles restent relayées à
Hono, donc la façade se comporte à l'identique, et leur logique Python n'existe pas encore.

## Divergences corrigées, et non contournées

| Constat | Correction |
|---|---|
| `agenda.get` : l'ordre des erreurs différait (`formation` avant `from`). L'OpenAPI perd l'ordre des clés de l'objet Zod et les modèles générés valident alphabétiquement. | Table `ISSUE_ORDER` dans `learny_api/validate.py`, appliquée par `validate_input(route_id=…)` ; `agenda.get` déclare `query.from`, `query.to`, `query.formation`. |
| `agenda.get` : le message de `query.from` annonçait « null attendu » au lieu de « chaîne de caractères attendu ». La recherche d'annotation utilisait le nom de champ alors que l'erreur Pydantic porte l'alias `from`. | `_annotation` résout désormais aussi par alias de champ. |
| Un enregistrement filtré par `--group` aplatissait les scénarios des contextes non rejoués sous un conteneur sans nom (bug révélé par ce run : les scénarios `dev` et des autres contextes étaient déjà dans ce conteneur depuis SPEC-2201). | `serializeMergedRecording` réinscrit les conteneurs non rejoués tels quels ; l'oracle a été réenregistré pour `learning` et les 71 scénarios des autres groupes sont inchangés (comparaison terme à terme). |

## Limites documentées

- `series.milestones` écrit le jalon de façon idempotente mais n'émet pas la notification de
  SPEC-209 : le service `notify` relève du contexte engagement (P23) et n'est pas porté. Aucun
  scénario de parité ne l'observe ; la donnée de jalon, elle, est identique.
- Les écritures (`formations.maintenance`, `slots.move`, `formations.replan`) sont couvertes par
  les tests d'intégration serveur (`packages-py/learny/tests/integration/learning/`) : statuts,
  version de contenu, idempotence des événements et effets de bord en base.
