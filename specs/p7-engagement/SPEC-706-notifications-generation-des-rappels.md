---
id: SPEC-706
title: "Notifications : génération des rappels"
phase: P7
priority: V1
depends_on: [SPEC-209, SPEC-306, SPEC-411]
business_rules: [BR-NOT-02, BR-NOT-07, BR-NOT-01]
screens: [SCR-03]
adrs: [ADR-0031]
visual: mockup
---

# SPEC-706 — Notifications : génération des rappels

## 1. Objectif

Producteurs de notifications pour chaque type de BR-NOT-02 (programme du jour, quiz à venir 40 min, cours prêt, quiz global du jour, nouvelle lacune, séance prévue, module validé, séance à replacer, jalon, export prêt, échec IA, alerte coût, invitation), textes selon le ton, liens profonds. Cette spécification livre le contrat, le service, les états d’interface ou de démonstration et les validations nécessaires pour que la capacité soit utilisable et prouvée sans appel à un service réel dans les tests.

## 2. Contexte

Lire `docs/product/vision.md`, `docs/product/business-rules.md`, `docs/product/screens.md`, `docs/architecture/overview.md`, `docs/architecture/data-model.md`, `docs/architecture/api.md`, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. Écran concerné : SCR-03 : `/accueil` (`/` redirige). Les maquettes sont en lecture seule ; le jeu de données SPEC-115 et l’horloge du 11 novembre 2026 permettent des captures reproductibles. Les ADR listés en section 15 priment sur ce texte en cas de conflit.

## 3. Dépendances

- **SPEC-209** — Service unifié de notifications ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-306** — Panneau des notifications ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-411** — Services de persistance du moteur ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **Architecture transversale** — Les opérations utilisent les contrats Zod de `packages/contracts`, `handler()` de SPEC-201 et le client utilisateur soumis à RLS de SPEC-113. Les dates sont calculées par `@learny/core/time` avec l’horloge injectable ; l’interface réutilise `@learny/ui` et les textes de `apps/web/messages/fr.ts`.
- **Services externes** — Les tests utilisent Supabase local et `LLM_MODE=mock`; tout secret réel reste côté serveur. Si un service tiers est indisponible, exécuter les parties mock, consigner le blocage externe selon `sdd-process.md` §3, sans inventer de résultat.

## 4. Règles métier couvertes

- **BR-NOT-02** — Types : quiz de validation à venir, cours prêt, quiz global du jour, nouvelle lacune, séance prévue, module validé, séance à replacer, bilan de la semaine, jalon atteint, alerte de coût IA, échec de tâche IA, export prêt, invitation de groupe.
- **BR-NOT-07** — Rappel de quiz de validation 40 minutes avant l'heure planifiée.
- **BR-NOT-01** — Centre de notifications (cloche) : pastille du nombre de non lues ; liste groupée « Aujourd'hui », « Hier », « Plus tôt » ; filtre Toutes / Non lues ; « Tout marquer comme lu » ; chaque notification (icône de type, titre, texte, formation, heure, point non lu) mène à l'écran concerné et se marque lue au clic ; lien « Gérer les notifications ».

## 5. Exigences fonctionnelles

- **EF-1** — Créer les producteurs des 13 types de BR-NOT-02 : quiz de validation à venir, cours prêt, quiz global du jour, nouvelle lacune, séance prévue, module validé, séance à replacer, bilan de semaine, jalon, coût IA, échec IA, export prêt et invitation de groupe.
- **EF-2** — Le rappel de quiz de validation est demandé exactement 40 minutes avant le créneau prévu, dans le fuseau du profil ; un déplacement annule l’ancien rappel et planifie le nouveau.
- **EF-3** — Chaque notification possède titre, texte court, formation, icône/type, cible profonde valide et clé de déduplication. Le contenu rédigé par le tuteur suit vous/tu ; l’interface fixe reste au vouvoiement.
- **EF-4** — Les règles métier BR-NOT-02, BR-NOT-07, BR-NOT-01 de la section 4 sont obligatoires dans tous les états, y compris les erreurs et la reprise.

## 6. Exigences techniques

- **ET-1** — Les routes API valident entrée/sortie avec Zod et appellent un service soumis à RLS ; un objet d’un autre utilisateur répond 404. Les mutations rejouables portent une clé d’idempotence.
- **ET-2** — Les actions et notifications sont écrites dans une transaction puis émises après commit ; l’horloge injectable et le fuseau IANA du profil déterminent les échéances et les semaines locales.
- **ET-3** — `packages/notifications/src/producers/` mappe chaque événement de `overview.md` §5 à un `notify(userId, type, data)` de SPEC-209. Les producteurs ne contournent jamais préférences, heures calmes ou plafond ; ils transmettent la date d’éligibilité.
- **ET-4** — Clé de déduplication stable par utilisateur, type et objet/échéance ; le déplacement d’un créneau invalide l’ancienne clé. Les deep links sont construits sur les routes de `screens.md`, jamais pris directement d’un contenu IA.
- **ET-5** — Les gabarits de texte résident dans `apps/web/messages/fr.ts` ou le paquet notifications ; séparer contenu transactionnel, texte du tuteur et variantes de ton.

## 7. Comportements attendus et cas limites

- **CL-1** — Identifiant ou donnée hors schéma : 400 `VALIDATION_FAILED`, sans écriture ni événement ; ressource d’un autre propriétaire : 404 sans révéler son existence.
- **CL-2** — Deux demandes concurrentes identiques ne créent qu’un effet ; une version d’objet devenue obsolète renvoie 409 `CONFLICT` et restitue l’état actuel.
- **CL-3** — Même événement reçu deux fois : une seule notification in-app et une seule livraison par canal autorisé.
- **CL-4** — Événement d’un objet supprimé ou devenu privé : ignorer le lien et journaliser l’échec sans exposer le titre.
- **CL-5** — Rappel calculé dans le passé après déplacement : ne pas envoyer tardivement, recalculer ou marquer expiré.

## 8. Instructions d'implémentation

1. Relire les contrats des dépendances et les règles BR-NOT-02, BR-NOT-07, BR-NOT-01 ; définir les schémas Zod et types DTO dans `packages/contracts/src/notifications-generation-des-rappels.ts`. Ajouter les valeurs métier à `packages/config/src/product.ts` uniquement si elles viennent d’une règle ou d’un ADR. Commit `feat(SPEC-706): définit les contrats`.
2. Écrire `packages/services/src/notifications-generation-des-rappels.ts` et ses fonctions pures d’aide ; toute écriture multi-tables est transactionnelle. Utiliser l’horloge injectée et le client RLS. Commit `feat(SPEC-706): implémente la capacité`.
3. Brancher les routes documentées, les événements après commit et les composants ou la page SDD. Réutiliser `@learny/ui` et ajouter les libellés à `apps/web/messages/fr.ts`. Commit `feat(SPEC-706): expose le parcours`.
4. Couvrir chaque EF et CL par les tests section 12 ; utiliser les fixtures du jeu SPEC-115, l’IA mock et l’horloge figée. Créer la référence de non-régression sans toucher aux maquettes. Commit `test(SPEC-706): vérifie le parcours et les limites`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-706`, corriger les erreurs, lier les preuves réelles aux CA dans `evidence/SPEC-706/acceptance.md` puis terminer avec `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/notifications-generation-des-rappels.ts`, `packages/services/src/notifications-generation-des-rappels.ts`, `packages/services/src/notifications-generation-des-rappels.test.ts`, `packages/services/test/integration/notifications-generation-des-rappels.test.ts`, `apps/web/e2e/specs/p7/spec-706.spec.ts`.
- **Modifiés** : `apps/web/messages/fr.ts`, exports des paquets, routes `apps/web/app/api/v1/**` correspondant à ET-6, composants de l’écran SCR-03, catalogue d’événements si la capacité en émet.
- **Lus / réutilisés** : `specs/p2-backend/SPEC-209-service-unifie-de-notifications.md`, `specs/p3-interface/SPEC-306-panneau-des-notifications.md`, `specs/p4-moteur/SPEC-411-services-de-persistance-du-moteur.md`.

## 10. Interface et conformité visuelle

SCR-03 et panneau de cloche : pastille non lue, carte de notification avec icône/titre/texte/formation/heure, lien profond. Vérifier l’arrivée des types cours prêt et quiz à venir dans les groupes Aujourd’hui/Hier/Plus tôt de SPEC-306.

- **Contrôles** — Utiliser la référence du SCR-03 dans `design/references/` et mesurer ≤ 12 % de pixels différents ; vérifier les jetons, l’ordre des régions, les textes, axe sans violation serious/critical et la ligne de base `toHaveScreenshot` ≤ 1 % à 1440 × 900 et 390 × 844. Les états chargement, vide, erreur et permission refusée sont distincts, accessibles au clavier et annoncés sans dépendre de la seule couleur.

## 11. Critères d'acceptation

- **CA-1** — Les 13 types ont une fixture qui vérifie texte, cible et clé de déduplication ; deux événements identiques créent une seule notification.
- **CA-2** — Un quiz à 15:00 génère un rappel éligible à 14:20 heure locale ; un déplacement supprime l’ancien rappel et programme le nouveau.
- **CA-3** — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
- **CA-4** — L’écran respecte la maquette avec un écart ≤ 12 % ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.

## 12. Plan de tests

- **Unitaires** — `packages/services/src/spec-706.test.ts`, `describe('[SPEC-706] règles et calculs')` : pour CA-1 : Les 13 types ont une fixture qui vérifie texte, cible et clé de déduplication ; deux événements identiques créent une seule notification. ; CA-2 : Un quiz à 15:00 génère un rappel éligible à 14:20 heure locale ; un déplacement supprime l’ancien rappel et programme le nouveau. Tester aussi valeurs limites, entrée vide, ordre déterministe et fuseau si le comportement dépend du temps.
- **Intégration** — `packages/services/test/integration/spec-706.test.ts`, `describe('[SPEC-706] service et API')` : exécuter les mêmes cas sur Supabase local avec `LLM_MODE=mock`, vérifier les lignes et événements réellement écrits, puis 400, 404 RLS, 409 et double envoi (CA-3).
- **End-to-end** — `apps/web/e2e/specs/p7/spec-706.spec.ts`, `test('parcours SPEC-706 @SPEC-706')` : partir du seed SPEC-115, ouvrir SCR-03, effectuer les actions des CA-1 à CA-2, recharger, contrôler le résultat et conserver la vidéo. Tester l’état erreur et lancer axe.
- **Visuel** — `test('conformité SPEC-706 @SPEC-706 @visual')` : jetons, régions, textes, comparaison de référence ≤ 12 %, captures desktop/mobile ≤ 1 % et axe (CA-4).
- **Non-régression** — Rejouer les étiquettes `[SPEC-209]` et `@SPEC-209`, `[SPEC-306]` et `@SPEC-306`, `[SPEC-411]` et `@SPEC-411` en plus des suites unitaires/intégration complètes.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-2 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-3 | intégration RLS, invalides et idempotence |
| CA-4 | e2e et `@SPEC-706 @visual` |

## 13. Preuves attendues

`evidence/SPEC-706/` contient les rapports réels `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, au moins une vidéo Playwright, les captures finales et `acceptance.md` avec preuve vérifiable pour CA-1 à CA-4. Conserver la comparaison côte à côte et le diff avec la référence de maquette. Une pièce manquante fait échouer la validation ; aucune preuve n’est fabriquée.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent : lint, typecheck, build, unitaires, intégration, e2e avec vidéo, `@visual`, axe, non-régression et CA cochés avec preuve. Les limites et cas d’échec de cette spécification sont couverts, les contrats API restent documentés, et aucune donnée d’un autre utilisateur n’est rendue.

## 15. Décisions et hypothèses

- **ADR-0031 — Plafond de notifications** : Le plafond quotidien (3/5/8, défaut 5) s'applique aux envois e-mail et navigateur, toutes sources confondues. Les notifications in-app ne sont pas plafonnées. Les envois écartés sont résumés dans le programme du jour suivant.
- Aucune décision ouverte : une ambiguïté découverte pendant l’implémentation suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification du périmètre.

