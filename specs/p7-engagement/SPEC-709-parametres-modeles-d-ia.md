---
id: SPEC-709
title: "Paramètres : Modèles d'IA"
phase: P7
priority: V1
depends_on: [SPEC-707, SPEC-506, SPEC-507]
business_rules: [BR-SET-05, BR-IA-02, BR-IA-03, BR-IA-04]
screens: [SCR-15]
adrs: [ADR-0328, ADR-0341]
visual: mockup
---

# SPEC-709 — Paramètres : Modèles d'IA

## 1. Objectif

Onglet Modèles d'IA : fournisseurs connectés, affectation immédiate par tâche, état `Vérification…` / `Compatible` / `Sous réserve`, raisons visibles, « Revérifier », et ajout d’une clé avec découverte des modèles de chat puis connexion unique.

## 2. Contexte

Lire `docs/product/vision.md`, `docs/product/business-rules.md`, `docs/product/screens.md`, `docs/architecture/overview.md`, `docs/architecture/data-model.md`, `docs/architecture/api.md`, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. Écran concerné : SCR-15 : route du catalogue. Les maquettes sont en lecture seule ; le jeu de données SPEC-115 et l’horloge du 11 novembre 2026 permettent des captures reproductibles. Les ADR listés en section 15 priment sur ce texte en cas de conflit.

## 3. Dépendances

- **SPEC-707** — Paramètres : onglets et Profil ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-506** — Qualification des modèles personnels ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-507** — Garde-fou de coût et journal des appels ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **Architecture transversale** — Les opérations utilisent les contrats Zod de `packages/contracts`, `handler()` de SPEC-201 et le client utilisateur soumis à RLS de SPEC-113. Les dates sont calculées par `@learny/core/time` avec l’horloge injectable ; l’interface réutilise `@learny/ui` et les textes de `apps/web/messages/fr.ts`.
- **Services externes** — Les tests utilisent Supabase local et `LLM_MODE=mock`; tout secret réel reste côté serveur. Si un service tiers est indisponible, exécuter les parties mock, consigner le blocage externe selon `sdd-process.md` §3, sans inventer de résultat.

## 4. Règles métier couvertes

- **BR-SET-05** — Modèles d’IA : cinq tâches, capacités exigées, fournisseurs connectés, avertissement régional, affectation immédiate et compatibilité visible par tâche.
- **BR-IA-02** — La connexion de la clé est vérifiée à l’ajout ; l’affectation n’est jamais rejetée au motif d’une qualification ou d’une réserve.
- **BR-IA-03** — Les clés d'API des utilisateurs sont chiffrées au repos (AES-256-GCM), jamais renvoyées au navigateur, affichées masquées (`sk-••••••••` + 4 derniers caractères), supprimables à tout moment.
- **BR-IA-04** — Un avertissement « Traite les données hors de l'Union européenne » s'affiche pour tout fournisseur hors UE.

## 5. Exigences fonctionnelles

- **EF-1** — Afficher les cinq tâches avec capacités requises et tous les modèles de chat des clés connectées. L’affectation est enregistrée avant la vérification et l’état est `pending`, `compatible` ou `reserve`.
- **EF-2** — « Revenir aux modèles par défaut » retire les affectations personnelles sans supprimer les clés ; les pastilles « Par défaut », « Personnalisé » et « Hors UE » reflètent le modèle réellement résolu.
- **EF-3** — Ajouter un fournisseur découvre ses modèles de chat, teste une connexion, puis n’affiche que « Connexion vérifiée ». Il n’y a ni batterie de briques, ni statut de qualification global.
- **EF-4** — Pour un fournisseur hors UE, afficher exactement « Traite les données hors de l’Union européenne » avant validation et dans la carte.
- **EF-5** — Les réserves non bloquantes `STRUCTURED_UNRELIABLE`, `NO_VISION`, `NO_TOOLS` affichent leur message français serveur ; le bouton accessible « Revérifier » relance uniquement la combinaison sélectionnée.

## 6. Exigences techniques

- **ET-1** — Les routes API valident entrée/sortie avec Zod et appellent un service soumis à RLS ; un objet d’un autre utilisateur répond 404. Les mutations rejouables portent une clé d’idempotence.
- **ET-2** — Les actions et notifications sont écrites dans une transaction puis émises après commit ; l’horloge injectable et le fuseau IANA du profil déterminent les échéances et les semaines locales.
- **ET-3** — Les DTO sont additifs : l’état de compatibilité par tâche et la connexion de clé ; ils ne contiennent jamais la clé brute. `PATCH /me/ai/models` accepte l’affectation et son contrat d’erreur ne contient pas `AI_MODEL_NOT_QUALIFIED`.
- **ET-4** — `pending` est transitoire et accessible ; un contrôle produit `compatible|reserve`, persiste par `(credential, model, task)` avec `checkedAt`, puis est réutilisé après rechargement.
- **ET-5** — L’URL d’un fournisseur compatible/local est validée côté serveur par le garde anti-SSRF ; les champs de clé ne sont jamais journalisés ni mis en cache navigateur.

## 7. Comportements attendus et cas limites

- **CL-1** — Identifiant ou donnée hors schéma : 400 `VALIDATION_FAILED`, sans écriture ni événement ; ressource d’un autre propriétaire : 404 sans révéler son existence.
- **CL-2** — Deux demandes concurrentes identiques ne créent qu’un effet ; une version d’objet devenue obsolète renvoie 409 `CONFLICT` et restitue l’état actuel.
- **CL-3** — Une réserve est visible et non bloquante. Seule une clé ou un modèle réellement absent rend l’affectation indisponible.
- **CL-4** — Suppression d’une clé affectée : retirer ou invalider les affectations correspondantes dans la même transaction.
- **CL-5** — Ancienne qualification `failed` : tolérer le modèle, afficher `pending` en l’absence d’un contrôle de tâche, puis laisser « Revérifier » produire le nouvel état.

## 8. Instructions d'implémentation

1. Relire les contrats des dépendances et les règles BR-SET-05, BR-IA-02, BR-IA-03, BR-IA-04 ; définir les schémas Zod et types DTO dans `packages/contracts/src/parametres-modeles-d-ia.ts`. Ajouter les valeurs métier à `packages/config/src/product.ts` uniquement si elles viennent d’une règle ou d’un ADR. Commit `feat(SPEC-709): définit les contrats`.
2. Écrire `packages/services/src/parametres-modeles-d-ia.ts` et ses fonctions pures d’aide ; toute écriture multi-tables est transactionnelle. Utiliser l’horloge injectée et le client RLS. Commit `feat(SPEC-709): implémente la capacité`.
3. Brancher les routes documentées, les événements après commit et les composants ou la page SDD. Réutiliser `@learny/ui` et ajouter les libellés à `apps/web/messages/fr.ts`. Commit `feat(SPEC-709): expose le parcours`.
4. Couvrir chaque EF et CL par les tests section 12 ; utiliser les fixtures du jeu SPEC-115, l’IA mock et l’horloge figée. Créer la référence de non-régression sans toucher aux maquettes. Commit `test(SPEC-709): vérifie le parcours et les limites`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-709`, corriger les erreurs, lier les preuves réelles aux CA dans `evidence/SPEC-709/acceptance.md` puis terminer avec `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/parametres-modeles-d-ia.ts`, `packages/services/src/parametres-modeles-d-ia.ts`, `packages/services/src/parametres-modeles-d-ia.test.ts`, `packages/services/test/integration/parametres-modeles-d-ia.test.ts`, `apps/web/e2e/specs/p7/spec-709.spec.ts`.
- **Modifiés** : `apps/web/messages/fr.ts`, exports des paquets, routes `apps/web/app/api/v1/**` correspondant à ET-6, composants de l’écran SCR-15, catalogue d’événements si la capacité en émet.
- **Lus / réutilisés** : `specs/p7-engagement/SPEC-707-parametres-onglets-et-profil.md`, `specs/p5-ia/SPEC-506-qualification-des-modeles-personnels.md`, `specs/p5-ia/SPEC-507-garde-fou-de-cout-et-journal-des-appels.md`.

## 10. Interface et conformité visuelle

`Parametres.dc.html`, onglet Modèles d’IA : bandeau, cinq lignes de tâches, cartes fournisseurs, connexion, badges de compatibilité, raisons et avertissement hors UE. `data-testid` : `ai-task-model`, `provider-card`, `provider-qualify`, `provider-region-warning`, `ai-compatibility-recheck`.

- **Contrôles** — Utiliser la référence du SCR-15 dans `design/references/` et mesurer ≤ 12 % de pixels différents ; vérifier les jetons, l’ordre des régions, les textes, axe sans violation serious/critical et la ligne de base `toHaveScreenshot` ≤ 1 % à 1440 × 900 et 390 × 844. Les états chargement, vide, erreur et permission refusée sont distincts, accessibles au clavier et annoncés sans dépendre de la seule couleur.

## 11. Critères d'acceptation

- **CA-1** — Un ancien modèle `failed` reste sélectionnable ; l’affectation est immédiate, puis son contrôle vaut `pending|compatible|reserve` et peut être retirée sans supprimer la clé.
- **CA-2** — La carte de clé ne rend que les quatre derniers caractères et l’avertissement hors UE apparaît avant enregistrement.
- **CA-3** — Un second utilisateur reçoit 404 ; une affectation même sous réserve répond 200 et ne renvoie jamais `AI_MODEL_NOT_QUALIFIED`; idempotence et invalides restent inchangés.
- **CA-4** — L’écran respecte la maquette avec un écart ≤ 12 % ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.

## 12. Plan de tests

- **Unitaires** — `packages/services/src/spec-709.test.ts` : ancien `failed` sélectionnable, affectation immédiate, état `pending`, compatibilité et messages, masque de clé, avertissement hors UE, invalides et ordre déterministe.
- **Intégration** — `packages/services/test/integration/spec-709.test.ts`, `describe('[SPEC-709] service et API')` : exécuter les mêmes cas sur Supabase local avec `LLM_MODE=mock`, vérifier les lignes et événements réellement écrits, puis 400, 404 RLS, 409 et double envoi (CA-3).
- **End-to-end** — `apps/web/e2e/specs/p7/spec-709.spec.ts` : ajouter et connecter une clé, affecter immédiatement, vérifier `compatible|reserve`, ouvrir « Revérifier », recharger, tester l’état erreur, axe et vidéo.
- **Visuel** — `test('conformité SPEC-709 @SPEC-709 @visual')` : jetons, régions, textes, comparaison de référence ≤ 12 %, captures desktop/mobile ≤ 1 % et axe (CA-4).
- **Non-régression** — Rejouer les étiquettes `[SPEC-707]` et `@SPEC-707`, `[SPEC-506]` et `@SPEC-506`, `[SPEC-507]` et `@SPEC-507` en plus des suites unitaires/intégration complètes.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-2 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-3 | intégration RLS, invalides et idempotence |
| CA-4 | e2e et `@SPEC-709 @visual` |

## 13. Preuves attendues

`evidence/SPEC-709/` contient les rapports réels `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, au moins une vidéo Playwright, les captures finales et `acceptance.md` avec preuve vérifiable pour CA-1 à CA-4. Conserver la comparaison côte à côte et le diff avec la référence de maquette. Une pièce manquante fait échouer la validation ; aucune preuve n’est fabriquée.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent : lint, typecheck, build, unitaires, intégration, e2e avec vidéo, `@visual`, axe, non-régression et CA cochés avec preuve. Les limites et cas d’échec de cette spécification sont couverts, les contrats API restent documentés, et aucune donnée d’un autre utilisateur n’est rendue.

## 15. Décisions et hypothèses

- ADR-0328 est amendée par ADR-0341 : la qualification bloquante et l’exclusion des modèles échoués sont remplacées par l’affectation immédiate et une compatibilité non bloquante.
- Messages de réserve normatifs : `STRUCTURED_UNRELIABLE` « La sortie structurée de ce modèle n’est pas fiable pour cette tâche. Vous pouvez le conserver avec réserve. » ; `NO_VISION` « Ce modèle ne prend pas en charge les images requises pour cette tâche. » ; `NO_TOOLS` « Ce modèle ne prend pas en charge les appels d’outils requis pour cette tâche. »

