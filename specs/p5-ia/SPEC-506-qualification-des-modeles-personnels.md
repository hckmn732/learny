---
id: SPEC-506
title: "Qualification des modèles personnels"
phase: P5
priority: V1
depends_on: [SPEC-505, SPEC-501]
business_rules: [BR-IA-02, BR-IA-05]
screens: []
adrs: [ADR-0013, ADR-0341]
visual: demo
---

# SPEC-506 — Qualification des modèles personnels

## 1. Objectif

Connexion légère à l’ajout de la clé, découverte des seuls modèles de chat, puis vérification non bloquante des capacités réellement exigées par chaque tâche. Le résultat est réutilisable et horodaté par `(credential, model, task)` ; une affectation reste immédiate.

## 2. Contexte

Lire `docs/product/business-rules.md` (BR-IA-02, BR-IA-05), `docs/architecture/ai.md`, `docs/architecture/data-model.md` §3, §5 et §9, `docs/architecture/overview.md` §4, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. ADR applicables : ADR-0013. Les appels modèle passent par `@learny/llm` ; les tests emploient seulement `LLM_MODE=mock`.

## 3. Dépendances

- **SPEC-505** — lecture serveur des clés personnelles déchiffrées.
- **SPEC-501** — schémas des treize briques.
- Les tests automatiques utilisent `LLM_MODE=mock`, des fixtures versionnées et une horloge fixée à `2026-11-11T12:20:00Z`. Aucune clé personnelle ni appel réel à un fournisseur n’entre dans les preuves.

## 4. Règles métier couvertes

- **BR-IA-02** — Chaque utilisateur peut, **tâche par tâche**, choisir le modèle d’un fournisseur avec sa propre clé. La connexion est vérifiée à l’ajout ; la compatibilité de la tâche est ensuite signalée sans bloquer l’affectation.
- **BR-IA-05** — Si le modèle personnel produit une brique invalide après 2 corrections automatiques, la tâche s'arrête, l'utilisateur est notifié et choisit : autre modèle de sa clé, ou IA fournie (si abonné). Aucune bascule automatique vers l'IA payante.

## 5. Exigences fonctionnelles

- **EF-1** — À l’ajout, découvrir uniquement les modèles de chat et effectuer exactement un appel de connexion sur un modèle de chat. Aucune batterie de treize briques n’est lancée pour enregistrer la clé.
- **EF-2** — Après affectation, vérifier uniquement les capacités de `TASK_CONFIG` exigées par la tâche : outil strict si `tools`, sortie structurée si `structured`, image si `vision`. `web_search` et `passage_refs` utilisent leurs mécanismes existants ; aucune sonde supplémentaire n’est introduite.
- **EF-3** — La route `POST /api/v1/me/ai/credentials/:id/qualify` teste la connexion sans `task`, ou la compatibilité avec `task`. Elle ne renvoie jamais la clé.
- **EF-4** — Chaque contrôle est persisté sous la clé `(credentialId, modelId, task)` avec `checkedAt`. Un résultat existant est renvoyé dans l’état puis « Revérifier » force un nouveau contrôle.
- **EF-5** — Le résultat vaut `compatible` ou, sans bloquer l’affectation, `reserve` avec un ou plusieurs codes : `STRUCTURED_UNRELIABLE`, `NO_VISION`, `NO_TOOLS`. Les anciens rapports `failed` restent tolérés.
- **EF-6** — Les briques produites par les tâches normales continuent d’être validées, corrigées et arrêtées après les deux corrections infructueuses prévues par le mécanisme existant.

## 6. Exigences techniques

- **ET-1** — La connexion à l’ajout et la révérification utilisent une session `@learny/llm` et ne déchiffrent jamais la clé hors du serveur.
- **ET-2** — Les outils sont déclarés `strict`, les sorties structurées utilisent leur schéma Zod, et la sonde image ne part que pour une tâche qui exige `vision`.
- **ET-3** — La compatibilité est sauvegardée dans `ai_credentials.qualification.compatibilities` sous la triple cible avec `checkedAt` et durée ; la réutilisation ne change pas cette valeur.
- **ET-4** — Les entrées et sorties sont validées par Zod ; l’accès aux données passe par le client utilisateur et RLS, les opérations système par un service explicitement autorisé. Les secrets et contenus d’apports ne figurent pas dans les journaux.
- **ET-5** — Les scénarios de test utilisent des fixtures déterministes, un fournisseur simulé et l’horloge injectable. Les échecs externes rendent un code et un message sûrs, sans bascule payante automatique ni résultat inventé.

## 7. Comportements attendus et cas limites

- **CL-1** — Clé supprimée pendant le contrôle : `CREDENTIAL_NOT_FOUND`, sans modèle inventé.
- **CL-2** — La connexion en échec empêche l’enregistrement initial ; aucune clé ne reste partiellement créée.
- **CL-3** — Un échec de sonde structurée, image ou outil devient respectivement `STRUCTURED_UNRELIABLE`, `NO_VISION`, `NO_TOOLS`, puis l’affectation demeure écrite.
- **CL-4** — Une affectation sans résultat précédent répond immédiatement avec `pending`.
- **CL-5** — Le même triple déjà contrôlé est réutilisé ; « Revérifier » remplace son résultat et son horodatage.

## 8. Instructions d'implémentation

1. Définir les contrats Zod et les fixtures `LLM_MODE=mock` du scénario ; vérifier les décisions ADR avant toute nouvelle valeur.
2. Implémenter `packages/llm/src/qualification/compatibility.ts` et ses services en séparant validation, accès aux données et appel à `@learny/llm`. Commits atomiques `feat(SPEC-506): …`.
3. Ajouter la page de démonstration SDD avec états succès, absence de données et erreur sûre ; aucune clé ni donnée privée n’est rendue.
4. Écrire tests unitaires, intégration avec RLS et e2e filmé, puis contrôle visuel et axe. Commit `test(SPEC-506): …`.
5. Exécuter `validate.mjs SPEC-506`, renseigner chaque CA avec une preuve réelle et terminer par `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/llm/src/qualification/compatibility.ts`, `packages/llm/src/qualification/compatibility.test.ts`, `packages/services/src/ai/qualify-model.ts`, `packages/services/test/integration/qualify-model.test.ts`, `apps/web/e2e/specs/p5/spec-506.spec.ts`.
- **Modifiés** : `packages/contracts/src/index.ts`, `packages/jobs/src/functions/index.ts` si un job est introduit, `apps/web/app/%5Fdev/sdd/registry.ts`, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `@learny/llm`, `@learny/contracts`, `@learny/db`, fixtures mock et services des dépendances ; dépendances SPEC-505, SPEC-501.

## 10. Interface et conformité visuelle

Mode `demo`. Page SDD : capacités exigées, état `compatible` ou `reserve`, codes et raisons françaises ; une section rappelle que les briques générées conservent leur validation et leurs deux corrections. Aucun appel à un fournisseur réel dans le navigateur.

## 11. Critères d'acceptation

- **CA-1** — La découverte exclut les modèles non conversationnels et l’ajout effectue une seule connexion sur un modèle de chat.
- **CA-2** — Une tâche lance seulement les sondes de ses capacités ; `NO_TOOLS`, `NO_VISION` et `STRUCTURED_UNRELIABLE` sont non bloquants et portent exactement leurs messages français.
- **CA-3** — L’affectation existe immédiatement avec `pending`, puis réutilise `compatible|reserve` par `(credential, model, task)` et `checkedAt`.
- **CA-4** — La route refuse une clé étrangère sans renvoyer de secret ; aucun appel d’affectation ne répond `422 AI_MODEL_NOT_QUALIFIED`.
- **CA-5** — Les briques générées en tâche normale conservent validation, deux corrections et arrêt `INVALID_OUTPUT`; e2e, vidéo, axe et `@visual` restent verts.

## 12. Plan de tests

- **Unitaires `[SPEC-506]`** — filtres de découverte, sondes conditionnelles, messages des trois réserves, contrats additifs, filtrage de `CONTEXT_TOO_LONG` et assainissement des journaux (CA-1 à CA-4).
- **Intégration `[SPEC-506]`** — connexion persistée, RLS, affectation immédiate `pending`, compatibilité persistée/réutilisée, ancien `failed` toléré et absence de `AI_MODEL_NOT_QUALIFIED` (CA-1 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p5/spec-506.spec.ts` : connexion simulée, contrôle compatible puis réserve visible, vidéo et capture (CA-1 à CA-5).
- **Visuel** — `test('démonstration de qualification @SPEC-506 @visual')` : jetons, structure, axe, desktop/mobile à 1 % sans régénérer la référence visuelle (CA-5).
- **Non-régression** — rejouer les étiquettes `[SPEC-505]` / `@SPEC-505`, `[SPEC-501]` / `@SPEC-501`.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; e2e |
| CA-2 | unitaires ; intégration |
| CA-3 | unitaires ; intégration |
| CA-4 | intégration |
| CA-5 | e2e ; @visual |

## 13. Preuves attendues

`evidence/SPEC-506/` contient `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, une vidéo réelle du scénario `@SPEC-506`, captures desktop/mobile, comparaisons visuelles applicables et `acceptance.md` reliant chaque CA au test et à sa sortie. Aucune capture ou réussite n’est déclarée sans fichier effectivement généré.

## 14. Définition de terminé

La définition commune de `docs/engineering/testing.md` §7 est remplie : lint, typecheck, build, tests unitaires et d’intégration filtrés, e2e avec vidéo, au moins un test `@visual`, axe, preuves et absence de régression. Le fournisseur simulé couvre le succès et les erreurs ; aucune clé ou donnée privée n’apparaît dans les preuves et aucun appel réel n’a lieu en CI.

## 15. Décisions et hypothèses

Décisions appliquées : ADR-0013 et ADR-0341. ADR-0298 est remplacée : sa batterie bloquante, ses capacités globales et son gate d’affectation ne s’appliquent plus. ADR-0341 prime.
