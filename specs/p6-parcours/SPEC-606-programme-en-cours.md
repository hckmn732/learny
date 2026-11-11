---
id: SPEC-606
title: "Programme en cours"
phase: P6
priority: V1
depends_on: [SPEC-605]
business_rules: [BR-FOR-07, BR-FOR-08, BR-FOR-09, BR-PRO-01]
screens: [SCR-05]
adrs: []
visual: mockup
---

# SPEC-606 — Programme en cours

## 1. Objectif

Écran Programme en cours : statistiques, calendrier de formation (Gantt avec statuts, marqueur Aujourd'hui, losanges de quiz), modules et chapitres (statuts, scores, actions Ouvrir le module, Apports, Lire le cours, Exercice pratique, Passer le quiz, Revoir le cours, verrou expliqué), lien Examen blanc. Cette spécification livre le contrat, le service, les états d’interface ou de démonstration et les validations nécessaires pour que la capacité soit utilisable et prouvée sans appel à un service réel dans les tests.

## 2. Contexte

Lire `docs/product/vision.md`, `docs/product/business-rules.md`, `docs/product/screens.md`, `docs/architecture/overview.md`, `docs/architecture/data-model.md`, `docs/architecture/api.md`, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. Écran concerné : SCR-05 : `/formations/[fid]/programme`. Les maquettes sont en lecture seule ; le jeu de données SPEC-115 et l’horloge du 11 novembre 2026 permettent des captures reproductibles. Les ADR listés en section 15 priment sur ce texte en cas de conflit.

## 3. Dépendances

- **SPEC-605** — Programme proposé, import, ajustement et validation ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **Architecture transversale** — Les services applicatifs utilisent les contrats Zod de `packages/contracts`, `handler()` de SPEC-201, le client utilisateur soumis à RLS de SPEC-113 et les événements de SPEC-203. Les composants interactifs réutilisent `@learny/ui` et les textes passent par `apps/web/messages/fr.ts`.
- **Services externes** — Les tests utilisent Supabase local et `LLM_MODE=mock`; tout secret réel reste côté serveur. Si un service tiers est indisponible, exécuter les parties mock, consigner le blocage externe selon `sdd-process.md` §3, sans inventer de résultat.

## 4. Règles métier couvertes

- **BR-FOR-07** — Statut d'un module : verrouillé, ouvert (en cours), validé. À la validation du programme, le module 1 est ouvert, les autres verrouillés. Un module s'ouvre quand le quiz de validation du module précédent est réussi.
- **BR-FOR-08** — Un module verrouillé affiche ce qui le débloquera (« Se débloque quand le quiz du module N est validé ») et n'est pas accessible.
- **BR-FOR-09** — Fiche formation : titre, description, objectifs, volume horaire total, date de début, date de fin, rythme (hérité du profil, modifiable), statut. Indicateurs affichés sur le programme : avancement (% de modules validés), durée (semaines), volume (h), seuil.
- **BR-PRO-01** — Avancement d'une formation = modules validés / modules total (en %).

## 5. Exigences fonctionnelles

- **EF-1** — La page lit le programme validé et affiche titre, objectifs, volume, dates, durée en semaines, seuil et avancement `modules_validés / modules_total × 100`, arrondi pour l’affichage seulement.
- **EF-2** — Le calendrier Gantt place chaque module à ses dates, distingue verrouillé, ouvert et validé, affiche le marqueur « Aujourd’hui » dans le fuseau du profil et les losanges des quiz de validation.
- **EF-3** — Chaque module montre ses chapitres ordonnés, score connu, action adaptée à son état (« Ouvrir le module », « Apports », « Lire le cours », « Exercice pratique », « Passer le quiz », « Revoir le cours ») et, s’il est verrouillé, « Se débloque quand le quiz du module N est validé ».
- **EF-4** — Les règles métier BR-FOR-07, BR-FOR-08, BR-FOR-09, BR-PRO-01 de la section 4 sont obligatoires dans tous les états, y compris les erreurs et la reprise.

## 6. Exigences techniques

- **ET-1** — Chaque lecture et mutation utilise le client de l’utilisateur soumis à RLS ; un autre utilisateur reçoit 404. Les entrées/sorties passent par les schémas Zod de `packages/contracts`, et les routes renvoient `application/problem+json` en erreur.
- **ET-2** — Les écritures multi-tables sont transactionnelles ; un événement est émis après commit et une clé d’idempotence empêche une double transition. Les dates passent par l’horloge injectable et le fuseau IANA du profil.
- **ET-3** — `GET /api/v1/formations/:fid/programme` produit un DTO avec `formation`, `modules[]`, `chapters[]`, `calendar[]` et indicateurs calculés depuis les données persistées, jamais depuis un état client provisoire.
- **ET-4** — Les liens de module et de chapitre sont construits avec les routes françaises de `screens.md`; un module verrouillé ne reçoit pas de lien d’accès actif et l’API du module applique le même verrou.
- **ET-5** — Le calcul de pourcentage est une fonction pure testée pour zéro module, premier module ouvert, tous validés et statut en pause.

## 7. Comportements attendus et cas limites

- **CL-1** — Identifiant ou donnée hors schéma : 400 `VALIDATION_FAILED`, sans écriture ni événement ; ressource d’un autre propriétaire : 404 sans révéler son existence.
- **CL-2** — Deux demandes concurrentes identiques ne créent qu’un effet ; une version d’objet devenue obsolète renvoie 409 `CONFLICT` et restitue l’état actuel.
- **CL-3** — Aucun programme validé : rediriger vers le mode proposition ou l’étape de cadrage selon le statut, sans montrer un Gantt vide comme programme actif.
- **CL-4** — Module verrouillé demandé directement par URL : accès refusé avec la condition de déblocage ; ne pas afficher le cours.
- **CL-5** — Dates qui traversent le changement d’heure : les barres du calendrier utilisent les dates locales, pas la différence brute de millisecondes.

## 8. Instructions d'implémentation

1. Ajouter le DTO du programme en cours et la fonction pure `formationProgress(validated,total)`. Commit `feat(SPEC-606): définit les contrats`.
2. Lire statuts, scores et dates par service RLS ; projeter les créneaux de quiz et le jour local dans le Gantt. Commit `feat(SPEC-606): implémente les services`.
3. Construire statistiques, calendrier et cartes de modules avec actions et message de verrou, puis protéger aussi la route du module. Commit `feat(SPEC-606): construit le parcours`.
4. Tester le programme du seed et les états ouvert, validé, verrouillé et formation en pause. Commit `test(SPEC-606): vérifie les cas`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-606`, renseigner les preuves réellement produites puis `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/programme.ts`, `packages/services/src/programme/get-active-programme.ts`, `packages/services/test/integration/active-programme.test.ts`, `apps/web/app/(app)/formations/[fid]/programme/page.tsx`, `apps/web/components/programme/{ProgrammeStats,ProgrammeGantt,ProgrammeModuleCard}.tsx`, `apps/web/e2e/specs/p6/active-programme.spec.ts`.
- **Modifiés** : `apps/web/messages/fr.ts`, `packages/services/src/programme/index.ts`.
- **Lus / réutilisés** : `specs/p6-parcours/SPEC-605-programme-propose-import-ajustement-et-validation.md`.

## 10. Interface et conformité visuelle

État en cours de `Programme.dc.html` : en-tête et quatre indicateurs, calendrier Gantt avec ligne « Aujourd’hui », puis cartes des modules dans l’ordre. `data-testid` : `programme-progress`, `programme-calendar`, `module-status`, `module-unlock-reason`.

- **Contrôles** — Utiliser la référence du SCR-05 dans `design/references/` et mesurer ≤ 12 % de pixels différents ; vérifier les jetons, l’ordre des régions, les textes, axe sans violation serious/critical et la ligne de base `toHaveScreenshot` ≤ 1 % à 1440 × 900 et 390 × 844. Les états chargement, vide, erreur et permission refusée sont distincts, accessibles au clavier et annoncés sans dépendre de la seule couleur.

## 11. Critères d'acceptation

- **CA-1** — Avec 2 modules validés sur 7, l’avancement affiché est 29 % ; la valeur API reste la fraction exacte 2/7.
- **CA-2** — Le module 1 ouvert propose « Ouvrir le module » ; le module 2 verrouillé affiche la condition de déblocage et ne s’ouvre pas par URL.
- **CA-3** — Le calendrier affiche le marqueur du 11 novembre 2026 et les quiz aux dates du seed SPEC-115.
- **CA-4** — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
- **CA-5** — L’écran respecte la maquette avec un écart ≤ 12 % ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.

## 12. Plan de tests

**Unitaires** (2 fichiers, `[SPEC-606]`) :
- `packages/services/src/programme/progress.test.ts` — `[SPEC-606]` : 0/7, 2/7 → 29 % affichés, 7/7 → 100 %, zéro module invalide.
- `apps/web/components/programme/ProgrammeModuleCard.test.tsx` — `[SPEC-606]` : libellé d’action par statut, condition de déblocage et absence de lien actif pour verrouillé.

**Intégration** (Supabase local, `LLM_MODE=mock`, `[SPEC-606]`) :
- `packages/services/test/integration/active-programme.test.ts` — `[SPEC-606]` : GET du programme SAP, modules ordonnés, scores, quiz du Gantt, 404 autre utilisateur, accès direct au module verrouillé refusé.

**End-to-end** (`apps/web/e2e/specs/p6/active-programme.spec.ts`, vidéo) :
- **Scénario** — `programme actif et module verrouillé @SPEC-606` : ouvrir le programme SAP, lire 29 %, marqueur du 11 nov., actions module 1 et verrou module 2 ; tenter l’URL du module 2 et voir la condition.
- **Scénario** — `navigation vers module et examen blanc @SPEC-606` : ouvrir le module autorisé puis revenir et suivre le lien Examen blanc.

**Visuel** — `test('conformité SPEC-606 @SPEC-606 @visual')` : `SCR-05-en-cours-desktop.png` et mobile : quatre statistiques, Gantt, ligne Aujourd’hui, losanges de quiz et cartes de modules ; diff ≤ 12 %, axe, capture ≤ 1 %.

**Non-régression** — Rejouer `[SPEC-605]` et `@SPEC-605` et les suites complètes unitaires/intégration.

| Critère | Tests |
|---|---|
| CA-1 | unitaires et intégration ciblés ; e2e `@SPEC-606` |
| CA-2 | unitaires et intégration ciblés ; e2e `@SPEC-606` |
| CA-3 | unitaires et intégration ciblés ; e2e `@SPEC-606` |
| CA-4 | intégration RLS/idempotence, e2e erreur |
| CA-5 | `@SPEC-606 @visual`, axe, vidéo |

## 13. Preuves attendues

`evidence/SPEC-606/` contient les rapports réels `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, au moins une vidéo Playwright, les captures finales et `acceptance.md` avec preuve vérifiable pour CA-1 à CA-5. Conserver la comparaison côte à côte et le diff avec la référence de maquette. Une pièce manquante fait échouer la validation ; aucune preuve n’est fabriquée.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent : lint, typecheck, build, unitaires, intégration, e2e avec vidéo, `@visual`, axe, non-régression et CA cochés avec preuve. Les limites et cas d’échec de cette spécification sont couverts, les contrats API restent documentés, et aucune donnée d’un autre utilisateur n’est rendue.

## 15. Décisions et hypothèses

- Aucun ADR spécifique dans le catalogue ; les règles métier, conventions et documents d’architecture cités sont appliqués sans nouveau choix de produit.
- Aucune décision ouverte : une ambiguïté découverte pendant l’implémentation suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification du périmètre.

