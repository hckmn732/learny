---
id: SPEC-617
title: "Bilan final et entretien de mémoire"
phase: P6
priority: V1
depends_on: [SPEC-612, SPEC-408]
business_rules: [BR-FOR-12, BR-PRO-03]
screens: [SCR-16]
adrs: [ADR-0015]
visual: tokens
---

# SPEC-617 — Bilan final et entretien de mémoire

## 1. Objectif

Écran /formations/[fid]/bilan (composé selon docs/product/screens.md §3) : acquis, notions fragiles, heures, rétention, carte des notions à date, choix entretien léger/arrêt (modifiable), effets sur le quiz global et les notifications, onglet Terminées. Cette spécification livre le contrat, le service, les états d’interface ou de démonstration et les validations nécessaires pour que la capacité soit utilisable et prouvée sans appel à un service réel dans les tests.

## 2. Contexte

Lire `docs/product/vision.md`, `docs/product/business-rules.md`, `docs/product/screens.md`, `docs/architecture/overview.md`, `docs/architecture/data-model.md`, `docs/architecture/api.md`, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. Écran concerné : SCR-16 : `/formations/[fid]/bilan`. Les maquettes sont en lecture seule ; le jeu de données SPEC-115 et l’horloge du 11 novembre 2026 permettent des captures reproductibles. Les ADR listés en section 15 priment sur ce texte en cas de conflit.

## 3. Dépendances

- **SPEC-612** — Résultat, lacunes, remédiation et déblocage ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-408** — Rétention et indicateurs de progression ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **Architecture transversale** — Les services applicatifs utilisent les contrats Zod de `packages/contracts`, `handler()` de SPEC-201, le client utilisateur soumis à RLS de SPEC-113 et les événements de SPEC-203. Les composants interactifs réutilisent `@learny/ui` et les textes passent par `apps/web/messages/fr.ts`.
- **Services externes** — Les tests utilisent Supabase local et `LLM_MODE=mock`; tout secret réel reste côté serveur. Si un service tiers est indisponible, exécuter les parties mock, consigner le blocage externe selon `sdd-process.md` §3, sans inventer de résultat.

## 4. Règles métier couvertes

- **BR-FOR-12** — Une formation est **terminée** quand tous ses modules sont validés. Un **bilan final** est alors présenté (acquis, notions fragiles, carte des notions, heures, rétention) avec le choix : garder un **entretien de mémoire léger** (quiz global limité à 5 min/jour, notions dues uniquement) ou **arrêter les révisions**.
- **BR-PRO-03** — Onglet « Terminées » : résultat final, mémorisation (rétention), révisions dues (ou « Entretien arrêté »), date de fin et durée, action « Réviser ».

## 5. Exigences fonctionnelles

- **EF-1** — Quand tous les modules sont validés, afficher bilan final : acquis, notions fragiles, carte des notions à la date de fin, heures, rétention et date/durée.
- **EF-2** — Proposer « Entretien de mémoire léger » (quiz global limité à 5 minutes par jour, notions dues uniquement) ou « Arrêter les révisions ». Le choix reste modifiable ; les notifications suivent le mode enregistré.
- **EF-3** — L’onglet « Terminées » montre résultat final, rétention, révisions dues ou « Entretien arrêté », date de fin, durée et action « Réviser » si le mode le permet.
- **EF-4** — Les règles métier BR-FOR-12, BR-PRO-03 de la section 4 sont obligatoires dans tous les états, y compris les erreurs et la reprise.

## 6. Exigences techniques

- **ET-1** — Chaque lecture et mutation utilise le client de l’utilisateur soumis à RLS ; un autre utilisateur reçoit 404. Les entrées/sorties passent par les schémas Zod de `packages/contracts`, et les routes renvoient `application/problem+json` en erreur.
- **ET-2** — Les écritures multi-tables sont transactionnelles ; un événement est émis après commit et une clé d’idempotence empêche une double transition. Les dates passent par l’horloge injectable et le fuseau IANA du profil.
- **ET-3** — `GET /formations/:fid/final-review` agrège les mesures de SPEC-408 et l’état des notions sans recalcul IA ; `POST /formations/:fid/maintenance` accepte `light|stopped` et crée une seule transition par clé d’idempotence.
- **ET-4** — Le mode `light` est transmis au tirage SPEC-406 avec plafond 5 min et notions dues seulement ; `stopped` exclut la formation des sessions et rappels, sans supprimer les historiques.
- **ET-5** — Le bilan référence la version du programme et l’instant de fin. Une formation non terminée renvoie 409 ou redirection vers programme, sans bilan anticipé.

## 7. Comportements attendus et cas limites

- **CL-1** — Identifiant ou donnée hors schéma : 400 `VALIDATION_FAILED`, sans écriture ni événement ; ressource d’un autre propriétaire : 404 sans révéler son existence.
- **CL-2** — Deux demandes concurrentes identiques ne créent qu’un effet ; une version d’objet devenue obsolète renvoie 409 `CONFLICT` et restitue l’état actuel.
- **CL-3** — Tous les modules validés deux fois par événements rejoués : une seule fin de formation et un seul bilan.
- **CL-4** — Changement de `light` à `stopped` : créneaux/rappels futurs annulés, résultats passés conservés.
- **CL-5** — Rétention à 60 jours non encore mesurable : afficher « Pas encore disponible », jamais 0 %.

## 8. Instructions d'implémentation

1. Agréger heures, acquis, notions fragiles et rétention mesurable à la date de fin. Commit `feat(SPEC-617): définit les contrats`.
2. Implémenter `setMaintenance` pour light/stopped et transmettre au quiz global/notifications sans effacer l’historique. Commit `feat(SPEC-617): implémente les services`.
3. Composer SCR-16 avec composants du design system et alimenter l’onglet Terminées de l’accueil. Commit `feat(SPEC-617): construit le parcours`.
4. Tester formation 6/7 vs 7/7, 5 min/jour et aucune révision après arrêt. Commit `test(SPEC-617): vérifie les cas`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-617`, renseigner les preuves réellement produites puis `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/final-review.ts`, `packages/services/src/formations/{get-final-review,set-maintenance}.ts`, `packages/services/test/integration/final-review.test.ts`, `apps/web/app/(app)/formations/[fid]/bilan/page.tsx`, `apps/web/components/final-review/{Stats,FragileNotions,MaintenanceChoice}.tsx`, `apps/web/e2e/specs/p6/final-review.spec.ts`.
- **Modifiés** : `apps/web/app/(app)/accueil/page.tsx`, `packages/services/src/review/build-session.ts`, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `specs/p6-parcours/SPEC-612-resultat-lacunes-remediation-et-deblocage.md`, `specs/p4-moteur/SPEC-408-retention-et-indicateurs-de-progression.md`.

## 10. Interface et conformité visuelle

SCR-16 sans maquette : reprendre l’en-tête de `Lacunes.dc.html`, cartes statistiques, panneau des notions fragiles et carte des notions, choix radio accessible et action principale. `data-testid` : `final-review-stats`, `final-review-gaps`, `maintenance-mode`.

- **Contrôles** — vérifier les jetons, l’ordre des régions, les textes, axe sans violation serious/critical et la ligne de base `toHaveScreenshot` ≤ 1 % à 1440 × 900 et 390 × 844. Les états chargement, vide, erreur et permission refusée sont distincts, accessibles au clavier et annoncés sans dépendre de la seule couleur.

## 11. Critères d'acceptation

- **CA-1** — Une formation à 7 modules validés ouvre le bilan et apparaît dans Terminées ; 6/7 ne le peut pas.
- **CA-2** — Choisir `light` limite le quiz à 5 minutes de notions dues ; choisir `stopped` affiche « Entretien arrêté » et ne planifie aucun rappel.
- **CA-3** — Une rétention non encore calculable reste « Pas encore disponible » et les heures proviennent des créneaux réalisés.
- **CA-4** — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
- **CA-5** — La démonstration suit les jetons et la structure prescrits ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.

## 12. Plan de tests

**Unitaires** (1 fichiers, `[SPEC-617]`) :
- `packages/services/src/formations/final-review.test.ts` — `[SPEC-617]` : 6/7 non terminé, 7/7 terminé, rétention non mesurable « Pas encore disponible ».

**Intégration** (Supabase local, `LLM_MODE=mock`, `[SPEC-617]`) :
- `packages/services/test/integration/final-review.test.ts` — `[SPEC-617]` : événement de fin rejoué, bilan unique, maintenance light → session de 5 min, stopped → aucun rappel, historique conservé, 404 RLS.

**End-to-end** (`apps/web/e2e/specs/p6/final-review.spec.ts`, vidéo) :
- **Scénario** — `consulte son bilan final @SPEC-617` : valider dernier module, ouvrir bilan, lire acquis, heures et notions fragiles, choisir entretien léger.
- **Scénario** — `arrête et reprend l’entretien @SPEC-617` : changer le choix, retrouver « Entretien arrêté » dans Terminées après rechargement.

**Visuel** — `test('conformité SPEC-617 @SPEC-617 @visual')` : SCR-16 sans maquette : en-tête type Lacunes, cartes statistiques, notions fragiles, carte des notions, choix d’entretien ; jetons, structure, axe, capture ≤ 1 %.

**Non-régression** — Rejouer `[SPEC-612]` et `@SPEC-612`, `[SPEC-408]` et `@SPEC-408` et les suites complètes unitaires/intégration.

| Critère | Tests |
|---|---|
| CA-1 | unitaires et intégration ciblés ; e2e `@SPEC-617` |
| CA-2 | unitaires et intégration ciblés ; e2e `@SPEC-617` |
| CA-3 | unitaires et intégration ciblés ; e2e `@SPEC-617` |
| CA-4 | intégration RLS/idempotence, e2e erreur |
| CA-5 | `@SPEC-617 @visual`, axe, vidéo |

## 13. Preuves attendues

`evidence/SPEC-617/` contient les rapports réels `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, au moins une vidéo Playwright, les captures finales et `acceptance.md` avec preuve vérifiable pour CA-1 à CA-5. Conserver la capture de la page de démonstration ou de l’écran sans maquette. Une pièce manquante fait échouer la validation ; aucune preuve n’est fabriquée.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent : lint, typecheck, build, unitaires, intégration, e2e avec vidéo, `@visual`, axe, non-régression et CA cochés avec preuve. Les limites et cas d’échec de cette spécification sont couverts, les contrats API restent documentés, et aucune donnée d’un autre utilisateur n’est rendue.

## 15. Décisions et hypothèses

- **ADR-0015 — Fin de formation et entretien de mémoire** : À la validation du dernier module : bilan final. Entretien léger = quiz global plafonné à 5 min/jour sur les notions dues, sans automatismes autres que le rappel quotidien. Arrêt = plus aucune révision ni notification pour cette formation.
- Aucune décision ouverte : une ambiguïté découverte pendant l’implémentation suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification du périmètre.

