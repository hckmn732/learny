---
id: SPEC-720
title: "Automatisme 9 : bilan de la semaine"
phase: P7
priority: V1
depends_on: [SPEC-711, SPEC-408]
business_rules: [BR-AUT-09]
screens: [SCR-03]
adrs: [ADR-0190]
visual: mockup
---

# SPEC-720 — Automatisme 9 : bilan de la semaine

## 1. Objectif

Génération hebdomadaire (heures, rétention, notions à risque, plan), carte d'accueil dépliable, notification et e-mail selon le canal, lien Mes disponibilités changent. Cette spécification livre le contrat, le service, les états d’interface ou de démonstration et les validations nécessaires pour que la capacité soit utilisable et prouvée sans appel à un service réel dans les tests.

## 2. Contexte

Lire `docs/product/vision.md`, `docs/product/business-rules.md`, `docs/product/screens.md`, `docs/architecture/overview.md`, `docs/architecture/data-model.md`, `docs/architecture/api.md`, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. Écran concerné : SCR-03 : `/accueil` (`/` redirige). Les maquettes sont en lecture seule ; le jeu de données SPEC-115 et l’horloge du 11 novembre 2026 permettent des captures reproductibles. Les ADR listés en section 15 priment sur ce texte en cas de conflit.

## 3. Dépendances

- **SPEC-711** — Moteur d'automatismes ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-408** — Rétention et indicateurs de progression ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **Architecture transversale** — Les opérations utilisent les contrats Zod de `packages/contracts`, `handler()` de SPEC-201 et le client utilisateur soumis à RLS de SPEC-113. Les dates sont calculées par `@learny/core/time` avec l’horloge injectable ; l’interface réutilise `@learny/ui` et les textes de `apps/web/messages/fr.ts`.
- **Services externes** — Les tests utilisent Supabase local et `LLM_MODE=mock`; tout secret réel reste côté serveur. Si un service tiers est indisponible, exécuter les parties mock, consigner le blocage externe selon `sdd-process.md` §3, sans inventer de résultat.

## 4. Règles métier couvertes

- **BR-AUT-09** — **Bilan de la semaine** : chaque semaine (défaut dimanche 19:00 ; jour ven/sam/dim, heure 18/19/20 h) : heures d'étude, rétention, notions à risque d'oubli, plan de la semaine suivante, question « vos disponibilités changent-elles ? » ; canal application (défaut) ou application et e-mail.

## 5. Exigences fonctionnelles

- **EF-1** — Chaque semaine au jour/heure configurés (défaut dimanche 19:00 ; vendredi/samedi/dimanche, 18/19/20 h), produire un bilan d’heures, rétention, notions à risque et plan de la semaine suivante.
- **EF-2** — La carte d’accueil est dépliable, garde les valeurs réelles calculées et pose « Vos disponibilités changent-elles ? » avec lien vers le rythme/agenda.
- **EF-3** — Canal application par défaut, ou application et e-mail ; le service de notification respecte préférences, heures calmes et plafond. Le journal garde une seule action par semaine locale.
- **EF-4** — Les règles métier BR-AUT-09 de la section 4 sont obligatoires dans tous les états, y compris les erreurs et la reprise.

## 6. Exigences techniques

- **ET-1** — Les routes API valident entrée/sortie avec Zod et appellent un service soumis à RLS ; un objet d’un autre utilisateur répond 404. Les mutations rejouables portent une clé d’idempotence.
- **ET-2** — Les actions et notifications sont écrites dans une transaction puis émises après commit ; l’horloge injectable et le fuseau IANA du profil déterminent les échéances et les semaines locales.
- **ET-3** — Définition `bilan` de SPEC-711 (ADR-0190), action `kind='weekly_review'`, déclenchée par le cron horaire de SPEC-203 ; `payload.dedupeKey` sur utilisateur+année-semaine locale et `clock.now()` injectée.
- **ET-4** — Agréger les minutes de `schedule_slots` réalisées, rétention SPEC-408, notions dues/à risque SPEC-402 et créneaux futurs SPEC-407 ; une mesure absente s’affiche « Non disponible », jamais 0 inventé.
- **ET-5** — Le texte peut être rédigé par le tuteur en mode mock en test ; les chiffres proviennent toujours du code. L’e-mail réutilise SPEC-204 et le routage SPEC-209.

## 7. Comportements attendus et cas limites

- **CL-1** — Identifiant ou donnée hors schéma : 400 `VALIDATION_FAILED`, sans écriture ni événement ; ressource d’un autre propriétaire : 404 sans révéler son existence.
- **CL-2** — Deux demandes concurrentes identiques ne créent qu’un effet ; une version d’objet devenue obsolète renvoie 409 `CONFLICT` et restitue l’état actuel.
- **CL-3** — Cron livré deux fois à l’heure choisie : un bilan et une notification.
- **CL-4** — Semaine sans activité : montrer 0 h réellement, et « Non disponible » pour rétention non mesurable.
- **CL-5** — Heure choisie dans une transition DST : un seul bilan pour la semaine locale.

## 8. Instructions d'implémentation

1. Relire les contrats des dépendances et les règles BR-AUT-09 ; définir les schémas Zod et types DTO dans `packages/contracts/src/automatisme-9-bilan-de-la-semaine.ts`. Ajouter les valeurs métier à `packages/config/src/product.ts` uniquement si elles viennent d’une règle ou d’un ADR. Commit `feat(SPEC-720): définit les contrats`.
2. Écrire `packages/automations/src/automatisme-9-bilan-de-la-semaine.ts` et ses fonctions pures d’aide ; toute écriture multi-tables est transactionnelle. Utiliser l’horloge injectée et le client RLS. Commit `feat(SPEC-720): implémente la capacité`.
3. Brancher les routes documentées, les événements après commit et les composants ou la page SDD. Réutiliser `@learny/ui` et ajouter les libellés à `apps/web/messages/fr.ts`. Commit `feat(SPEC-720): expose le parcours`.
4. Couvrir chaque EF et CL par les tests section 12 ; utiliser les fixtures du jeu SPEC-115, l’IA mock et l’horloge figée. Créer la référence de non-régression sans toucher aux maquettes. Commit `test(SPEC-720): vérifie le parcours et les limites`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-720`, corriger les erreurs, lier les preuves réelles aux CA dans `evidence/SPEC-720/acceptance.md` puis terminer avec `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/automatisme-9-bilan-de-la-semaine.ts`, `packages/automations/src/automatisme-9-bilan-de-la-semaine.ts`, `packages/automations/src/automatisme-9-bilan-de-la-semaine.test.ts`, `packages/services/test/integration/automatisme-9-bilan-de-la-semaine.test.ts`, `apps/web/e2e/specs/p7/spec-720.spec.ts`.
- **Modifiés** : `apps/web/messages/fr.ts`, exports des paquets, routes `apps/web/app/api/v1/**` correspondant à ET-6, composants de l’écran SCR-03, catalogue d’événements si la capacité en émet.
- **Lus / réutilisés** : `specs/p7-engagement/SPEC-711-moteur-d-automatismes.md`, `specs/p4-moteur/SPEC-408-retention-et-indicateurs-de-progression.md`.

## 10. Interface et conformité visuelle

SCR-03 : carte « Bilan de la semaine » fermée/ouverte, chiffres et lien « Mes disponibilités changent ». `data-testid` : `weekly-review`, `weekly-review-hours`, `weekly-review-availability`.

- **Contrôles** — Utiliser la référence du SCR-03 dans `design/references/` et mesurer ≤ 12 % de pixels différents ; vérifier les jetons, l’ordre des régions, les textes, axe sans violation serious/critical et la ligne de base `toHaveScreenshot` ≤ 1 % à 1440 × 900 et 390 × 844. Les états chargement, vide, erreur et permission refusée sont distincts, accessibles au clavier et annoncés sans dépendre de la seule couleur.

## 11. Critères d'acceptation

- **CA-1** — Le dimanche à 19:00 local, le seed produit un bilan unique avec heures égales à la somme des créneaux faits ; une relance du cron ne duplique rien.
- **CA-2** — Passer au canal application et e-mail crée une livraison e-mail autorisée ; le canal application seul n’en crée pas.
- **CA-3** — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
- **CA-4** — L’écran respecte la maquette avec un écart ≤ 12 % ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.

## 12. Plan de tests

- **Unitaires** — `packages/services/src/spec-720.test.ts`, `describe('[SPEC-720] règles et calculs')` : pour CA-1 : Le dimanche à 19:00 local, le seed produit un bilan unique avec heures égales à la somme des créneaux faits ; une relance du cron ne duplique rien. ; CA-2 : Passer au canal application et e-mail crée une livraison e-mail autorisée ; le canal application seul n’en crée pas. Tester aussi valeurs limites, entrée vide, ordre déterministe et fuseau si le comportement dépend du temps.
- **Intégration** — `packages/services/test/integration/spec-720.test.ts`, `describe('[SPEC-720] service et API')` : exécuter les mêmes cas sur Supabase local avec `LLM_MODE=mock`, vérifier les lignes et événements réellement écrits, puis 400, 404 RLS, 409 et double envoi (CA-3).
- **End-to-end** — `apps/web/e2e/specs/p7/spec-720.spec.ts`, `test('parcours SPEC-720 @SPEC-720')` : partir du seed SPEC-115, ouvrir SCR-03, effectuer les actions des CA-1 à CA-2, recharger, contrôler le résultat et conserver la vidéo. Tester l’état erreur et lancer axe.
- **Visuel** — `test('conformité SPEC-720 @SPEC-720 @visual')` : jetons, régions, textes, comparaison de référence ≤ 12 %, captures desktop/mobile ≤ 1 % et axe (CA-4).
- **Non-régression** — Rejouer les étiquettes `[SPEC-711]` et `@SPEC-711`, `[SPEC-408]` et `@SPEC-408` en plus des suites unitaires/intégration complètes.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-2 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-3 | intégration RLS, invalides et idempotence |
| CA-4 | e2e et `@SPEC-720 @visual` |

## 13. Preuves attendues

`evidence/SPEC-720/` contient les rapports réels `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, au moins une vidéo Playwright, les captures finales et `acceptance.md` avec preuve vérifiable pour CA-1 à CA-4. Conserver la comparaison côte à côte et le diff avec la référence de maquette. Une pièce manquante fait échouer la validation ; aucune preuve n’est fabriquée.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent : lint, typecheck, build, unitaires, intégration, e2e avec vidéo, `@visual`, axe, non-régression et CA cochés avec preuve. Les limites et cas d’échec de cette spécification sont couverts, les contrats API restent documentés, et aucune donnée d’un autre utilisateur n’est rendue.

## 15. Décisions et hypothèses

- ADR-0190 fixe la clé `bilan`, le contrat d’action et l’idempotence ; le catalogue doit référencer cet ADR pour SPEC-720.
- Aucune décision ouverte : une ambiguïté découverte pendant l’implémentation suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification du périmètre.

