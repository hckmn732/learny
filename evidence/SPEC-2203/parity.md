# Parité contractuelle — SPEC-2203

Référence enregistrée depuis Hono sur `:3112`, rejouée contre la façade FastAPI sur `:3101` par
`corepack pnpm parity:record|check --group <contexte>` (`tools/parity/run.ts`). Les scénarios sont
générés pour **les lectures sans paramètre de chemin** (`generatedScenarios`) et complétés par les
mutations écrites à la main de `tools/parity/scenarios/mutations.json`.

## Campagne exécutée (2026-11-22)

Méthode : base locale remise à zéro sous `flock /tmp/learny-sdd-db.lock`, clés Supabase lues par
`supabase status -o env`, Hono sur `:3112` (`PORT=3112`, `APP_ENV=test`, `JOBS_MODE=inline`,
`EMAIL_MODE=memory`, `CLOCK_FIXED_AT=2026-11-11T12:20:00Z`, `LLM_MODE=mock`, `TZ=UTC`), puis façade
sur `:3101` (`PY_HONO_UPSTREAM_URL=http://127.0.0.1:3112`, `APP_ENV=test`, `LLM_MODE=mock`). Les
deux serveurs répondent `{"status":"ok"}` avant la campagne.

### Contexte `content` : aucun scénario généré

```
$ corepack pnpm parity:record --target http://127.0.0.1:3112 --group content
Error: no scenario in group(s) content
record content exit=1

$ corepack pnpm parity:check --target http://127.0.0.1:3101 --group content
Error: no scenario in group(s) content
check content exit=1
```

Ce n'est **ni un échec de parité ni une divergence** : l'outil refuse explicitement un groupe vide
(`if (scenarios.length === 0) throw …`) et n'a donc rien enregistré ni comparé. La raison est
structurelle, déjà annoncée par le plan P22 : les **quatre lectures** du contexte portent toutes un
paramètre de chemin et sont exclues par `generatedScenarios` (`operation.path.includes(':')`), et
les **quatorze mutations** ne sont pas générées.

| Lecture `content` | Chemin | Motif d'exclusion |
|---|---|---|
| `modules.screen` | `GET /api/v1/modules/:mid` | paramètre de chemin `:mid` |
| `modules.course` | `GET /api/v1/modules/:mid/course` | paramètre de chemin `:mid` |
| `resources.readUrl` | `GET /api/v1/resources/:rid/url` | paramètre de chemin `:rid` |
| `course-citations.source` | `GET /api/v1/course-citations/:cid/source` | paramètre de chemin `:cid` |

Aucune mutation `content` n'est décrite dans `mutations.json` (`{ errors: 3 }` seulement, groupe
`errors`) : rien n'a été ajouté pour ce run, ce qui aurait été un scénario inventé.

### Preuves qui remplacent le scénario généré

Chaque opération `content` est couverte par un test serveur qui exerce le contrat complet (statut,
corps validé contre le modèle généré, codes d'erreur, RLS, événements, idempotence, effets en base)
et par l'e2e de la clôture qui prouve la façade de bout en bout :

| Opérations | Tests d'intégration |
|---|---|
| `modules.screen`, `chapters.complete`, `chapters.summary`, `modules.generateCourse`, `resources.create`, `resources.delete`, `resources.finalize`, `resources.readUrl`, `resources.rename`, `resources.retry`, `suggestions.dismiss`, `suggestions.import` | `packages-py/learny/tests/integration/content/test_content_resources.py`, `test_content_uploads.py`, `test_content_summary.py` |
| `modules.course`, `courses.progress`, `course-citations.source`, `course-sections.edit`, `course-sections.report` | `test_content_course.py`, `test_content_progress.py`, `test_content_progress_rules.py`, `test_content_sections.py`, `test_content_citation_source.py` |
| Ingestion (`process_resource` des cinq types) | `test_content_ingestion.py` |
| Tous les handlers `py` (aucune route `ts` servie par Python) | `apps/api-py/tests/unit/test_handlers.py` |

L'e2e `apps/web/e2e/specs/p22/spec-2203.spec.ts` prouve trois opérations à travers le web et la
façade : `modules.screen` (200, contrat et ressource du chapitre), `modules.course` (200, cours
absent, génération `none`), `resources.rename` (200, nouveau titre, aucun événement), plus le
contrat d'erreur de `modules.screen` sur un identifiant absent (404 `NOT_FOUND`, `problem+json`),
toujours avec `x-served-by: learny-api`.

### Rejeu des groupes existants : aucune régression de la façade

Les quatre groupes déjà enregistrés ont été rejoués contre la même façade Python, sans
réenregistrement (`git status --short api/oracles/recordings/reads.json` vide : l'oracle est
inchangé) :

```
$ corepack pnpm parity:check --target http://127.0.0.1:3101 --group identity
Parity OK: 7 scenarios replay identically against http://127.0.0.1:3101.

$ corepack pnpm parity:check --target http://127.0.0.1:3101 --group formation
Parity OK: 2 scenarios replay identically against http://127.0.0.1:3101.

$ corepack pnpm parity:check --target http://127.0.0.1:3101 --group learning
Parity OK: 4 scenarios replay identically against http://127.0.0.1:3101.

$ corepack pnpm parity:check --target http://127.0.0.1:3101 --group assessments
Parity OK: 1 scenarios replay identically against http://127.0.0.1:3101.
```

Soit **14 scénarios rejoués à l'identique, zéro divergence inexpliquée** (`identity` 7, `formation`
2, `learning` 4, `assessments` 1). La façade sert donc les contextes déjà basculés exactement comme
les oracles de SPEC-2001, avant et après la bascule de `content`.

## Parité des extracteurs (fixtures committées)

Les extracteurs Python et TypeScript sont comparés sur les fixtures committées, texte normalisé
(espaces) par page :

| Fixture | TypeScript | Python | Écart observé |
|---|---|---|---|
| `WEB_FIXTURE_HTML` (`content_web.json`) | Readability + linkedom | `readability-lxml` + `lxml` | titre identique après normalisation du tiret cadratin (`—` → `-` par la bibliothèque) ; texte principal, `siteName`, `language` et ancrages `marge-brute`/`resultat-net` identiques ; l'ancrage du `h1` (`compte-resultat`) est conservé par `readability-lxml` alors que Readability le retire — **superset d'ancrages**, aucun décalage d'offset ni de citation |
| PDF généré (`pdf.ts`) | PDF.js (`unpdf`) | `pypdf` | même nombre de pages, mêmes lignes et mêmes bornes `{page,charStart,charEnd}` ; `pypdf` peut joindre deux lignes par `\n` là où PDF.js met un espace, sans changer le découpage sur les fixtures (frontières de paragraphe identiques) |
| YouTube (`youtube.ts`) | `youtubei.js` | `youtube-transcript-api` | mêmes identifiants, segments, bornes temporelles et textes (fixture JSON identique) ; en direct, le titre et la durée ne sont pas fournis par `youtube-transcript-api` : le titre retombe sur « Vidéo YouTube <id> », comportement de repli déjà prévu par le TypeScript |
| Image (`image.ts`) | `light` + vision | `light` + vision | même lecture mockée, même `contentOrigin = model`, même ancrage `lecture-ia` |

Aucun écart ne change une frontière de passage ni une citation sur les fixtures : aucun ADR de
déviation n'est donc ouvert. Si une future fixture introduit un écart de ce type, il devra être
consigné dans un ADR de la plage 2xxx avant de modifier une assertion.

## Divergences connues (aucune divergence mesurée)

Zéro divergence mesurée : le groupe `content` ne produit pas de scénario (ci-dessus) et les
quatorze scénarios des autres groupes rejouent à l'identique. Trois écarts de conception restent
documentés et ne changent aucune réponse HTTP :

1. **Émission de `resource/uploaded` à la finalisation** : le TypeScript émet après le commit avec
   une réclamation sur la ligne (`metadata.upload.eventClaimedAt`, reprise après un minuteur) ; le
   port Python écrit l'événement dans la transaction qui finalise, avec l'identifiant stable
   `resource-uploaded:<rid>` et le marqueur `upload.eventEmittedAt`. Un rejeu n'émet pas de second
   événement (prouvé par `test_content_resources.py`), mais un crash entre `commit` et livraison ne
   laisse pas de réclamation à reprendre : le worker Python (SPEC-2207) relit l'outbox, ce qui rend
   la réclamation inutile.
2. **Offsets de caractères** : les emplacements de passage sont comptés en unités UTF-16 côté
   TypeScript et en points de code côté Python. L'écart n'apparaît que sur des caractères hors BMP
   (emoji) ; il décale les `charStart`/`charEnd` suivant un tel caractère. Les vecteurs d'oracle
   excluent ces entrées ; le constat est consigné pour un ADR de la plage 2xxx.
3. **Upload PDF Anthropic Files** : le port `UploadPdf` existe et l'extraction texte est complète ;
   le défaut renvoie `None` tant que la résolution BYOK n'est pas branchée (SPEC-2204). Le
   TypeScript ne téléverse de toute façon que pour un modèle Anthropic choisi par l'apprenant.

## Preuves d'intégration de la bascule

- `test_content_summary.py` : commit du texte avant l'appel au modèle, correction mockée, rejeu
  sans second appel ni second événement, brouillon différé quand le tuteur est indisponible,
  validation et `NOT_FOUND`.
- `test_content_ingestion.py` : cinq étages, passages localisés, `resource/ready` unique, rejeu
  silencieux, échec permanent `NOTE_EMPTY` avec `resource/failed`, panne d'embeddings transitoire
  laissant la ressource `processing` puis reprise, identifiant invalide refusé avant toute requête.
- `test_handlers.py` : 18 opérations `py` et 18 handlers, aucune route `ts` servie par Python.
