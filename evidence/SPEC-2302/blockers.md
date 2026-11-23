# SPEC-2302 — Blocages du retrait du backend TypeScript

## 1. Constat

`SPEC-2302` exige `CA-4` : « aucune opération servie par TypeScript ». L'état de
`api/ownership.yaml` après cette tranche est :

| Catégorie | Nombre | Détail |
| --- | --- | --- |
| Opérations `dev.*` servies par Python | 55 | dont 11 portées ici, 44 par SPEC-2207 |
| Opérations `dev.*` encore `ts` | **15** | démos listées dans `scope.md` §3 |
| Autre opération encore `ts` | **1** | `home.get` (agrégat de 18 lectures SQL, SPEC-2207 §9.2) |
| **Total encore relayé vers Hono** | **16** | |

## 2. Pourquoi `apps/api` ne peut pas être supprimé

La coexistence d'`ADR-2005` fait de la façade FastAPI l'unique entrée : une opération dont
`api/ownership.yaml` indique `ts` est **relayée** vers Hono (`baseUrl` Hono). Tant qu'une seule
entrée reste `ts`, le processus Hono doit rester déployé et `apps/api` ne peut pas être retiré.

Les garde-fous du dépôt matérialisent cette dépendance :

- `apps/api-py/tests/unit/test_handlers.py` : chaque opération `py` a exactement un handler, et
  aucune opération `ts` n'est servie par Python ; la liste `py` doit être **égale** à `HANDLERS`.
- `apps/api-py/tests/unit/test_ownership.py` : la table couvre les 217 opérations et 32 routes
  spéciales du contrat, sans doublon ni entrée inconnue.
- `api/inventory.json` et les tests de cutover comparent la table au contrat généré : une entrée ne
  peut pas être retirée sans supprimer la route du contrat et du client.

Supprimer `apps/api` aujourd'hui casserait donc les 16 entrées encore `ts` (404 de la façade) et
ferait échouer `test_handlers` (opérations `ts` sans implémentation servie).

## 3. Ce qui débloque chaque groupe

| Groupe | Déblocage |
| --- | --- |
| `509`, `510`, `511` | Les cas d'usage `content` sont portés (`process_resource`, retrieval, embeddings mock) : handler court + fixtures SQL à composer. |
| `711` | `engagement.automations` est porté : brancher les lectures `automation_actions` et `pause` sur les handlers. |
| `411` | Lecture d'état : réutiliser les fabriques `devfixtures` (activité, tentative, réponses) et la notation existante. |
| `501.{create,report,correct}` | Porter `createBrick` et `getPublicBrick` dans `learny.assessments.application` (utiles au produit, pas seulement à la démo). |
| `504.{demo,call}` | Porter `resolveModel` dans `learny/platform/llm/resolve.py` (utile au produit), puis `createSession` mock. |
| `512.{demo,suggest,decide}` | Porter `searchWeb` en mode mock (`platform.search` existe) et les suggestions de ressources. |
| `508` | `buildTutorDemo` (487 lignes) : service entier, à porter ou à différer explicitement. |
| `1301` | Harnais de client natif (`runNativeClientScenario`) : hors route métier, peut rester `ts` et être documenté comme tel. |
| `home.get` | Agrégat sans test d'oracle : décision produit à prendre (SPEC-2207 §9.2), indépendante de cette tranche. |

## 4. État du processus

- `validate.mjs`, `complete.mjs` et `fail.mjs` n'ont **pas** été lancés (consigne du porteur).
- `progress/state.json` n'est pas modifié par cette passe ; le porteur gère le statut de la spec.
- Les checkpoints `CP-21`/`CP-23` n'ont pas été touchés.
- Aucun `push`, fusion, tag n'a été effectué.
