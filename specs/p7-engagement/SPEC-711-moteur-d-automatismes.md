---
id: SPEC-711
title: "Moteur d'automatismes"
phase: P7
priority: V1
depends_on: [SPEC-203, SPEC-209, SPEC-108, SPEC-411]
business_rules: [BR-AUT-11, BR-AUT-12]
screens: []
adrs: [ADR-0190]
visual: demo
---

# SPEC-711 — Moteur d'automatismes

## 1. Objectif

Paquet @learny/automations : définition d'un automatisme (déclencheurs, paramètres, action, explication, annulation), réglages par utilisateur, actions en attente d'accord (accepter/refuser/expirer), journal, annulation, respect des garde-fous, API /me/automations et /me/automation-actions. Cette spécification livre le contrat, le service, les états d’interface ou de démonstration et les validations nécessaires pour que la capacité soit utilisable et prouvée sans appel à un service réel dans les tests.

## 2. Contexte

Lire `docs/product/vision.md`, `docs/product/business-rules.md`, `docs/product/screens.md`, `docs/architecture/overview.md`, `docs/architecture/data-model.md`, `docs/architecture/api.md`, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. La capacité est montrée sur une page SDD hors production. Les maquettes sont en lecture seule ; le jeu de données SPEC-115 et l’horloge du 11 novembre 2026 permettent des captures reproductibles. Les ADR listés en section 15 priment sur ce texte en cas de conflit.

## 3. Dépendances

- **SPEC-203** — Événements de domaine, jobs et crons ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-209** — Service unifié de notifications ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-108** — Schéma agenda, automatismes et série ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-411** — Services de persistance du moteur ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **Architecture transversale** — Les opérations utilisent les contrats Zod de `packages/contracts`, `handler()` de SPEC-201 et le client utilisateur soumis à RLS de SPEC-113. Les dates sont calculées par `@learny/core/time` avec l’horloge injectable ; l’interface réutilise `@learny/ui` et les textes de `apps/web/messages/fr.ts`.
- **Services externes** — Les tests utilisent Supabase local et `LLM_MODE=mock`; tout secret réel reste côté serveur. Si un service tiers est indisponible, exécuter les parties mock, consigner le blocage externe selon `sdd-process.md` §3, sans inventer de résultat.

## 4. Règles métier couvertes

- **BR-AUT-11** — Garde-fous communs : heures calmes et plafond de notifications respectés ; les grands changements (alléger le programme, décaler la fin) attendent toujours l'accord de l'apprenant ; chaque action est expliquée en une ligne, journalisée et annulable (sauf action déjà consommée, ex. micro-séance faite).
- **BR-AUT-12** — Journal de la semaine : liste datée des actions automatiques avec explication et « Annuler » ; compteur « N actions cette semaine ».

## 5. Exigences fonctionnelles

- **EF-1** — Le paquet `@learny/automations` expose `defineAutomation({ key, triggers, params, run, explain, undo, apply? })` pour les dix clés `reprise|micro_seance|echauffement|remediation|jeu_lacune|questions_cartes|plafond_quiz|sprint|bilan|pause` (ADR-0190). Les définitions métier sont ajoutées par SPEC-712 à SPEC-721 ; le moteur fournit ici leur contrat et le registre.
- **EF-2** — Un déclencheur crée une action avec `payload.dedupeKey`, statut `pending_consent|applied|declined|expired|undone|consumed`, explication d’une ligne et contexte. Une action nécessitant accord attend acceptation/refus ; aucune mutation de planning majeure ne précède le consentement.
- **EF-3** — Les réglages par utilisateur activent/désactivent l’automatisme et valident ses paramètres. Le journal renvoie actions datées de la semaine et compteur ; `undo` n’est permis que tant que l’action n’est pas consommée.
- **EF-4** — Avant notification ou application, respecter heures calmes et plafond de SPEC-209 ; les actions et événements rejoués ne dupliquent pas un effet.
- **EF-5** — Les règles métier BR-AUT-11, BR-AUT-12 de la section 4 sont obligatoires dans tous les états, y compris les erreurs et la reprise.

## 6. Exigences techniques

- **ET-1** — Les routes API valident entrée/sortie avec Zod et appellent un service soumis à RLS ; un objet d’un autre utilisateur répond 404. Les mutations rejouables portent une clé d’idempotence.
- **ET-2** — Les actions et notifications sont écrites dans une transaction puis émises après commit ; l’horloge injectable et le fuseau IANA du profil déterminent les échéances et les semaines locales.
- **ET-3** — `AutomationDefinition<P,Payload>` suit ADR-0190 : `key`, `triggers`, `params` Zod, `run(ctx,trigger): Promise<ActionDraft[]>` sans effet de bord, `apply?`, `explain(action,tone,timeZone)` limité à 160 caractères, `undo`. Le registre refuse deux définitions du même ID.
- **ET-4** — `packages/services/src/automations/` persiste réglages et actions en transaction ; l’index unique partiel porte `(user_id, automation, (payload->>'dedupeKey')) where payload ? 'dedupeKey'`. Le moteur suspend les clés autres que `pause` pendant une pause globale et expose `markConsumed(tx, actionId)`.
- **ET-5** — `GET/PATCH /api/v1/me/automations`, `GET /api/v1/me/automation-actions` avec filtres `status|kind|automation|formationId|since|limit|cursor`, `POST /api/v1/me/automation-actions/:id/accept|decline|undo` valident RLS, statut et clé d’idempotence. `accept` transmet `choice` au schéma propre au `kind` ; une acceptation concurrente ne déclenche qu’un effet.

## 7. Comportements attendus et cas limites

- **CL-1** — Identifiant ou donnée hors schéma : 400 `VALIDATION_FAILED`, sans écriture ni événement ; ressource d’un autre propriétaire : 404 sans révéler son existence.
- **CL-2** — Deux demandes concurrentes identiques ne créent qu’un effet ; une version d’objet devenue obsolète renvoie 409 `CONFLICT` et restitue l’état actuel.
- **CL-3** — Action en attente expirée : accepter répond 409 et aucun effet n’est appliqué.
- **CL-4** — Action consommée : `undo` répond 422 et conserve l’historique.
- **CL-5** — Déclencheur reçu pendant pause globale ou automatisme désactivé : aucune nouvelle action, journal précédent intact.

## 8. Instructions d'implémentation

1. Relire les contrats des dépendances et les règles BR-AUT-11, BR-AUT-12 ; définir les schémas Zod et types DTO dans `packages/contracts/src/moteur-d-automatismes.ts`. Ajouter les valeurs métier à `packages/config/src/product.ts` uniquement si elles viennent d’une règle ou d’un ADR. Commit `feat(SPEC-711): définit les contrats`.
2. Écrire `packages/automations/src/moteur-d-automatismes.ts` et ses fonctions pures d’aide ; toute écriture multi-tables est transactionnelle. Utiliser l’horloge injectée et le client RLS. Commit `feat(SPEC-711): implémente la capacité`.
3. Brancher les routes documentées, les événements après commit et les composants ou la page SDD. Réutiliser `@learny/ui` et ajouter les libellés à `apps/web/messages/fr.ts`. Commit `feat(SPEC-711): expose le parcours`.
4. Couvrir chaque EF et CL par les tests section 12 ; utiliser les fixtures du jeu SPEC-115, l’IA mock et l’horloge figée. Créer la référence de non-régression sans toucher aux maquettes. Commit `test(SPEC-711): vérifie le parcours et les limites`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-711`, corriger les erreurs, lier les preuves réelles aux CA dans `evidence/SPEC-711/acceptance.md` puis terminer avec `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/moteur-d-automatismes.ts`, `packages/automations/src/moteur-d-automatismes.ts`, `packages/automations/src/moteur-d-automatismes.test.ts`, `packages/services/test/integration/moteur-d-automatismes.test.ts`, `apps/web/e2e/specs/p7/spec-711.spec.ts`, `apps/web/components/sdd-demos/spec-711.tsx`.
- **Modifiés** : `apps/web/messages/fr.ts`, exports des paquets, routes `apps/web/app/api/v1/**` correspondant à ET-6, composants de l’écran SDD, catalogue d’événements si la capacité en émet.
- **Lus / réutilisés** : `specs/p2-backend/SPEC-203-evenements-de-domaine-jobs-et-crons.md`, `specs/p2-backend/SPEC-209-service-unifie-de-notifications.md`, `specs/p1-donnees/SPEC-108-schema-agenda-automatismes-et-serie.md`, `specs/p4-moteur/SPEC-411-services-de-persistance-du-moteur.md`.

## 10. Interface et conformité visuelle

Mode `demo` : `/_dev/sdd/SPEC-711` affiche les dix clés autorisées et une définition factice isolée des données produit, puis une action en attente, acceptée, consommée et annulée dans un journal de démonstration. L’état montré vient du moteur avec horloge fixe. `data-testid` : `automation-registry`, `automation-state`, `automation-journal`.

- **Contrôles** — vérifier les jetons, l’ordre des régions, les textes, axe sans violation serious/critical et la ligne de base `toHaveScreenshot` ≤ 1 % à 1440 × 900 et 390 × 844. Les états chargement, vide, erreur et permission refusée sont distincts, accessibles au clavier et annoncés sans dépendre de la seule couleur.

## 11. Critères d'acceptation

- **CA-1** — L’énumération contient dix clés uniques ; le registre accepte une définition pour chacune et rejette un doublon ; chaque définition acceptée expose schéma, déclencheurs et explication.
- **CA-2** — Deux livraisons d’un même événement ne produisent qu’une action ; une acceptation concurrente n’applique l’effet qu’une fois ; une action consommée refuse l’annulation.
- **CA-3** — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
- **CA-4** — La démonstration suit les jetons et la structure prescrits ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.

## 12. Plan de tests

- **Unitaires** — `packages/services/src/spec-711.test.ts`, `describe('[SPEC-711] règles et calculs')` : pour CA-1 : Le registre contient dix IDs uniques et rejette un doublon ; chaque définition expose schéma, déclencheurs et explication. ; CA-2 : Deux livraisons d’un même événement ne produisent qu’une action ; une acceptation concurrente n’applique l’effet qu’une fois ; une action consommée refuse l’annulation. Tester aussi valeurs limites, entrée vide, ordre déterministe et fuseau si le comportement dépend du temps.
- **Intégration** — `packages/services/test/integration/spec-711.test.ts`, `describe('[SPEC-711] service et API')` : exécuter les mêmes cas sur Supabase local avec `LLM_MODE=mock`, vérifier les lignes et événements réellement écrits, puis 400, 404 RLS, 409 et double envoi (CA-3).
- **End-to-end** — `apps/web/e2e/specs/p7/spec-711.spec.ts`, `test('parcours SPEC-711 @SPEC-711')` : partir du seed SPEC-115, ouvrir /_dev/sdd/SPEC-711, effectuer les actions des CA-1 à CA-2, recharger, contrôler le résultat et conserver la vidéo. Tester l’état erreur et lancer axe.
- **Visuel** — `test('conformité SPEC-711 @SPEC-711 @visual')` : jetons, régions, textes, captures desktop/mobile ≤ 1 % et axe (CA-4).
- **Non-régression** — Rejouer les étiquettes `[SPEC-203]` et `@SPEC-203`, `[SPEC-209]` et `@SPEC-209`, `[SPEC-108]` et `@SPEC-108`, `[SPEC-411]` et `@SPEC-411` en plus des suites unitaires/intégration complètes.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-2 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-3 | intégration RLS, invalides et idempotence |
| CA-4 | e2e et `@SPEC-711 @visual` |

## 13. Preuves attendues

`evidence/SPEC-711/` contient les rapports réels `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, au moins une vidéo Playwright, les captures finales et `acceptance.md` avec preuve vérifiable pour CA-1 à CA-4. Conserver la capture de la page de démonstration ou de l’écran sans maquette. Une pièce manquante fait échouer la validation ; aucune preuve n’est fabriquée.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent : lint, typecheck, build, unitaires, intégration, e2e avec vidéo, `@visual`, axe, non-régression et CA cochés avec preuve. Les limites et cas d’échec de cette spécification sont couverts, les contrats API restent documentés, et aucune donnée d’un autre utilisateur n’est rendue.

## 15. Décisions et hypothèses

- ADR-0190 fixe le contrat `defineAutomation`, les six statuts, les clés d’idempotence, le champ `choice`, `markConsumed` et les routes du moteur. Le catalogue devra inclure cet ADR dans l’entrée SPEC-711.
- Aucune décision ouverte : une ambiguïté découverte pendant l’implémentation suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification du périmètre.

