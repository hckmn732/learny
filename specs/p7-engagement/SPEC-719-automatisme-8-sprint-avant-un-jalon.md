---
id: SPEC-719
title: "Automatisme 8 : sprint avant un jalon"
phase: P7
priority: V1
depends_on: [SPEC-711, SPEC-407]
business_rules: [BR-AUT-08]
screens: [SCR-12]
adrs: [ADR-0190]
visual: tokens
---

# SPEC-719 — Automatisme 8 : sprint avant un jalon

## 1. Objectif

Planification des sprints J-K et J-1 avant chaque quiz de validation et examen blanc, sélection des notions les plus faibles, créneaux agenda, journal. Cette spécification livre le contrat, le service, les états d’interface ou de démonstration et les validations nécessaires pour que la capacité soit utilisable et prouvée sans appel à un service réel dans les tests.

## 2. Contexte

Lire `docs/product/vision.md`, `docs/product/business-rules.md`, `docs/product/screens.md`, `docs/architecture/overview.md`, `docs/architecture/data-model.md`, `docs/architecture/api.md`, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. Écran concerné : SCR-12 : route du catalogue. Les maquettes sont en lecture seule ; le jeu de données SPEC-115 et l’horloge du 11 novembre 2026 permettent des captures reproductibles. Les ADR listés en section 15 priment sur ce texte en cas de conflit.

## 3. Dépendances

- **SPEC-711** — Moteur d'automatismes ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-407** — Planificateur ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **Architecture transversale** — Les opérations utilisent les contrats Zod de `packages/contracts`, `handler()` de SPEC-201 et le client utilisateur soumis à RLS de SPEC-113. Les dates sont calculées par `@learny/core/time` avec l’horloge injectable ; l’interface réutilise `@learny/ui` et les textes de `apps/web/messages/fr.ts`.
- **Services externes** — Les tests utilisent Supabase local et `LLM_MODE=mock`; tout secret réel reste côté serveur. Si un service tiers est indisponible, exécuter les parties mock, consigner le blocage externe selon `sdd-process.md` §3, sans inventer de résultat.

## 4. Règles métier couvertes

- **BR-AUT-08** — **Sprint avant un jalon** : avant chaque quiz de validation ou examen blanc, des révisions courtes (30 min) sur les notions les plus faibles du module sont planifiées à J-K et J-1 (défaut K = 3 ; 2/3/5).

## 5. Exigences fonctionnelles

- **EF-1** — Avant chaque quiz de validation ou examen blanc planifié, proposer deux sprints de 30 minutes sur les notions les plus faibles : J-K et J-1, K parmi 2/3/5, défaut 3.
- **EF-2** — Le planificateur place les créneaux dans les disponibilités de l’apprenant, sans chevaucher une activité ; le journal explique les notions ciblées, l’échéance et les dates.
- **EF-3** — Si une épreuve est déplacée, les sprints futurs sont recalculés ; les sprints déjà faits restent enregistrés et ne sont pas dupliqués.
- **EF-4** — Les règles métier BR-AUT-08 de la section 4 sont obligatoires dans tous les états, y compris les erreurs et la reprise.

## 6. Exigences techniques

- **ET-1** — Les routes API valident entrée/sortie avec Zod et appellent un service soumis à RLS ; un objet d’un autre utilisateur répond 404. Les mutations rejouables portent une clé d’idempotence.
- **ET-2** — Les actions et notifications sont écrites dans une transaction puis émises après commit ; l’horloge injectable et le fuseau IANA du profil déterminent les échéances et les semaines locales.
- **ET-3** — Définition `sprint` de SPEC-711 (ADR-0190) consomme création/déplacement de créneau `validation_quiz|mock_exam` ; sélection pure des notions par maîtrise croissante puis ID stable en cas d’égalité.
- **ET-4** — Action `kind='sprint_planned'` avec `payload.dedupeKey` sur épreuve+date+K ; `apply` crée deux `schedule_slots` via SPEC-407 et `undo` annule seulement les futurs créneaux non consommés.
- **ET-5** — Les dates J-K/J-1 sont des jours locaux dans le fuseau du profil, pas des durées de 24 h autour d’un changement d’heure.

## 7. Comportements attendus et cas limites

- **CL-1** — Identifiant ou donnée hors schéma : 400 `VALIDATION_FAILED`, sans écriture ni événement ; ressource d’un autre propriétaire : 404 sans révéler son existence.
- **CL-2** — Deux demandes concurrentes identiques ne créent qu’un effet ; une version d’objet devenue obsolète renvoie 409 `CONFLICT` et restitue l’état actuel.
- **CL-3** — Moins de deux jours disponibles avant l’épreuve : placer les créneaux compatibles et expliquer ceux impossibles, sans chevauchement.
- **CL-4** — Épreuve annulée : futurs sprints annulés, sprints faits conservés dans l’historique.
- **CL-5** — Aucune notion étudiée : ne pas créer de sprint vide.

## 8. Instructions d'implémentation

1. Relire les contrats des dépendances et les règles BR-AUT-08 ; définir les schémas Zod et types DTO dans `packages/contracts/src/automatisme-8-sprint-avant-un-jalon.ts`. Ajouter les valeurs métier à `packages/config/src/product.ts` uniquement si elles viennent d’une règle ou d’un ADR. Commit `feat(SPEC-719): définit les contrats`.
2. Écrire `packages/automations/src/automatisme-8-sprint-avant-un-jalon.ts` et ses fonctions pures d’aide ; toute écriture multi-tables est transactionnelle. Utiliser l’horloge injectée et le client RLS. Commit `feat(SPEC-719): implémente la capacité`.
3. Brancher les routes documentées, les événements après commit et les composants ou la page SDD. Réutiliser `@learny/ui` et ajouter les libellés à `apps/web/messages/fr.ts`. Commit `feat(SPEC-719): expose le parcours`.
4. Couvrir chaque EF et CL par les tests section 12 ; utiliser les fixtures du jeu SPEC-115, l’IA mock et l’horloge figée. Créer la référence de non-régression sans toucher aux maquettes. Commit `test(SPEC-719): vérifie le parcours et les limites`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-719`, corriger les erreurs, lier les preuves réelles aux CA dans `evidence/SPEC-719/acceptance.md` puis terminer avec `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/automatisme-8-sprint-avant-un-jalon.ts`, `packages/automations/src/automatisme-8-sprint-avant-un-jalon.ts`, `packages/automations/src/automatisme-8-sprint-avant-un-jalon.test.ts`, `packages/services/test/integration/automatisme-8-sprint-avant-un-jalon.test.ts`, `apps/web/e2e/specs/p7/spec-719.spec.ts`.
- **Modifiés** : `apps/web/messages/fr.ts`, exports des paquets, routes `apps/web/app/api/v1/**` correspondant à ET-6, composants de l’écran SCR-12, catalogue d’événements si la capacité en émet.
- **Lus / réutilisés** : `specs/p7-engagement/SPEC-711-moteur-d-automatismes.md`, `specs/p4-moteur/SPEC-407-planificateur.md`.

## 10. Interface et conformité visuelle

SCR-12 : deux créneaux « Sprint » de 30 min avant l’épreuve, détail expliquant la sélection ; journal dans Paramètres. `data-testid` : `sprint-slot`, `sprint-reason`.

- **Contrôles** — vérifier les jetons, l’ordre des régions, les textes, axe sans violation serious/critical et la ligne de base `toHaveScreenshot` ≤ 1 % à 1440 × 900 et 390 × 844. Les états chargement, vide, erreur et permission refusée sont distincts, accessibles au clavier et annoncés sans dépendre de la seule couleur.

## 11. Critères d'acceptation

- **CA-1** — Avec K=3, une épreuve du 14 novembre produit des cibles J-3 et J-1 en jours locaux, 30 minutes chacune si créneaux compatibles.
- **CA-2** — Déplacer l’épreuve replanifie uniquement les sprints futurs et ne modifie aucun sprint déjà fait.
- **CA-3** — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
- **CA-4** — La démonstration suit les jetons et la structure prescrits ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.

## 12. Plan de tests

- **Unitaires** — `packages/services/src/spec-719.test.ts`, `describe('[SPEC-719] règles et calculs')` : pour CA-1 : Avec K=3, une épreuve du 14 novembre produit des cibles J-3 et J-1 en jours locaux, 30 minutes chacune si créneaux compatibles. ; CA-2 : Déplacer l’épreuve replanifie uniquement les sprints futurs et ne modifie aucun sprint déjà fait. Tester aussi valeurs limites, entrée vide, ordre déterministe et fuseau si le comportement dépend du temps.
- **Intégration** — `packages/services/test/integration/spec-719.test.ts`, `describe('[SPEC-719] service et API')` : exécuter les mêmes cas sur Supabase local avec `LLM_MODE=mock`, vérifier les lignes et événements réellement écrits, puis 400, 404 RLS, 409 et double envoi (CA-3).
- **End-to-end** — `apps/web/e2e/specs/p7/spec-719.spec.ts`, `test('parcours SPEC-719 @SPEC-719')` : partir du seed SPEC-115, ouvrir SCR-12, effectuer les actions des CA-1 à CA-2, recharger, contrôler le résultat et conserver la vidéo. Tester l’état erreur et lancer axe.
- **Visuel** — `test('conformité SPEC-719 @SPEC-719 @visual')` : jetons, régions, textes, captures desktop/mobile ≤ 1 % et axe (CA-4).
- **Non-régression** — Rejouer les étiquettes `[SPEC-711]` et `@SPEC-711`, `[SPEC-407]` et `@SPEC-407` en plus des suites unitaires/intégration complètes.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-2 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-3 | intégration RLS, invalides et idempotence |
| CA-4 | e2e et `@SPEC-719 @visual` |

## 13. Preuves attendues

`evidence/SPEC-719/` contient les rapports réels `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, au moins une vidéo Playwright, les captures finales et `acceptance.md` avec preuve vérifiable pour CA-1 à CA-4. Conserver la capture de la page de démonstration ou de l’écran sans maquette. Une pièce manquante fait échouer la validation ; aucune preuve n’est fabriquée.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent : lint, typecheck, build, unitaires, intégration, e2e avec vidéo, `@visual`, axe, non-régression et CA cochés avec preuve. Les limites et cas d’échec de cette spécification sont couverts, les contrats API restent documentés, et aucune donnée d’un autre utilisateur n’est rendue.

## 15. Décisions et hypothèses

- ADR-0190 fixe la clé `sprint`, le contrat d’action et l’idempotence ; le catalogue doit référencer cet ADR pour SPEC-719.
- Aucune décision ouverte : une ambiguïté découverte pendant l’implémentation suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification du périmètre.

