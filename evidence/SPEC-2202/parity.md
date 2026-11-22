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
   les quinze opérations `py` du contexte sont servies par Python.
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

Les quatre opérations de l'étape 4 n'ont pas de scénario enregistré : `review.globalQuizToday` et
`review.answer`/`review.complete` portent un paramètre de chemin (`:fid`, `:sid`) et les deux
dernières sont des mutations, que l'outil ne génère pas (`generatedScenarios` ne retient que les
lectures sans paramètre de chemin). Le contexte `learning` est néanmoins complet : 15/15 `py`.

**Zéro divergence inexpliquée.** Les quatre entrées restantes du contexte (`review.answer`,
`review.complete`, `review.globalQuizToday`, `warmups.answers.create`) ne sont pas générées par
l'outil (paramètre de chemin `:sid`/`:fid` ou mutation) : elles sont désormais `py` et servies par
Python, sans scénario de parité. Leurs écritures sont prouvées par les tests d'intégration serveur
(`test_learning_review_flow.py`, `test_learning_review_answer.py`,
`test_learning_warmup_answer.py`) : statuts, journal FSRS, idempotence et effets de bord en base.

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

## Contexte `assessments` (tranche livrée)

Même méthode, exécutée après la bascule de `offline.pack` : base remise à zéro sous `flock`,
Hono sur `:3112` avec `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `EMAIL_MODE=memory`, puis façade sur `:3101`
(`PY_HONO_UPSTREAM_URL=http://127.0.0.1:3112`).

```
$ pnpm parity:record --target http://127.0.0.1:3112 --group assessments
Recorded 1 scenarios against http://127.0.0.1:3112

$ pnpm parity:check --target http://127.0.0.1:3101 --group assessments
Parity OK: 1 scenarios replay identically against http://127.0.0.1:3101.
```

| Scénario | Opération | Propriétaire | Ce qui est comparé |
|---|---|---|---|
| `offline.pack` | GET `/api/v1/offline/pack` | `py` | paquet vide d'un compte neuf : `ownerId`, `localDate`, `generatedAt`, `expiresAt`, `formations: []` |

`offline.pack` est la seule lecture du contexte sans paramètre de chemin : l'outil ne génère un
scénario que pour celles-là. Les autres opérations `py` de la tranche portent un paramètre de
chemin (`bricks.correct`, `bricks.report`, `quiz.attempts.get`, `quiz.answers.save`,
`quiz.answers.check`, `exam.answers.save`, `exam.questions.mark`) ou sont des mutations : leur comportement est prouvé par les tests
d'intégration serveur (`packages-py/learny/tests/integration/assessments/`), pas par la parité.

Aucune divergence n'a été constatée sur la tranche : l'oracle `assessments` est enregistré dans
`api/oracles/recordings/reads.json` et les 71 scénarios des autres contextes sont inchangés
(24 lignes ajoutées, aucune modifiée).

### Dettes de la tranche (reprises par leur spec propriétaire)

- `offline.sync` reste `ts` : la synchronisation hors ligne dépend du journal de révision et du
  service `apply-result` côté worker ; elle est relayée à Hono et n'est donc pas encore servie par
  Python. Le DTO n'est pas modifié.
- `offline.pack` ne déclenche aucune demande de génération de variantes (`requestRefill`,
  SPEC-513) ni notification (`engagement`, SPEC-2205) : ces services n'existent pas encore et le
  TypeScript n'en émet pas non plus sur ce chemin. Rien n'est inventé.
