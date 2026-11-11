---
id: SPEC-717
title: "Automatisme 6 : questions transformées en cartes"
phase: P7
priority: V1
depends_on: [SPEC-711, SPEC-610]
business_rules: [BR-AUT-06]
screens: [SCR-03]
adrs: [ADR-0190, ADR-0193]
visual: tokens
---

# SPEC-717 — Automatisme 6 : questions transformées en cartes

## 1. Objectif

Transformation d'une question posée au tuteur en carte de rappel (avec confirmation depuis l'accueil ou automatique), intégration au quiz global, journal. Cette spécification livre le contrat, le service, les états d’interface ou de démonstration et les validations nécessaires pour que la capacité soit utilisable et prouvée sans appel à un service réel dans les tests.

## 2. Contexte

Lire `docs/product/vision.md`, `docs/product/business-rules.md`, `docs/product/screens.md`, `docs/architecture/overview.md`, `docs/architecture/data-model.md`, `docs/architecture/api.md`, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. Écran concerné : SCR-03 : `/accueil` (`/` redirige). Les maquettes sont en lecture seule ; le jeu de données SPEC-115 et l’horloge du 11 novembre 2026 permettent des captures reproductibles. Les ADR listés en section 15 priment sur ce texte en cas de conflit.

## 3. Dépendances

- **SPEC-711** — Moteur d'automatismes ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-610** — Discussion contextuelle avec le tuteur ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **Architecture transversale** — Les opérations utilisent les contrats Zod de `packages/contracts`, `handler()` de SPEC-201 et le client utilisateur soumis à RLS de SPEC-113. Les dates sont calculées par `@learny/core/time` avec l’horloge injectable ; l’interface réutilise `@learny/ui` et les textes de `apps/web/messages/fr.ts`.
- **Services externes** — Les tests utilisent Supabase local et `LLM_MODE=mock`; tout secret réel reste côté serveur. Si un service tiers est indisponible, exécuter les parties mock, consigner le blocage externe selon `sdd-process.md` §3, sans inventer de résultat.

## 4. Règles métier couvertes

- **BR-AUT-06** — **Questions transformées en cartes** : une question posée au tuteur peut devenir une carte de rappel ; mode « avec ma confirmation » (défaut) ou automatique.

## 5. Exigences fonctionnelles

- **EF-1** — Une question de discussion `tutor/question-asked` peut produire une carte de rappel avec question, réponse vérifiée, notion et source de conversation ; mode « avec ma confirmation » par défaut ou automatique.
- **EF-2** — En mode confirmation, la carte apparaît dans le bandeau d’accueil en attente ; accepter la rend disponible dans le quiz global, refuser ne la publie pas. En mode automatique, elle est publiée directement puis journalisée.
- **EF-3** — Une question répétée ne crée pas de deuxième carte pour la même conversation/notion ; la carte est exclue si le contenu source est signalé erroné.
- **EF-4** — Les règles métier BR-AUT-06 de la section 4 sont obligatoires dans tous les états, y compris les erreurs et la reprise.

## 6. Exigences techniques

- **ET-1** — Les routes API valident entrée/sortie avec Zod et appellent un service soumis à RLS ; un objet d’un autre utilisateur répond 404. Les mutations rejouables portent une clé d’idempotence.
- **ET-2** — Les actions et notifications sont écrites dans une transaction puis émises après commit ; l’horloge injectable et le fuseau IANA du profil déterminent les échéances et les semaines locales.
- **ET-3** — Définition `questions_cartes` via `defineAutomation` d’ADR-0190 : consomme `tutor/question-asked` de SPEC-610 ; génération via registre `create_or_update` et validation du schéma `recall_card` de SPEC-501.
- **ET-4** — Action `kind='card_created'`, `status='pending_consent'` ou `applied` selon le réglage, avec `payload.dedupeKey` sur question+notion, `brickId`, explication et `undo` qui retire la carte des futurs tirages sans effacer les révisions déjà jouées (ADR-0193).
- **ET-5** — Le tirage SPEC-406/701 voit la carte seulement en état appliqué ; la confirmation utilise les routes de SPEC-711.

## 7. Comportements attendus et cas limites

- **CL-1** — Identifiant ou donnée hors schéma : 400 `VALIDATION_FAILED`, sans écriture ni événement ; ressource d’un autre propriétaire : 404 sans révéler son existence.
- **CL-2** — Deux demandes concurrentes identiques ne créent qu’un effet ; une version d’objet devenue obsolète renvoie 409 `CONFLICT` et restitue l’état actuel.
- **CL-3** — Réponse du tuteur non validée ou sans notion : ne pas créer de carte et journaliser le motif.
- **CL-4** — Refus de confirmation : aucun brick actif ni tirage ; un second événement identique reste dédupliqué.
- **CL-5** — Carte déjà jouée : annulation retire les futurs tirages mais conserve le journal de réponse.

## 8. Instructions d'implémentation

1. Relire les contrats des dépendances et les règles BR-AUT-06 ; définir les schémas Zod et types DTO dans `packages/contracts/src/automatisme-6-questions-transformees-en-cartes.ts`. Ajouter les valeurs métier à `packages/config/src/product.ts` uniquement si elles viennent d’une règle ou d’un ADR. Commit `feat(SPEC-717): définit les contrats`.
2. Écrire `packages/automations/src/automatisme-6-questions-transformees-en-cartes.ts` et ses fonctions pures d’aide ; toute écriture multi-tables est transactionnelle. Utiliser l’horloge injectée et le client RLS. Commit `feat(SPEC-717): implémente la capacité`.
3. Brancher les routes documentées, les événements après commit et les composants ou la page SDD. Réutiliser `@learny/ui` et ajouter les libellés à `apps/web/messages/fr.ts`. Commit `feat(SPEC-717): expose le parcours`.
4. Couvrir chaque EF et CL par les tests section 12 ; utiliser les fixtures du jeu SPEC-115, l’IA mock et l’horloge figée. Créer la référence de non-régression sans toucher aux maquettes. Commit `test(SPEC-717): vérifie le parcours et les limites`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-717`, corriger les erreurs, lier les preuves réelles aux CA dans `evidence/SPEC-717/acceptance.md` puis terminer avec `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/automatisme-6-questions-transformees-en-cartes.ts`, `packages/automations/src/automatisme-6-questions-transformees-en-cartes.ts`, `packages/automations/src/automatisme-6-questions-transformees-en-cartes.test.ts`, `packages/services/test/integration/automatisme-6-questions-transformees-en-cartes.test.ts`, `apps/web/e2e/specs/p7/spec-717.spec.ts`.
- **Modifiés** : `apps/web/messages/fr.ts`, exports des paquets, routes `apps/web/app/api/v1/**` correspondant à ET-6, composants de l’écran SCR-03, catalogue d’événements si la capacité en émet.
- **Lus / réutilisés** : `specs/p7-engagement/SPEC-711-moteur-d-automatismes.md`, `specs/p6-parcours/SPEC-610-discussion-contextuelle-avec-le-tuteur.md`.

## 10. Interface et conformité visuelle

SCR-03 : bandeau « Le tuteur propose · votre accord est demandé » et carte de rappel en attente avec Accepter/Refuser ; après acceptation, carte « Le tuteur a agi pour vous ».

- **Contrôles** — vérifier les jetons, l’ordre des régions, les textes, axe sans violation serious/critical et la ligne de base `toHaveScreenshot` ≤ 1 % à 1440 × 900 et 390 × 844. Les états chargement, vide, erreur et permission refusée sont distincts, accessibles au clavier et annoncés sans dépendre de la seule couleur.

## 11. Critères d'acceptation

- **CA-1** — Avec réglage par défaut, une question produit une action en attente et aucune carte de quiz avant acceptation ; l’acceptation crée une seule carte.
- **CA-2** — En mode automatique, la carte validée entre au prochain quiz et une livraison répétée n’en crée pas de deuxième.
- **CA-3** — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
- **CA-4** — La démonstration suit les jetons et la structure prescrits ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.

## 12. Plan de tests

- **Unitaires** — `packages/services/src/spec-717.test.ts`, `describe('[SPEC-717] règles et calculs')` : pour CA-1 : Avec réglage par défaut, une question produit une action en attente et aucune carte de quiz avant acceptation ; l’acceptation crée une seule carte. ; CA-2 : En mode automatique, la carte validée entre au prochain quiz et une livraison répétée n’en crée pas de deuxième. Tester aussi valeurs limites, entrée vide, ordre déterministe et fuseau si le comportement dépend du temps.
- **Intégration** — `packages/services/test/integration/spec-717.test.ts`, `describe('[SPEC-717] service et API')` : exécuter les mêmes cas sur Supabase local avec `LLM_MODE=mock`, vérifier les lignes et événements réellement écrits, puis 400, 404 RLS, 409 et double envoi (CA-3).
- **End-to-end** — `apps/web/e2e/specs/p7/spec-717.spec.ts`, `test('parcours SPEC-717 @SPEC-717')` : partir du seed SPEC-115, ouvrir SCR-03, effectuer les actions des CA-1 à CA-2, recharger, contrôler le résultat et conserver la vidéo. Tester l’état erreur et lancer axe.
- **Visuel** — `test('conformité SPEC-717 @SPEC-717 @visual')` : jetons, régions, textes, captures desktop/mobile ≤ 1 % et axe (CA-4).
- **Non-régression** — Rejouer les étiquettes `[SPEC-711]` et `@SPEC-711`, `[SPEC-610]` et `@SPEC-610` en plus des suites unitaires/intégration complètes.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-2 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-3 | intégration RLS, invalides et idempotence |
| CA-4 | e2e et `@SPEC-717 @visual` |

## 13. Preuves attendues

`evidence/SPEC-717/` contient les rapports réels `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, au moins une vidéo Playwright, les captures finales et `acceptance.md` avec preuve vérifiable pour CA-1 à CA-4. Conserver la capture de la page de démonstration ou de l’écran sans maquette. Une pièce manquante fait échouer la validation ; aucune preuve n’est fabriquée.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent : lint, typecheck, build, unitaires, intégration, e2e avec vidéo, `@visual`, axe, non-régression et CA cochés avec preuve. Les limites et cas d’échec de cette spécification sont couverts, les contrats API restent documentés, et aucune donnée d’un autre utilisateur n’est rendue.

## 15. Décisions et hypothèses

- ADR-0190 fixe le contrat des automatismes ; ADR-0193 fixe les cartes de rappel issues des questions. Le catalogue doit référencer ces deux ADR pour SPEC-717.
- Aucune décision ouverte : une ambiguïté découverte pendant l’implémentation suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification du périmètre.

