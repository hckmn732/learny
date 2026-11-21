# Portage des tests — SPEC-2201

Référence : `evidence/SPEC-2001/test-port-map.md`. Chaque ligne indique le test TypeScript d'origine
(outil, fichier) et son équivalent pytest. Les cas sont conservés ; les assertions portent sur les
mêmes valeurs.

## Infrastructure de contrat (livrée)

| Test TypeScript | Outil | Équivalent pytest | Cas |
|---|---|---|---|
| `packages/http/src/route-handler.test.ts` (202) | vitest | `apps/api-py/tests/unit/test_pipeline.py` | origine avant débit, débit public avant auth, auth avant validation, 401/403, corps 1 Mio → 413, JSON invalide, clé d'idempotence avant auth, réserve/rejeu/relâche, en-têtes, 204 forcé, 500 sans fuite |
| `packages/http/src/validate.test.ts` (201) | vitest | `apps/api-py/tests/unit/test_validate.py` | `queryToObject`, statut 400/422, chemins préfixés, messages Zod fr, strict/lax |
| `packages/contracts` (génération) | tsx | `apps/api-py/tests/unit/test_contract_artifacts.py` | 217 routes, politique complète, précédence, formats en chaînes |
| `packages/llm/src/credentials/crypto.test.ts` | vitest | `packages-py/learny/tests/unit/platform/test_llm_credentials.py` | aller-retour, IV unique, AAD, octet altéré, rotation, `loadKeyring`, empreinte, masque |
| `packages/llm/src/mock/select.test.ts` | vitest | `packages-py/learny/tests/unit/platform/test_llm_mock.py` | scénario explicite, marqueur, `match.contains`, défaut, introuvable, `stripMockMarkers` |
| `packages/llm/src/tasks` (budgets) | vitest | `packages-py/learny/tests/unit/platform/test_llm_mock.py` | table des tâches, seuil de streaming 16 k |
| `apps/api-py` façade (2003) | vitest | `apps/api-py/tests/integration/test_pipeline_install.py` | route py servie, route ts relayée, catch-all dernier, handler manquant = échec au démarrage |

## Tests du périmètre identity + formation (restant à porter)

Les fichiers ci-dessous sont les tests TypeScript des 45 opérations du périmètre ; ils n'ont pas
encore d'équivalent pytest et doivent être portés **avant** la bascule de l'opération concernée
(mêmes cas, même assertion, étiquette `[SPEC-2201]`).

| Contexte | Tests TypeScript | Opérations couvertes |
|---|---|---|
| identity | `packages/services/src/auth/*.test.ts`, `me/*.test.ts`, `legal/*.test.ts`, `security/*.test.ts`, `packages/api-routes/src/implementations/{me,legal,parametres-onglets-et-profil,header,sidebar,home}.test.ts` | 19 |
| formation | `packages/services/src/{formations,programme,cadrage}/*.test.ts`, `packages/api-routes/src/implementations/{cadrage,formation-management,formations-a-plusieurs,programme,notion-graph,search}.test.ts` | 26 |
| e2e | `apps/web/e2e/specs/**` filtrés par les étiquettes du périmètre (voir `tests` de chaque opération dans `api/inventory.json`) | parcours identity + formation |

Chaque ligne ajoutée ici devra citer le fichier pytest et le nombre de cas portés.