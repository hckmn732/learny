---
id: SPEC-506
title: "Qualification des modèles personnels"
phase: P5
priority: V1
depends_on: [SPEC-505, SPEC-501]
business_rules: [BR-IA-02, BR-IA-05]
screens: []
adrs: [ADR-0013]
visual: demo
---

# SPEC-506 — Qualification des modèles personnels

## 1. Objectif

Batterie : connexion, appel d'outils, sortie structurée, une brique valide de chaque type ; rapport détaillé ; statut qualified/failed ; API qualify ; affectation aux tâches seulement si qualifié. La livraison est vérifiable par les contrats, les états d’interface et les critères de la section 11.

## 2. Contexte

Lire `docs/product/business-rules.md` (BR-IA-02, BR-IA-05), `docs/architecture/ai.md`, `docs/architecture/data-model.md` §3, §5 et §9, `docs/architecture/overview.md` §4, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. ADR applicables : ADR-0013. Les appels modèle passent par `@learny/llm` ; les tests emploient seulement `LLM_MODE=mock`.

## 3. Dépendances

- **SPEC-505** — lecture serveur des clés personnelles déchiffrées.
- **SPEC-501** — schémas des treize briques.
- Les tests automatiques utilisent `LLM_MODE=mock`, des fixtures versionnées et une horloge fixée à `2026-11-11T12:20:00Z`. Aucune clé personnelle ni appel réel à un fournisseur n’entre dans les preuves.

## 4. Règles métier couvertes

- **BR-IA-02** — Chaque utilisateur peut, **tâche par tâche**, remplacer le modèle par celui d'un fournisseur de son choix (Anthropic, OpenAI, Mistral, DeepSeek, service compatible OpenAI, modèle local) avec **sa propre clé**. Un modèle n'est activable qu'après **qualification** réussie : connexion, appel d'outils, sortie structurée, production valide d'une brique de chaque type.
- **BR-IA-05** — Si le modèle personnel produit une brique invalide après 2 corrections automatiques, la tâche s'arrête, l'utilisateur est notifié et choisit : autre modèle de sa clé, ou IA fournie (si abonné). Aucune bascule automatique vers l'IA payante.

## 5. Exigences fonctionnelles

- **EF-1** — Qualifier un modèle personnel par quatre étapes observables : connexion, appel d’outil, sortie structurée, puis production d’une brique valide pour chacun des treize types du registre.
- **EF-2** — Retourner un rapport par étape et par type de brique avec statut, durée, code d’erreur sûr et version du modèle ; la qualification complète vaut `qualified` seulement si toutes les étapes passent.
- **EF-3** — La route `POST /api/v1/me/ai/credentials/:id/qualify` lance la qualification de la clé appartenant à l’utilisateur, ne renvoie jamais la clé et est idempotente pour une exécution déjà en cours.
- **EF-4** — Un modèle n’est affectable à une tâche de `ai_task_models` que si la qualification est réussie et si ses capacités satisfont la tâche ; un changement de clé ou modèle invalide la qualification précédente.
- **EF-5** — Après deux corrections infructueuses d’une brique lors d’une tâche normale, arrêter `INVALID_OUTPUT` et notifier ; aucun passage automatique à l’IA fournie.

## 6. Exigences techniques

- **ET-1** — `qualifyCredential(ctx, credentialId, modelId)` charge la clé par le serveur SPEC-505, construit des appels de test stricts et persiste `qualification` et `status` dans `ai_credentials`.
- **ET-2** — Chaque brique de la batterie est validée par `packages/bricks` et ses règles communes ; une sortie invalide indique le type et l’erreur de schéma, sans contenu de clé.
- **ET-3** — La qualification est un job borné et reprenable par identifiant ; `qualified_at` est fixé par l’horloge injectée seulement au succès complet.
- **ET-4** — Les entrées et sorties sont validées par Zod ; l’accès aux données passe par le client utilisateur et RLS, les opérations système par un service explicitement autorisé. Les secrets et contenus d’apports ne figurent pas dans les journaux.
- **ET-5** — Les scénarios de test utilisent des fixtures déterministes, un fournisseur simulé et l’horloge injectable. Les échecs externes rendent un code et un message sûrs, sans bascule payante automatique ni résultat inventé.

## 7. Comportements attendus et cas limites

- **CL-1** — Clé supprimée pendant la batterie : arrêt `CREDENTIAL_NOT_FOUND` sans modèle actif.
- **CL-2** — Fournisseur indisponible : étape `connection` en échec, aucun succès partiel déclaré.
- **CL-3** — Un seul type de brique invalide : statut global `failed`, détail des douze autres conservé.
- **CL-4** — Relance concurrente de qualification : une seule exécution ou conflit contrôlé.
- **CL-5** — Clé personnelle défaillante : proposer choix utilisateur, jamais bascule payante automatique.

## 8. Instructions d'implémentation

1. Définir les contrats Zod et les fixtures `LLM_MODE=mock` du scénario ; vérifier les décisions ADR avant toute nouvelle valeur.
2. Implémenter `packages/llm/src/qualification/run.ts` et ses services en séparant validation, accès aux données et appel à `@learny/llm`. Commits atomiques `feat(SPEC-506): …`.
3. Ajouter la page de démonstration SDD avec états succès, absence de données et erreur sûre ; aucune clé ni donnée privée n’est rendue.
4. Écrire tests unitaires, intégration avec RLS et e2e filmé, puis contrôle visuel et axe. Commit `test(SPEC-506): …`.
5. Exécuter `validate.mjs SPEC-506`, renseigner chaque CA avec une preuve réelle et terminer par `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/llm/src/qualification/run.ts`, `packages/llm/src/qualification/fixtures.ts`, `packages/llm/src/qualification/run.test.ts`, `packages/services/src/ai/qualify-model.ts`, `apps/web/app/api/v1/me/ai/credentials/[id]/qualify/route.ts`, `packages/services/test/integration/qualify-model.test.ts`, `apps/web/components/sdd-demos/spec-506.tsx`, `apps/web/e2e/specs/p5/spec-506.spec.ts`.
- **Modifiés** : `packages/contracts/src/index.ts`, `packages/jobs/src/functions/index.ts` si un job est introduit, `apps/web/app/%5Fdev/sdd/registry.ts`, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `@learny/llm`, `@learny/contracts`, `@learny/db`, fixtures mock et services des dépendances ; dépendances SPEC-505, SPEC-501.

## 10. Interface et conformité visuelle

Mode `demo`. Page SDD : table des quatre étapes et treize types, pastilles qualified/failed et erreur sûre ; deux scénarios mock sélectionnables, sans champ de clé. Page `/_dev/sdd/SPEC-506` : afficher le scénario simulé, le contrat d’entrée, le résultat validé et un échec lisible, sans clé ni contenu privé. Mode `demo` : jetons, structure, axe et capture desktop/mobile à 1 %. Aucun appel à un fournisseur réel dans le navigateur.

## 11. Critères d'acceptation

- **CA-1** — Une fixture complète qualifie le modèle après connexion, outil, sortie structurée et treize briques valides ; le rapport détaille chaque étape.
- **CA-2** — Une brique invalide sur treize produit `failed` et empêche l’affectation de ce modèle à une tâche.
- **CA-3** — La route refuse une clé d’un autre utilisateur et ne renvoie aucun octet de clé chiffrée ou déchiffrée.
- **CA-4** — Après deux corrections invalides, la tâche s’arrête `INVALID_OUTPUT` et attend le choix de l’apprenant, sans consommation d’IA fournie.
- **CA-5** — La démonstration montre rapport succès/échec du mock avec vidéo, axe et test `@visual`.

## 12. Plan de tests

- **Unitaires** — `packages/llm/src/qualification/run.test.ts`, `describe('[SPEC-506] Qualification des modèles personnels')` : batterie complète et brique invalide, validation Zod et erreurs simulées (CA-1 à CA-3).
- **Intégration** — `packages/services/test/integration/qualify-model.test.ts`, `describe('[SPEC-506] service')` : qualification persistée, RLS et affectation de tâche, RLS de deux utilisateurs, fournisseur simulé et reprise idempotente (CA-2 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p5/spec-506.spec.ts`, `test('Qualification des modèles personnels @SPEC-506')` : lecture du rapport succès puis échec simulé dans la démonstration, vidéo et capture (CA-1, CA-5).
- **Visuel** — `test('Qualification des modèles personnels @SPEC-506 @visual')` : jetons, structure, axe, desktop/mobile à 1 % (CA-5).
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

Décisions appliquées : ADR-0013, ADR-0298. Les valeurs normatives viennent des règles métier et de la maquette ; aucune valeur produit n’est introduite hors du catalogue. Toute ambiguïté d’implémentation découverte ensuite suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification de la spécification.
