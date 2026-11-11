---
id: SPEC-615
title: "Mes lacunes"
phase: P6
priority: V1
depends_on: [SPEC-404, SPEC-304, SPEC-411]
business_rules: [BR-LAC-05]
screens: [SCR-13]
adrs: []
visual: mockup
---

# SPEC-615 — Mes lacunes

## 1. Objectif

Écran Lacunes.dc.html : statistiques, filtres par nature avec compteurs (URL ?nature=), cartes de lacune, S'entraîner (selon la nature : quiz global ciblé ou exercice), Revoir dans le cours (ancre), note explicative, état vide ; API gaps. Cette spécification livre le contrat, le service, les états d’interface ou de démonstration et les validations nécessaires pour que la capacité soit utilisable et prouvée sans appel à un service réel dans les tests.

## 2. Contexte

Lire `docs/product/vision.md`, `docs/product/business-rules.md`, `docs/product/screens.md`, `docs/architecture/overview.md`, `docs/architecture/data-model.md`, `docs/architecture/api.md`, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. Écran concerné : SCR-13 : `/formations/[fid]/lacunes?nature=`. Les maquettes sont en lecture seule ; le jeu de données SPEC-115 et l’horloge du 11 novembre 2026 permettent des captures reproductibles. Les ADR listés en section 15 priment sur ce texte en cas de conflit.

## 3. Dépendances

- **SPEC-404** — Détection, nature et levée des lacunes ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-304** — Coquille : menu latéral ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-411** — Services de persistance du moteur ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **Architecture transversale** — Les services applicatifs utilisent les contrats Zod de `packages/contracts`, `handler()` de SPEC-201, le client utilisateur soumis à RLS de SPEC-113 et les événements de SPEC-203. Les composants interactifs réutilisent `@learny/ui` et les textes passent par `apps/web/messages/fr.ts`.
- **Services externes** — Les tests utilisent Supabase local et `LLM_MODE=mock`; tout secret réel reste côté serveur. Si un service tiers est indisponible, exécuter les parties mock, consigner le blocage externe selon `sdd-process.md` §3, sans inventer de résultat.

## 4. Règles métier couvertes

- **BR-LAC-05** — Page « Mes lacunes » par formation : statistiques (notions à consolider, notions maîtrisées, prochaine révision), filtres par nature avec compteurs, une carte par lacune (nature, module et chapitre, notion, ce qui l'a révélée, ce que le tuteur propose, maîtrise et seuil, actions « S'entraîner » et « Revoir dans le cours »).

## 5. Exigences fonctionnelles

- **EF-1** — Afficher pour une formation les notions à consolider, les notions maîtrisées et la prochaine révision ; les compteurs des filtres restent calculés sur toutes les lacunes ouvertes.
- **EF-2** — Les filtres par nature se reflètent dans `?nature=` et montrent une carte par lacune avec notion, module, chapitre, révélation, recommandation du tuteur, maîtrise et seuil.
- **EF-3** — « S’entraîner » ouvre un quiz global ciblé pour oubli/confusion/incompréhension ou un exercice pratique pour difficulté d’application ; « Revoir dans le cours » mène à la section précise.
- **EF-4** — Les règles métier BR-LAC-05 de la section 4 sont obligatoires dans tous les états, y compris les erreurs et la reprise.

## 6. Exigences techniques

- **ET-1** — Chaque lecture et mutation utilise le client de l’utilisateur soumis à RLS ; un autre utilisateur reçoit 404. Les entrées/sorties passent par les schémas Zod de `packages/contracts`, et les routes renvoient `application/problem+json` en erreur.
- **ET-2** — Les écritures multi-tables sont transactionnelles ; un événement est émis après commit et une clé d’idempotence empêche une double transition. Les dates passent par l’horloge injectable et le fuseau IANA du profil.
- **ET-3** — `GET /api/v1/formations/:fid/gaps?nature=` valide la nature et renvoie `summary`, `countsByNature`, `items[]`, `nextReviewAt`; le service joint notion, chapitre et état de maîtrise via le client RLS.
- **ET-4** — Les liens d’entraînement sont dérivés de `gap_nature` et de la réponse recommandée de SPEC-404, pas d’un texte libre du modèle.
- **ET-5** — Une carte inclut `revealedBy` depuis l’événement de lacune et un `courseSectionId` valide ; une source supprimée ne fournit pas d’ancre cassée.

## 7. Comportements attendus et cas limites

- **CL-1** — Identifiant ou donnée hors schéma : 400 `VALIDATION_FAILED`, sans écriture ni événement ; ressource d’un autre propriétaire : 404 sans révéler son existence.
- **CL-2** — Deux demandes concurrentes identiques ne créent qu’un effet ; une version d’objet devenue obsolète renvoie 409 `CONFLICT` et restitue l’état actuel.
- **CL-3** — Aucune lacune ouverte : zéro compteur, état vide encourageant sans appel IA.
- **CL-4** — Nature inconnue dans l’URL : 400 API ; interface revient au filtre Toutes avec message contrôlé.
- **CL-5** — Lacune levée entre liste et clic : ouvrir l’entraînement normal sans la réactiver artificiellement.

## 8. Instructions d'implémentation

1. Définir `GapListDto` avec statistiques, compteurs par nature, cartes et prochaine révision. Commit `feat(SPEC-615): définit les contrats`.
2. Lire `notion_states` et événements de lacunes du propriétaire ; construire liens d’entraînement et ancre de cours selon la nature. Commit `feat(SPEC-615): implémente les services`.
3. Composer statistiques, filtres URL et cartes de `Lacunes.dc.html`, y compris état vide. Commit `feat(SPEC-615): construit le parcours`.
4. Tester compteurs indépendants du filtre, 404 RLS et liens de chaque nature. Commit `test(SPEC-615): vérifie les cas`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-615`, renseigner les preuves réellement produites puis `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/gaps.ts`, `packages/services/src/gaps/list-gaps.ts`, `packages/services/test/integration/gaps-page.test.ts`, `apps/web/app/(app)/formations/[fid]/lacunes/page.tsx`, `apps/web/components/gaps/{GapStats,GapFilters,GapCard}.tsx`, `apps/web/e2e/specs/p6/gaps.spec.ts`.
- **Modifiés** : `apps/web/messages/fr.ts`, `docs/architecture/api.md`.
- **Lus / réutilisés** : `specs/p4-moteur/SPEC-404-detection-nature-et-levee-des-lacunes.md`, `specs/p3-interface/SPEC-304-coquille-menu-lateral.md`, `specs/p4-moteur/SPEC-411-services-de-persistance-du-moteur.md`.

## 10. Interface et conformité visuelle

`Lacunes.dc.html` : en-tête, trois statistiques, filtres avec compteurs, cartes de lacune, note explicative. `data-testid` : `gaps-summary`, `gaps-filter`, `gap-card`, `gap-train`, `gap-course-link`.

- **Contrôles** — Utiliser la référence du SCR-13 dans `design/references/` et mesurer ≤ 12 % de pixels différents ; vérifier les jetons, l’ordre des régions, les textes, axe sans violation serious/critical et la ligne de base `toHaveScreenshot` ≤ 1 % à 1440 × 900 et 390 × 844. Les états chargement, vide, erreur et permission refusée sont distincts, accessibles au clavier et annoncés sans dépendre de la seule couleur.

## 11. Critères d'acceptation

- **CA-1** — La lacune démo d’oubli apparaît dans le filtre Oubli, avec maîtrise et seuil exacts et prochaine révision locale.
- **CA-2** — Passer de Toutes à Confusion met à jour `?nature=confusion`, les cartes et les compteurs sans changer les données persistées.
- **CA-3** — Les deux actions d’une carte mènent respectivement à l’entraînement adapté et à l’ancre du cours.
- **CA-4** — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
- **CA-5** — L’écran respecte la maquette avec un écart ≤ 12 % ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.

## 12. Plan de tests

**Unitaires** (2 fichiers, `[SPEC-615]`) :
- `packages/services/src/gaps/links.test.ts` — `[SPEC-615]` : oubli/confusion/incompréhension → quiz ciblé, application → exercice, ancre de cours valide.
- `apps/web/components/gaps/GapFilters.test.tsx` — `[SPEC-615]` : compteur Tous et par nature, URL `?nature=confusion`, clavier.

**Intégration** (Supabase local, `LLM_MODE=mock`, `[SPEC-615]`) :
- `packages/services/test/integration/gaps-page.test.ts` — `[SPEC-615]` : seed SAP, statistiques, lacunes ouvertes seulement, filtre, prochaine date locale, 400 nature inconnue, 404 formation étrangère.

**End-to-end** (`apps/web/e2e/specs/p6/gaps.spec.ts`, vidéo) :
- **Scénario** — `filtre et entraîne une lacune @SPEC-615` : ouvrir Mes lacunes, choisir Oubli puis Confusion, lire cartes et cliquer S’entraîner.
- **Scénario** — `revoit la lacune dans le cours @SPEC-615` : suivre l’ancre de la carte et revenir aux filtres conservés.

**Visuel** — `test('conformité SPEC-615 @SPEC-615 @visual')` : `SCR-13-desktop.png` et mobile : trois statistiques, filtres avec compteurs, cartes et note explicative ; diff ≤ 12 %, axe, capture ≤ 1 %.

**Non-régression** — Rejouer `[SPEC-404]` et `@SPEC-404`, `[SPEC-304]` et `@SPEC-304`, `[SPEC-411]` et `@SPEC-411` et les suites complètes unitaires/intégration.

| Critère | Tests |
|---|---|
| CA-1 | unitaires et intégration ciblés ; e2e `@SPEC-615` |
| CA-2 | unitaires et intégration ciblés ; e2e `@SPEC-615` |
| CA-3 | unitaires et intégration ciblés ; e2e `@SPEC-615` |
| CA-4 | intégration RLS/idempotence, e2e erreur |
| CA-5 | `@SPEC-615 @visual`, axe, vidéo |

## 13. Preuves attendues

`evidence/SPEC-615/` contient les rapports réels `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, au moins une vidéo Playwright, les captures finales et `acceptance.md` avec preuve vérifiable pour CA-1 à CA-5. Conserver la comparaison côte à côte et le diff avec la référence de maquette. Une pièce manquante fait échouer la validation ; aucune preuve n’est fabriquée.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent : lint, typecheck, build, unitaires, intégration, e2e avec vidéo, `@visual`, axe, non-régression et CA cochés avec preuve. Les limites et cas d’échec de cette spécification sont couverts, les contrats API restent documentés, et aucune donnée d’un autre utilisateur n’est rendue.

## 15. Décisions et hypothèses

- Aucun ADR spécifique dans le catalogue ; les règles métier, conventions et documents d’architecture cités sont appliqués sans nouveau choix de produit.
- Aucune décision ouverte : une ambiguïté découverte pendant l’implémentation suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification du périmètre.

