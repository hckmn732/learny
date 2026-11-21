# Parité — SPEC-2201 (état au dernier commit de la branche)

Environnement : VM de dev, worktree `/home/ubuntu/projects/learny-wt-SPEC-2201`, branche
`spec/SPEC-2201-domaines-identite-formation`, base Supabase locale (`127.0.0.1:54322`).
Horloge des tests : `2026-11-11T12:20:00Z` (ADR-0047). Aucune valeur théorique : chaque ligne
renvoie à un test exécuté.

## Ce qui est prouvé dans cette branche

| Sujet | Preuve | Résultat |
|---|---|---|
| Table de routes générée depuis le contrat | `apps/api-py/tests/unit/test_contract_artifacts.py` | ✅ 217 opérations, identifiants identiques à `api/inventory.json`, précédence statique/paramètre |
| Fraîcheur des artefacts générés | `pnpm py:contract:check` (branché dans `pnpm lint`) | ✅ deux générations identiques (md5 stables) |
| Ordre des douze étapes du pipeline | `apps/api-py/tests/unit/test_pipeline.py` (24 cas) | ✅ origine → débit → clé → auth → validation → idempotence → acceptation → handler → sortie → en-têtes |
| Messages de validation Zod en français | `apps/api-py/tests/unit/test_validate.py` (16 cas) | ✅ chemins préfixés, bornes, motifs, clés inconnues, `strict` corps / `lax` requête |
| Enregistrement des routes `py` avant le relais | `apps/api-py/tests/integration/test_pipeline_install.py` (6 cas) | ✅ 302/204/401 servis en Python, route `ts` toujours relayée, catch-all en dernier |
| Enveloppe BYOK | `packages-py/learny/tests/unit/platform/test_llm_credentials.py` (18 cas) | ✅ aller-retour, AAD d'une autre ligne, octet altéré, rotation, masque, empreinte |
| Table des tâches et sélection de fixtures | `packages-py/learny/tests/unit/platform/test_llm_mock.py` (16 cas) | ✅ budgets identiques à `tasks.ts`, ordre de sélection ADR-0153 (scénario, marqueur, `match.contains`, défaut), pas de réseau |

## Ce qui n'est pas encore prouvé (opérations du périmètre)

Les 45 opérations `identity` et `formation` de `evidence/SPEC-2201/scope.md` sont **toutes encore
`ts`** dans `api/ownership.yaml` : la parité contractuelle de ces entrées n'est pas mesurée, donc
aucune n'est basculée (CL-3 de la spécification, ADR-2005 « jamais deux écrivains »).

| Contexte | Opérations | Propriétaire actuel | Cas d'usage Python | Parité contractuelle |
|---|---|---|---|---|
| identity | 19 | `ts` | 0 / 19 | non mesurée |
| formation | 26 | `ts` | 0 / 26 | non mesurée |
| **Total** | **45** | `ts` | **0 / 45** | **non mesurée** |

`pnpm parity:check --group identity` n'a pas été lancé : le groupe de captures correspondant n'existe
pas encore dans `tools/parity` pour ces contextes (le harnais de SPEC-2001 couvre les oracles de
lecture `api/oracles/recordings/reads.json`). Aucune divergence n'est donc déclarée « expliquée ».

## Écarts connus et assumés

1. **`starts_with` non généré** — `datamodel-codegen` ignore le format `starts_with` d'un schéma de
   chaîne (avertissement `format of 'starts_with' not understood`). Une contrainte `startsWith` du
   contrat n'est donc pas vérifiée par le modèle généré. À traiter avant de basculer une opération
   qui en dépend (codes d'invitation `LRN-`).
2. **Modèles `extra="forbid"`** — les schémas du contrat portent `additionalProperties: false`
   (571 occurrences) : Pydantic refuse une clé inconnue là où Zod la refuserait aussi sur un objet
   strict, mais **strippe** sur un objet non strict. À vérifier au premier oracle 400 par opération.
3. **Champs caméléon** — les noms de champs générés sont ceux du contrat (camelCase), sans couche
   d'alias : la sérialisation garde l'ordre de déclaration, qui est celui des littéraux TypeScript.