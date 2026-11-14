---
id: SPEC-723
title: "Série, régularité et jalons : interface"
phase: P7
priority: V1
depends_on: [SPEC-409, SPEC-304]
business_rules: [BR-GAM-02, BR-GAM-03]
screens: [SCR-03]
adrs: [ADR-0321]
visual: mockup
---

# SPEC-723 — Série, régularité et jalons : interface

## 1. Objectif

API série/jalons, bloc Série du menu (n jours, 14 cases), notifications de jalons sobres, jalons dans le bilan final. Cette spécification livre le contrat, le service, les états d’interface ou de démonstration et les validations nécessaires pour que la capacité soit utilisable et prouvée sans appel à un service réel dans les tests.

## 2. Contexte

Lire `docs/product/vision.md`, `docs/product/business-rules.md`, `docs/product/screens.md`, `docs/architecture/overview.md`, `docs/architecture/data-model.md`, `docs/architecture/api.md`, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. Écran concerné : SCR-03 : `/accueil` (`/` redirige). Les maquettes sont en lecture seule ; le jeu de données SPEC-115 et l’horloge du 11 novembre 2026 permettent des captures reproductibles. Les ADR listés en section 15 priment sur ce texte en cas de conflit.

## 3. Dépendances

- **SPEC-409** — Série et jalons ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-304** — Coquille : menu latéral ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **Architecture transversale** — Les opérations utilisent les contrats Zod de `packages/contracts`, `handler()` de SPEC-201 et le client utilisateur soumis à RLS de SPEC-113. Les dates sont calculées par `@learny/core/time` avec l’horloge injectable ; l’interface réutilise `@learny/ui` et les textes de `apps/web/messages/fr.ts`.
- **Services externes** — Les tests utilisent Supabase local et `LLM_MODE=mock`; tout secret réel reste côté serveur. Si un service tiers est indisponible, exécuter les parties mock, consigner le blocage externe selon `sdd-process.md` §3, sans inventer de résultat.

## 4. Règles métier couvertes

- **BR-GAM-02** — Le menu affiche la série (« 12 jours ») et la régularité sur les 14 derniers jours (une case par jour : faite/non faite).
- **BR-GAM-03** — Jalons sobres : module validé, 100 notions retenues (maîtrise ≥ 80 %), 30 jours de série. Pas de classement ; rien ne récompense la vitesse.

## 5. Exigences fonctionnelles

- **EF-1** — Le bloc Série du menu montre « N jours » et 14 cases de régularité correspondant aux 14 derniers jours locaux, avec légende faite/non faite/jour neutre.
- **EF-2** — Les jalons sobres sont module validé, 100 notions retenues (maîtrise ≥ 80 %) et 30 jours de série ; une notification est envoyée une seule fois, sans classement ni récompense de vitesse.
- **EF-3** — Le bilan final affiche les jalons réellement acquis et leurs dates ; un jour sans activité planifiée ou une pause est neutre pour la série selon SPEC-409.
- **EF-4** — Les règles métier BR-GAM-02, BR-GAM-03 de la section 4 sont obligatoires dans tous les états, y compris les erreurs et la reprise.

## 6. Exigences techniques

- **ET-1** — Les routes API valident entrée/sortie avec Zod et appellent un service soumis à RLS ; un objet d’un autre utilisateur répond 404. Les mutations rejouables portent une clé d’idempotence.
- **ET-2** — Les actions et notifications sont écrites dans une transaction puis émises après commit ; l’horloge injectable et le fuseau IANA du profil déterminent les échéances et les semaines locales.
- **ET-3** — `GET /api/v1/streak` retourne jours de série, 14 cases `{date,status}`, fuseau et prochain jalon ; `GET /api/v1/milestones` retourne type, date acquise et formation éventuelle, soumis à RLS.
- **ET-4** — Le service lit les sorties du moteur SPEC-409 et `daily_activity` sans recalcul client ; les seuils 100 notions/80 %/30 jours sont fixés dans `packages/config/src/product.ts` depuis BR-GAM-03.
- **ET-5** — Les événements de jalon sont dédupliqués par utilisateur, type et formation ; la notification passe par SPEC-209 et son plafond.

## 7. Comportements attendus et cas limites

- **CL-1** — Identifiant ou donnée hors schéma : 400 `VALIDATION_FAILED`, sans écriture ni événement ; ressource d’un autre propriétaire : 404 sans révéler son existence.
- **CL-2** — Deux demandes concurrentes identiques ne créent qu’un effet ; une version d’objet devenue obsolète renvoie 409 `CONFLICT` et restitue l’état actuel.
- **CL-3** — Jour neutre au milieu de la période : case neutre et série conservée, sans le présenter comme un jour étudié.
- **CL-4** — Changement de fuseau : les 14 dates et la série sont recalculées de manière cohérente à la prochaine lecture.
- **CL-5** — Jalon 100 notions atteint simultanément par deux réponses : une seule ligne et une seule notification.

## 8. Instructions d'implémentation

1. Relire les contrats des dépendances et les règles BR-GAM-02, BR-GAM-03 ; définir les schémas Zod et types DTO dans `packages/contracts/src/serie-regularite-et-jalons-interface.ts`. Ajouter les valeurs métier à `packages/config/src/product.ts` uniquement si elles viennent d’une règle ou d’un ADR. Commit `feat(SPEC-723): définit les contrats`.
2. Écrire `packages/services/src/serie-regularite-et-jalons-interface.ts` et ses fonctions pures d’aide ; toute écriture multi-tables est transactionnelle. Utiliser l’horloge injectée et le client RLS. Commit `feat(SPEC-723): implémente la capacité`.
3. Brancher les routes documentées, les événements après commit et les composants ou la page SDD. Réutiliser `@learny/ui` et ajouter les libellés à `apps/web/messages/fr.ts`. Commit `feat(SPEC-723): expose le parcours`.
4. Couvrir chaque EF et CL par les tests section 12 ; utiliser les fixtures du jeu SPEC-115, l’IA mock et l’horloge figée. Créer la référence de non-régression sans toucher aux maquettes. Commit `test(SPEC-723): vérifie le parcours et les limites`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-723`, corriger les erreurs, lier les preuves réelles aux CA dans `evidence/SPEC-723/acceptance.md` puis terminer avec `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/serie-regularite-et-jalons-interface.ts`, `packages/services/src/serie-regularite-et-jalons-interface.ts`, `packages/services/src/serie-regularite-et-jalons-interface.test.ts`, `packages/services/test/integration/serie-regularite-et-jalons-interface.test.ts`, `apps/web/e2e/specs/p7/spec-723.spec.ts`.
- **Modifiés** : `apps/web/messages/fr.ts`, exports des paquets, routes `apps/web/app/api/v1/**` correspondant à ET-6, composants de l’écran SCR-03, catalogue d’événements si la capacité en émet.
- **Lus / réutilisés** : `specs/p4-moteur/SPEC-409-serie-et-jalons.md`, `specs/p3-interface/SPEC-304-coquille-menu-lateral.md`.

## 10. Interface et conformité visuelle

SCR-03, menu latéral : chiffre « 12 jours » du seed, 14 cases dans l’ordre chronologique, chaque case avec nom accessible du jour/statut ; bilan final : liste sobre des jalons. `data-testid` : `streak-count`, `streak-day`, `milestone-list`.

- **Contrôles** — Utiliser la référence du SCR-03 dans `design/references/` et mesurer ≤ 12 % de pixels différents ; vérifier les jetons, l’ordre des régions, les textes, axe sans violation serious/critical et la ligne de base `toHaveScreenshot` ≤ 1 % à 1440 × 900 et 390 × 844. Les états chargement, vide, erreur et permission refusée sont distincts, accessibles au clavier et annoncés sans dépendre de la seule couleur.

## 11. Critères d'acceptation

- **CA-1** — Le seed du 11 novembre affiche « 12 jours » et exactement 14 cases nommées ; un jour neutre ne coupe pas la série.
- **CA-2** — À 100 notions de maîtrise ≥ 80 %, un seul jalon et une seule notification existent ; aucune comparaison entre apprenants n’apparaît.
- **CA-3** — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
- **CA-4** — L’écran respecte la maquette avec un écart ≤ 12 % ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.

## 12. Plan de tests

- **Unitaires** — `packages/services/src/spec-723.test.ts`, `describe('[SPEC-723] règles et calculs')` : pour CA-1 : Le seed du 11 novembre affiche « 12 jours » et exactement 14 cases nommées ; un jour neutre ne coupe pas la série. ; CA-2 : À 100 notions de maîtrise ≥ 80 %, un seul jalon et une seule notification existent ; aucune comparaison entre apprenants n’apparaît. Tester aussi valeurs limites, entrée vide, ordre déterministe et fuseau si le comportement dépend du temps.
- **Intégration** — `packages/services/test/integration/spec-723.test.ts`, `describe('[SPEC-723] service et API')` : exécuter les mêmes cas sur Supabase local avec `LLM_MODE=mock`, vérifier les lignes et événements réellement écrits, puis 400, 404 RLS, 409 et double envoi (CA-3).
- **End-to-end** — `apps/web/e2e/specs/p7/spec-723.spec.ts`, `test('parcours SPEC-723 @SPEC-723')` : partir du seed SPEC-115, ouvrir SCR-03, effectuer les actions des CA-1 à CA-2, recharger, contrôler le résultat et conserver la vidéo. Tester l’état erreur et lancer axe.
- **Visuel** — `test('conformité SPEC-723 @SPEC-723 @visual')` : jetons, régions, textes, comparaison de référence ≤ 12 %, captures desktop/mobile ≤ 1 % et axe (CA-4).
- **Non-régression** — Rejouer les étiquettes `[SPEC-409]` et `@SPEC-409`, `[SPEC-304]` et `@SPEC-304` en plus des suites unitaires/intégration complètes.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-2 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-3 | intégration RLS, invalides et idempotence |
| CA-4 | e2e et `@SPEC-723 @visual` |

## 13. Preuves attendues

`evidence/SPEC-723/` contient les rapports réels `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, au moins une vidéo Playwright, les captures finales et `acceptance.md` avec preuve vérifiable pour CA-1 à CA-4. Conserver la comparaison côte à côte et le diff avec la référence de maquette. Une pièce manquante fait échouer la validation ; aucune preuve n’est fabriquée.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent : lint, typecheck, build, unitaires, intégration, e2e avec vidéo, `@visual`, axe, non-régression et CA cochés avec preuve. Les limites et cas d’échec de cette spécification sont couverts, les contrats API restent documentés, et aucune donnée d’un autre utilisateur n’est rendue.

## 15. Décisions et hypothèses

- Aucun ADR spécifique dans le catalogue n’était initialement requis ; les règles métier, conventions et documents d’architecture cités sont appliqués. L’ambiguïté du point d’entrée des jalons « 100 notions » et « 30 jours » est tranchée par **ADR-0321** (réconciliation sobre et idempotente à la lecture de `GET /api/v1/milestones`).
- Aucune décision ouverte : une ambiguïté découverte pendant l’implémentation suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification du périmètre.
