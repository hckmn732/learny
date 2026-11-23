# SPEC-2204 — parité

## Ce que le harnais savait comparer

`tools/parity/run.ts` comparait un corps JSON normalisé (statut, en-têtes d'une liste blanche,
`normalizeBody`). Une réponse `text/event-stream` était donc capturée comme une chaîne : impossible
d'y comparer deux runtimes dont les identifiants et les horodatages diffèrent.

## Extension livrée

- `parseEventStream(text)` : liste **ordonnée** des charges utiles `data:`, `[DONE]` conservé comme
  sentinelle littérale, charge non JSON conservée telle quelle, commentaires, `id:`/`event:` et
  charges vides ignorés — c'est le format prévu par `00-conventions.md` §11.
- `executeStep` choisit ce parseur dès que `content-type` commence par `text/event-stream`, puis la
  normalisation existante (UUID, horodatages, e-mails) s'applique aux charges utiles.
- Test unitaire : `tools/parity/test/unit/event-stream.test.ts` (4 cas : ordre, `[DONE]`, bruit SSE,
  charge non JSON, normalisation des UUID).
- `tsc -p tsconfig.tools.json`, `eslint tools/parity` et `prettier --check` sont verts sur l'outil.

## Groupe `tutor` enregistré : 2 scénarios, 0 divergence

Les deux opérations `me.ai.*` générables sont des `GET` sans paramètre de chemin, donc produites par
`generatedScenarios` (`api/inventory.json`, contexte `tutor`) :

| Scénario | Route | Ce qu'il prouve |
|---|---|---|
| `me.ai.credentials.list` | `GET /api/v1/me/ai/credentials` | portée RLS (liste vide pour un compte neuf), `{items: []}`, en-têtes `content-type`/`cache-control`, statut 200 |
| `me.ai.models.get` | `GET /api/v1/me/ai/models` | les cinq lignes de tâche dans l'ordre du prototype, capacités requises, champs nuls (`modelId`, `credentialId`, `provider`, `providerLabel`), `unavailableReason: no_model_selected`, `providers: []`, `updatedAt` normalisé |

Séquence exacte (2026-11-22, base locale `127.0.0.1:54322`, horloge figée au 2026-11-11T12:20:00Z,
`LLM_MODE=mock`, `APP_ENCRYPTION_KEY` de test) :

```bash
# enregistrement contre Hono, source de vérité (port 3112)
corepack pnpm parity:record --group tutor --target http://127.0.0.1:3112
# → Recorded 2 scenarios against http://127.0.0.1:3112

# rejeu contre la façade Python (port 3113)
corepack pnpm parity:check --group tutor --target http://127.0.0.1:3113
# → Parity OK: 2 scenarios replay identically against http://127.0.0.1:3113.
```

L'enregistrement est fusionné dans `api/oracles/recordings/reads.json` sans toucher aux groupes
`formation`, `identity`, `learning`, `assessments` et `engagement` (l'outil conserve les groupes non
sélectionnés). Aucune divergence n'a été trouvée : les deux corps sont identiques après
normalisation, y compris l'absence du champ `compatibility` quand aucune tâche n'est affectée.

## Ce qui n'est pas générable et pourquoi

- `me.ai.credentials.create`/`.discover`/`.qualify` et `me.ai.models.update` sont des mutations (ou
  portent un identifiant de chemin) : `generatedScenarios` ne produit que les `GET` sans paramètre.
  Leur comportement (statuts, corps, codes d'erreur, effets en base, masquage) est prouvé par les
  **26 cas d'intégration** de `packages-py/learny/tests/integration/tutor/test_tutor_byok.py` et par
  `apps/api-py/tests/unit/test_handlers.py`.
- `me.ai.credentials.delete` est un `DELETE` avec paramètre de chemin : même raison.
- La chaîne des conversations reste **non enregistrable** : un scénario de parité est une suite de
  requêtes exécutées par un acteur `anonymous` ou `freshUser`, et le groupe demanderait un cours
  **prêt** appartenant à l'acteur, une conversation ouverte puis l'envoi d'un message. Le harnais ne
  sait pas amorcer de lignes (`createTestSession` crée un utilisateur Auth et ses acceptations
  légales, rien d'autre) et aucune route HTTP ne produit un cours prêt en une requête — il faudrait
  le cadrage, le programme, la génération asynchrone et l'ingestion. Ajouter un amorçage SQL au
  harnais serait un outil différent, avec ses propres fixtures à maintenir : hors budget, et non
  nécessaire à la preuve.

## Preuve de repli de la chaîne conversations, et pourquoi elle suffit

- **Séquence exacte** : `packages-py/learny/tests/unit/tutor/test_tutor_domain_vectors.py` compare les
  octets produits par `learny.tutor.domain.events` à `sse.chat`, `sse.selfTest` et `sse.error` de
  `api/oracles/vectors/tutor.json` (enregistrés sur le TypeScript). Le writer HTTP ne reformate
  rien : il transmet ces trames telles quelles.
- **Bout en bout par la façade** :
  `test_tutor_stream_facade.py` vérifie l'ordre des types de trames contre `sse.chat`, les en-têtes
  SSE, `[DONE]`, la latence du premier chunk (50 ms) et le 404 d'une conversation d'autrui avant tout
  octet de flux.
- **Comportement de service** : `test_tutor_stream.py` et `test_tutor_self_test.py` couvrent les cas
  de `stream.test.ts` et `self-test.test.ts` sur la base réelle (conflits, erreur de flux, message
  apprenant écrit avant le modèle, Teste-moi, maîtrise appliquée, quiz du soir).

Conséquence : le groupe `tutor` est désormais **enregistré pour ses deux lectures BYOK** (2
scénarios, 0 divergence) ; la chaîne conversations reste prouvée par l'oracle du domaine et
l'intégration de la façade. Si le harnais gagne un jour un amorçage de cours, les scénarios pourront
être ajoutés à `tools/parity/scenarios/mutations.json` sans retoucher le comparateur.
