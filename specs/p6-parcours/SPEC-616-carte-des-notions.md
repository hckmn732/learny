---
id: SPEC-616
title: "Carte des notions"
phase: P6
priority: V1
depends_on: [SPEC-404, SPEC-304, SPEC-411]
business_rules: [BR-CAR-01, BR-CAR-02, BR-CAR-03, BR-CAR-04, BR-CAR-05]
screens: [SCR-14]
adrs: [ADR-0036]
visual: mockup
---

# SPEC-616 — Carte des notions

## 1. Objectif

API notion-graph, composant graphe SVG (simulation de forces déterministe, déplacement, zoom, recentrage, glisser un nœud, survol, sélection), recherche, filtres, modes de couleur, légende, panneau détail et liste À consolider. Cette spécification livre le contrat, le service, les états d’interface ou de démonstration et les validations nécessaires pour que la capacité soit utilisable et prouvée sans appel à un service réel dans les tests.

## 2. Contexte

Lire `docs/product/vision.md`, `docs/product/business-rules.md`, `docs/product/screens.md`, `docs/architecture/overview.md`, `docs/architecture/data-model.md`, `docs/architecture/api.md`, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. Écran concerné : SCR-14 : `/formations/[fid]/carte`. Les maquettes sont en lecture seule ; le jeu de données SPEC-115 et l’horloge du 11 novembre 2026 permettent des captures reproductibles. Les ADR listés en section 15 priment sur ce texte en cas de conflit.

## 3. Dépendances

- **SPEC-404** — Détection, nature et levée des lacunes ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-304** — Coquille : menu latéral ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-411** — Services de persistance du moteur ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **Architecture transversale** — Les services applicatifs utilisent les contrats Zod de `packages/contracts`, `handler()` de SPEC-201, le client utilisateur soumis à RLS de SPEC-113 et les événements de SPEC-203. Les composants interactifs réutilisent `@learny/ui` et les textes passent par `apps/web/messages/fr.ts`.
- **Services externes** — Les tests utilisent Supabase local et `LLM_MODE=mock`; tout secret réel reste côté serveur. Si un service tiers est indisponible, exécuter les parties mock, consigner le blocage externe selon `sdd-process.md` §3, sans inventer de résultat.

## 4. Règles métier couvertes

- **BR-CAR-01** — Graphe de la formation : nœud formation (centre), modules (hubs), notions (taille selon le nombre de liens), apports en option ; liens : contient, prérequis, confusion (orange pointillé), lien repéré par le tuteur (pointillé), source.
- **BR-CAR-02** — Couleurs par module ou par maîtrise (maîtrisée, à consolider, pas encore vue) ; notions à venir atténuées ; légende adaptée au mode.
- **BR-CAR-03** — Interactions : déplacer la vue, zoom (molette et boutons), recentrer, glisser un nœud, survol (voisinage mis en évidence, autres atténués), clic → panneau détail ; recherche de notion (Entrée sélectionne et centre) ; filtres Modules / Notions à venir / Mes apports.
- **BR-CAR-04** — Panneau détail : notion (module, définition, maîtrise et statut, liens groupés « S'appuie sur », « Prépare », « Se confond avec », « Lien repéré par le tuteur », « Dans vos apports », actions Revoir dans le cours / S'entraîner / Voir la lacune) ; module (notions, bilan) ; apport (notions alimentées). Sans sélection : mode d'emploi et liste « À consolider ».
- **BR-CAR-05** — La disposition est déterministe (même formation → même disposition) et calculée côté client sans bibliothèque externe obligatoire.

## 5. Exigences fonctionnelles

- **EF-1** — Le graphe SVG affiche nœud formation, hubs de modules, notions dimensionnées par liens et apports optionnels ; les arêtes distingue contient, prérequis, confusion orange pointillé, lien tuteur et source.
- **EF-2** — Basculer couleurs par module ou maîtrise ; les notions à venir sont atténuées et la légende suit le mode. Déplacer, zoomer à la molette/boutons, recentrer, glisser un nœud, survoler et sélectionner restent opérables à la souris et au clavier.
- **EF-3** — La recherche sélectionne et centre une notion sur Entrée ; filtres Modules, Notions à venir, Mes apports modifient le graphe sans perdre la sélection. Sans sélection, afficher le mode d’emploi et « À consolider ».
- **EF-4** — Le panneau détail d’une notion regroupe « S’appuie sur », « Prépare », « Se confond avec », « Lien repéré par le tuteur », « Dans vos apports », avec actions cours, entraînement et lacune.
- **EF-5** — Les règles métier BR-CAR-01, BR-CAR-02, BR-CAR-03, BR-CAR-04, BR-CAR-05 de la section 4 sont obligatoires dans tous les états, y compris les erreurs et la reprise.

## 6. Exigences techniques

- **ET-1** — Chaque lecture et mutation utilise le client de l’utilisateur soumis à RLS ; un autre utilisateur reçoit 404. Les entrées/sorties passent par les schémas Zod de `packages/contracts`, et les routes renvoient `application/problem+json` en erreur.
- **ET-2** — Les écritures multi-tables sont transactionnelles ; un événement est émis après commit et une clé d’idempotence empêche une double transition. Les dates passent par l’horloge injectable et le fuseau IANA du profil.
- **ET-3** — `GET /api/v1/formations/:fid/notion-graph` renvoie nœuds/liaisons autorisés par RLS, identifiants stables, maîtrise et liens sans contenu privé d’un autre membre.
- **ET-4** — Disposition SVG calculée dans `apps/web/components/notion-graph/layout.ts` par `layoutGraph(graph, seed)` : positions initiales des modules en cercle, répulsion, ressorts et gravité sur 420 itérations avec graine fixe (ADR-0036). Trier les identifiants avant simulation pour conserver les mêmes coordonnées si l’ordre de la réponse change.
- **ET-5** — Séparer modèle de graphe, simulation, pan/zoom et panneau détail ; offrir une liste textuelle équivalente des nœuds et relations pour clavier/lecteur d’écran. Le zoom a des bornes explicites et le recentrage restaure la vue initiale.

## 7. Comportements attendus et cas limites

- **CL-1** — Identifiant ou donnée hors schéma : 400 `VALIDATION_FAILED`, sans écriture ni événement ; ressource d’un autre propriétaire : 404 sans révéler son existence.
- **CL-2** — Deux demandes concurrentes identiques ne créent qu’un effet ; une version d’objet devenue obsolète renvoie 409 `CONFLICT` et restitue l’état actuel.
- **CL-3** — Formation sans notion : nœud formation et état vide, sans simulation instable.
- **CL-4** — Graphe dense : animation arrêtée quand l’énergie se stabilise ; `prefers-reduced-motion` rend directement la disposition finale.
- **CL-5** — Apport d’un autre membre : aucun nœud ni lien source privé dans l’API ou le panneau.

## 8. Instructions d'implémentation

1. Définir `NotionGraphDto` avec nœuds formation/module/notion/apport, liens typés et champs autorisés par RLS. Commit `feat(SPEC-616): définit les contrats`.
2. Implémenter `layoutGraph(graph,seed)` déterministe, pan/zoom borné, recherche et filtres comme fonctions pures testées. Commit `feat(SPEC-616): implémente les services`.
3. Construire graphe SVG, barre, légende, panneau détail et liste clavier équivalente de `Carte.dc.html`. Commit `feat(SPEC-616): construit le parcours`.
4. Vérifier les apports privés en groupe, les états survol/sélection et la stabilité des coordonnées. Commit `test(SPEC-616): vérifie les cas`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-616`, renseigner les preuves réellement produites puis `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/notion-graph.ts`, `packages/services/src/notion-graph/get-graph.ts`, `packages/services/test/integration/notion-graph.test.ts`, `apps/web/app/(app)/formations/[fid]/carte/page.tsx`, `apps/web/lib/notion-graph/{pan-zoom,search}.ts`, `apps/web/components/notion-graph/{layout,GraphSvg,GraphToolbar,GraphDetail,GraphList}.tsx`, `apps/web/e2e/specs/p6/notion-graph.spec.ts`.
- **Modifiés** : `apps/web/messages/fr.ts`, `docs/architecture/api.md`.
- **Lus / réutilisés** : `specs/p4-moteur/SPEC-404-detection-nature-et-levee-des-lacunes.md`, `specs/p3-interface/SPEC-304-coquille-menu-lateral.md`, `specs/p4-moteur/SPEC-411-services-de-persistance-du-moteur.md`.

## 10. Interface et conformité visuelle

`Carte.dc.html` : barre recherche/filtres/modes, canevas SVG, légende, panneau détail et liste « À consolider ». Vérifier états survol, sélection, zoom et notion à venir. `data-testid` : `notion-graph`, `graph-node`, `graph-legend`, `graph-detail`.

- **Contrôles** — Utiliser la référence du SCR-14 dans `design/references/` et mesurer ≤ 12 % de pixels différents ; vérifier les jetons, l’ordre des régions, les textes, axe sans violation serious/critical et la ligne de base `toHaveScreenshot` ≤ 1 % à 1440 × 900 et 390 × 844. Les états chargement, vide, erreur et permission refusée sont distincts, accessibles au clavier et annoncés sans dépendre de la seule couleur.

## 11. Critères d'acceptation

- **CA-1** — Deux chargements de la même formation donnent les mêmes coordonnées initiales pour tous les nœuds.
- **CA-2** — Recherche + Entrée centre la notion ; zoom, recentrage et glisser modifient seulement la vue, jamais les données du graphe.
- **CA-3** — Le panneau d’une lacune affiche ses liens groupés et les actions vers cours, entraînement et Mes lacunes ; la liste textuelle reste navigable au clavier.
- **CA-4** — Un second utilisateur reçoit 404 pour le graphe du premier ; un membre de groupe ne reçoit aucun apport privé d’un autre membre ; un identifiant mal formé reçoit 400 sans calcul du graphe.
- **CA-5** — L’écran respecte la maquette avec un écart ≤ 12 % ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.

## 12. Plan de tests

**Unitaires** (3 fichiers, `[SPEC-616]`) :
- `apps/web/components/notion-graph/layout.test.ts` — `[SPEC-616]` : mêmes identifiants dans un autre ordre → mêmes coordonnées après 420 itérations ; formation vide ; graphe dense stable ; aucun `NaN`.
- `apps/web/lib/notion-graph/pan-zoom.test.ts` — `[SPEC-616]` : bornes de zoom, recentrage, glisser nœud, recherche+Entrée centre et filtres sans perdre la sélection.
- `apps/web/components/notion-graph/GraphDetail.test.tsx` — `[SPEC-616]` : groupes de liens et actions selon type de nœud, liste textuelle au clavier.

**Intégration** (Supabase local, `LLM_MODE=mock`, `[SPEC-616]`) :
- `packages/services/test/integration/notion-graph.test.ts` — `[SPEC-616]` : GET du graphe SAP, types de liens, maîtrise, notion à venir atténuée, apport personnel visible et apport d’un autre membre absent, 404 autre utilisateur.

**End-to-end** (`apps/web/e2e/specs/p6/notion-graph.spec.ts`, vidéo) :
- **Scénario** — `explore la carte des notions @SPEC-616` : chercher « Variante d’exercice », Entrée, vérifier centrage et panneau, zoomer puis recentrer, filtrer Mes apports et basculer couleurs.
- **Scénario** — `parcourt la liste accessible @SPEC-616` : clavier sur nœuds/relations, sélection et lien Revoir dans le cours.

**Visuel** — `test('conformité SPEC-616 @SPEC-616 @visual')` : `SCR-14-desktop.png` et mobile : barre outils, formation centrale, modules, liens confusion pointillés, légende, panneau détail et liste À consolider ; diff ≤ 12 %, axe, capture ≤ 1 %.

**Non-régression** — Rejouer `[SPEC-404]` et `@SPEC-404`, `[SPEC-304]` et `@SPEC-304`, `[SPEC-411]` et `@SPEC-411` et les suites complètes unitaires/intégration.

| Critère | Tests |
|---|---|
| CA-1 | unitaires et intégration ciblés ; e2e `@SPEC-616` |
| CA-2 | unitaires et intégration ciblés ; e2e `@SPEC-616` |
| CA-3 | unitaires et intégration ciblés ; e2e `@SPEC-616` |
| CA-4 | intégration RLS/idempotence, e2e erreur |
| CA-5 | `@SPEC-616 @visual`, axe, vidéo |

## 13. Preuves attendues

`evidence/SPEC-616/` contient les rapports réels `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, au moins une vidéo Playwright, les captures finales et `acceptance.md` avec preuve vérifiable pour CA-1 à CA-5. Conserver la comparaison côte à côte et le diff avec la référence de maquette. Une pièce manquante fait échouer la validation ; aucune preuve n’est fabriquée.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent : lint, typecheck, build, unitaires, intégration, e2e avec vidéo, `@visual`, axe, non-régression et CA cochés avec preuve. Les limites et cas d’échec de cette spécification sont couverts, les contrats API restent documentés, et aucune donnée d’un autre utilisateur n’est rendue.

## 15. Décisions et hypothèses

- **ADR-0036 — Carte des notions : rendu SVG et disposition déterministe** : Rendu SVG dans un composant client ; simulation de forces implémentée dans `apps/web/components/notion-graph/layout.ts` (répulsion, ressorts, gravité, 420 itérations, graine fixe) sans dépendance ; positions initiales par module en cercle. Interactions impératives hors rendu React (pointer events). Données servies par `/api/v1/formations/:fid/notion-graph`.
- Aucune décision ouverte : une ambiguïté découverte pendant l’implémentation suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification du périmètre.

