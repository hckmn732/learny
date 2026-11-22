# SPEC-2204 — parité SSE

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

## Enregistrement du groupe `tutor` : hors budget

Un scénario de parité est une suite de requêtes HTTP exécutées par un acteur `anonymous` ou
`freshUser`. Le groupe `tutor` demanderait :

1. un cours **prêt** appartenant à l'acteur, avec ses sections et ses notions ;
2. une conversation ouverte sur ce cours (`courses.conversations.create`) ;
3. l'envoi d'un message (`conversations.messages`), puis la réponse au Teste-moi.

Le harnais ne sait pas amorcer de lignes : `createTestSession` crée un utilisateur Auth et ses
acceptations légales, rien d'autre, et aucune route HTTP ne produit un cours prêt en une requête — il
faudrait le cadrage, le programme, la génération asynchrone et l'ingestion, c'est-à-dire une chaîne de
plusieurs dizaines d'étapes et de jobs. Ajouter un amorçage SQL au harnais serait un outil différent,
avec ses propres fixtures à maintenir et à versionner : hors budget pour cette tranche, et non
nécessaire à la preuve.

## Preuve de repli, et pourquoi elle suffit

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

Conséquence : la parité du groupe `tutor` reste **non enregistrée** ; elle est prouvée par l'oracle
du domaine et l'intégration de la façade. Si le harnais gagne un jour un amorçage de cours, les
scénarios pourront être ajoutés à `tools/parity/scenarios/mutations.json` sans retoucher le
comparateur.

