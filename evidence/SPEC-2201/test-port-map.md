# Portage des tests — SPEC-2201

Référence : `evidence/SPEC-2001/test-port-map.md`. Chaque ligne indique le test TypeScript d'origine
(outil, fichier), le fichier pytest qui le porte et le nombre de cas. Les cas sont conservés ; les
assertions portent sur les mêmes valeurs. Les tests d'intégration s'exécutent sur la base locale
partagée, sous le verrou `flock`, et chaque cas est annulé (transaction `rolled_back`).

## Infrastructure de contrat (livrée au commit `5f2a4550`)

| Test TypeScript | Outil | Équivalent pytest | Cas |
|---|---|---|---|
| `packages/http/src/route-handler.test.ts` (202) | vitest | `apps/api-py/tests/unit/test_pipeline.py` | origine avant débit, débit public avant auth, auth avant validation, 401/403, corps 1 Mio → 413, JSON invalide, clé d'idempotence avant auth, réserve/rejeu/relâche, en-têtes, 204 forcé, 500 sans fuite |
| `packages/http/src/validate.test.ts` (201) | vitest | `apps/api-py/tests/unit/test_validate.py` | `queryToObject`, statut 400/422, chemins préfixés, messages Zod fr, strict/lax, normalisation du code d'invitation |
| `packages/contracts` (génération) | tsx | `apps/api-py/tests/unit/test_contract_artifacts.py` | 217 routes, politique complète, précédence, formats en chaînes |
| `packages/llm/src/credentials/crypto.test.ts` | vitest | `packages-py/learny/tests/unit/platform/test_llm_credentials.py` | aller-retour, IV unique, AAD, octet altéré, rotation, `loadKeyring`, empreinte, masque |
| `packages/llm/src/mock/select.test.ts` | vitest | `packages-py/learny/tests/unit/platform/test_llm_mock.py` | scénario explicite, marqueur, `match.contains`, défaut, introuvable, `stripMockMarkers` |
| `packages/llm/src/tasks` (budgets) | vitest | `packages-py/learny/tests/unit/platform/test_llm_mock.py` | table des tâches, seuil de streaming 16 k |
| `apps/api-py` façade (2003) | vitest | `apps/api-py/tests/integration/test_pipeline_install.py` | route py servie, route ts relayée, catch-all dernier, handler manquant = échec au démarrage |

## Contexte identity

### Cas portés

| Test TypeScript | Cas | Équivalent pytest | Cas portés |
|---|---|---|---|
| `packages/services/src/me.test.ts` (7) | projection du profil, noms blancs et date absente, date ISO, date illisible, `NOT_FOUND`, `UNAUTHENTICATED`, défaut inattendu | `packages-py/learny/tests/integration/identity/test_me_preferences.py` | 6 : projection (2 cas), `NOT_FOUND` lecture et écriture (2), `UNAUTHENTICATED` et défaut inattendu portés par le pipeline (`test_pipeline.py`, SPEC-2101). « date illisible » sans objet : psycopg rend un `datetime` ou `NULL`, jamais une chaîne. |
| `packages/services/src/header.test.ts` (5) | adresse abrégée, projection du DTO, noms vides et compteurs négatifs, `NOT_FOUND`, `UNAUTHENTICATED` | `packages-py/learny/tests/unit/identity/test_views_helpers.py` + `.../integration/identity/test_sidebar_header.py` | 4 : `abbreviate_email`, `to_header`, `get_header` intégration, `NOT_FOUND` ; `UNAUTHENTICATED` porté par le pipeline |
| `packages/services/src/sidebar.test.ts` (8) | sigle, 14 jours civils, mise à jour vide refusée, assemblage du menu, repli sur la première active, repli persisté, formation inconnue, formation partagée | `.../unit/identity/test_views_helpers.py` + `.../integration/identity/test_sidebar_header.py` + `apps/api-py/tests/unit/test_validate.py` | 8 : `formation_monogram`, `last_civil_days`, raffinement `sidebar.update`, assemblage, repli, persistance du repli, refus, partage |
| `packages/services/src/legal/accept.test.ts` (5) | accord valide, version obsolète, double demande, garde serveur, exemptions | `.../integration/identity/test_legal.py` + `packages-py/learny/tests/unit/identity/test_authenticate.py` (SPEC-2101) | 5 : 4 cas dans `test_legal.py`, garde et exemptions déjà portés par SPEC-2101 |
| `packages/services/src/parametres-onglets-et-profil.test.ts` (12) | bornes du corps, résumé borné, échéance formatée, corps hors schéma, lecture complète, export absent, préférences absentes, profil absent (lecture), corps invalide, version périmée, profil absent (écriture), écriture atomique | `.../integration/identity/test_profile_settings.py` | 11 : cas d'usage et `NOT_FOUND` ; bornes et corps hors schéma portés par les modèles générés (`generated/models.py`) et `test_validate.py`. L'échéance formatée (`formatDeletionDeadline`) est un affichage d'interface, non exposé par le DTO : non porté, aucun contrat HTTP ne le sert. |
| `packages/services/src/ai/qualify-model.test.ts` (9) | affectation de modèle | `.../integration/identity/test_ai_models.py` | 3 des 9 cas concernent `assignTaskModel` (affectation, clé absente ou modèle hors liste, affectation valide) ; les 6 autres portent sur la qualification des clés (`me.ai.credentials.*`, SPEC-2204) |

## Contexte formation

### Cas portés

| Test TypeScript | Cas | Équivalent pytest | Cas portés |
|---|---|---|---|
| `packages/services/src/cadrage/{state,get,complete}.test.ts` | cinq rubriques complétées, question numérotée, tour interrompu, `NOT_FOUND`, `canGenerate`, `COMPLETED` en double, objectifs figés | `.../unit/formation/test_cadrage_rules.py` + `.../integration/formation/test_cadrage.py` | 13 : 9 cas purs (`read_profile`, question `waiting`, sixième question, choix multiple, doublons, réponse de l'apprenant, objectifs, scénarios, tour interrompu) et 4 cas d'intégration (projection des cinq rubriques, autre propriétaire, liste, titre et sigle) + 2 cas de conclusion |
| `packages/services/src/cadrage/{create,post}.test.ts` | premier tour du cadrage, message de l'apprenant, sélection obsolète, échec de l'IA | `.../integration/formation/test_programme.py` | 3 : création et premier tour (fixture `cadrage-sap-q1`), message suivi d'une réponse, sélection obsolète en 400 |
| `packages/tutor/src/cadrage/{schema,apply-tutor-turn}.test.ts` | schéma strict, plafond de cinq questions, `multi`, valeurs tronquées, objectifs dédupliqués | `.../unit/formation/test_cadrage_rules.py` | 6 cas purs (question, plafond, `multi` à deux suggestions, doublons de valeurs, réponse de l'apprenant, objectifs) |
| `packages/services/src/formations/{management,active-limit}.test.ts` | pause, archive, reprise idempotente, limite de trois, repli de la formation courante, version périmée | `.../integration/formation/test_management.py` + `learny/formation/domain/active_limit.py` | 5 cas d'intégration (accès, pause avec annulation des créneaux et repli, archive idempotente, archive refusée et version périmée, formation courante) ; la table `transition_for` est exercée par ces cas |
| `packages/services/src/formations-a-plusieurs.test.ts` | code `LRN-XXXX`, création et appartenance du propriétaire, aperçu public, dixième place, rotation, retrait, sortie avec copie individuelle | `.../integration/formation/test_groups.py` | 5 cas d'intégration (création, aperçu puis adhésion avec progression propre, dixième place, rotation et interdiction de sortie du propriétaire, sortie avec copie) |
| `packages/services/src/programme/{state,generate,validate}.test.ts` | version courante, `expectedVersion`, limites de statut, création des modules et de la progression, événement `programme-validated` | `.../integration/formation/test_programme.py` | 3 : génération puis validation (modules créés, statut actif, événement), version périmée, import de fichier |
| `packages/services/src/programme/import-file.test.ts` | texte collé nettoyé, Markdown, DOCX, extension refusée, texte vide, binaire | `.../unit/formation/test_import_file.py` | 6 cas |
| `packages/services/src/notion-graph/get-graph.test.ts` | nœuds et liens typés, lacune ouverte, statistiques, formation étrangère en 404 | `.../integration/formation/test_read_models.py` | 2 cas (graphe complet, 404) |
| `packages/services/src/search/{highlight,index}.test.ts` | pliage casse et accents, positions des surlignages, extrait borné sans balisage, recherche du propriétaire | `.../integration/formation/test_read_models.py` | 4 cas (surlignage, extrait, recherche, libellé du module) |
| `packages/services/test/integration/cadrage.test.ts` | parcours complet du cadrage sur la base | `.../integration/formation/test_cadrage.py` | couvert par la projection d'état et la conclusion |

Total : **27 tests d'intégration** (dont 22 formation + 5 identity déjà comptés), **15 tests
unitaires de dérivation** de formation, **3 tests de normalisation** du code d'invitation et
**3 cas de couverture des handlers** (`apps/api-py/tests/unit/test_handlers.py`), soit 63 cas de la bascule identity (414 → 477) plus 45 cas formation (477 → 522).

### Cas non portés, avec motif

| Test TypeScript | Motif |
|---|---|
| `packages/services/src/auth/{requests,finalize,verify,destination,gotrue-errors}.test.ts` | `auth.*` reste `ts` (ADR-2022) : cookies `Set-Cookie` non comparables. Les portées de SPEC-2101 (`test_authenticate.py`) couvrent la résolution d'acteur et `freshAuth`. |
| `packages/services/src/home/get-home.test.ts` | `home.get` reste `ts` (ADR-2023) : dépend du moteur d'apprentissage de SPEC-2202. |
| `packages/services/src/formations/resume.test.ts` et `packages/services/src/planning/index.test.ts` | `formations.resume` reste `ts` (ADR-2024) : elle rejoue `planSchedule` (SPEC-2202). Les e2e SPEC-618 couvrent la reprise à travers la façade. |
| `packages/services/src/formations/{final-review,set-maintenance}.test.ts`, `replan*` | hors des 26 opérations du périmètre (SPEC-618 : `formations.finalReview`, `formations.maintenance`, `formations.replan`, `formations.replan-options`). |
| `apps/web/e2e/specs/**` étiquetés identity | non rejoués ici : aucun groupe de captures `identity` n'existe. Les e2e du périmètre formation sont rejoués par `validate.mjs` (étape e2e). |
