---
id: SPEC-705
title: "Agenda : déplacer et réajuster le planning"
phase: P7
priority: V1
depends_on: [SPEC-704]
business_rules: [BR-AGE-05, BR-FOR-14]
screens: [SCR-12]
adrs: [ADR-0029]
visual: tokens
---

# SPEC-705 — Agenda : déplacer et réajuster le planning

## 1. Objectif

Déplacer une activité (3 créneaux proposés), options de réajustement d'un module bloqué (décaler la fin, augmenter le volume, alléger) avec accord explicite, replanification. Cette spécification livre le contrat, le service, les états d’interface ou de démonstration et les validations nécessaires pour que la capacité soit utilisable et prouvée sans appel à un service réel dans les tests.

## 2. Contexte

Lire `docs/product/vision.md`, `docs/product/business-rules.md`, `docs/product/screens.md`, `docs/architecture/overview.md`, `docs/architecture/data-model.md`, `docs/architecture/api.md`, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. Écran concerné : SCR-12 : route du catalogue. Les maquettes sont en lecture seule ; le jeu de données SPEC-115 et l’horloge du 11 novembre 2026 permettent des captures reproductibles. Les ADR listés en section 15 priment sur ce texte en cas de conflit.

## 3. Dépendances

- **SPEC-704** — Agenda : vues, filtres et détail ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **Architecture transversale** — Les opérations utilisent les contrats Zod de `packages/contracts`, `handler()` de SPEC-201 et le client utilisateur soumis à RLS de SPEC-113. Les dates sont calculées par `@learny/core/time` avec l’horloge injectable ; l’interface réutilise `@learny/ui` et les textes de `apps/web/messages/fr.ts`.
- **Services externes** — Les tests utilisent Supabase local et `LLM_MODE=mock`; tout secret réel reste côté serveur. Si un service tiers est indisponible, exécuter les parties mock, consigner le blocage externe selon `sdd-process.md` §3, sans inventer de résultat.

## 4. Règles métier couvertes

- **BR-AGE-05** — Sélectionner une activité affiche son détail (type, titre, jour, horaire, informations, « Ouvrir », « Déplacer ») ; « Déplacer » propose les 3 prochains créneaux libres compatibles.
- **BR-FOR-14** — Si un module reste bloqué (quiz non validé après la dernière marge planifiée, ou retard ≥ 3 jours sur le planning), le tuteur propose trois options : décaler la fin, augmenter le volume quotidien, alléger le programme ; l'apprenant choisit ; rien n'est appliqué sans son accord.

## 5. Exigences fonctionnelles

- **EF-1** — Dans le détail d’une activité future, « Déplacer » demande au planificateur les trois prochains créneaux libres compatibles avec durée, disponibilités, dates du module et autres formations ; choisir un créneau déplace seulement cette activité et recalcule les marges.
- **EF-2** — Quand un module est bloqué (quiz échoué après la dernière marge ou retard d’au moins 3 jours), proposer « Décaler la fin », « Augmenter le volume quotidien » et « Alléger le programme » avec aperçu de l’effet de chacune ; aucune option n’est appliquée sans accord.
- **EF-3** — Après acceptation, la replanification incrémentale conserve les activités réalisées, les rendez-vous fixes et les autres formations ; l’agenda affiche immédiatement les créneaux modifiés et l’explication du tuteur.
- **EF-4** — Les règles métier BR-AGE-05, BR-FOR-14 de la section 4 sont obligatoires dans tous les états, y compris les erreurs et la reprise.

## 6. Exigences techniques

- **ET-1** — Les routes API valident entrée/sortie avec Zod et appellent un service soumis à RLS ; un objet d’un autre utilisateur répond 404. Les mutations rejouables portent une clé d’idempotence.
- **ET-2** — Les actions et notifications sont écrites dans une transaction puis émises après commit ; l’horloge injectable et le fuseau IANA du profil déterminent les échéances et les semaines locales.
- **ET-3** — `GET /slots/:id/alternatives` renvoie au plus trois `slotId`, horaires locaux et raisons de compatibilité ; `POST /slots/:id/move` exige l’ID/version du créneau attendu et retourne le nouvel agenda. Le service verrouille la plage pour éviter deux déplacements concurrents.
- **ET-4** — `POST /formations/:fid/replan-options` calcule les trois scénarios sans mutation ; `POST /formations/:fid/replan` reçoit le choix explicite et la version du plan. `alléger` crée une action en attente d’accord selon BR-AUT-11.
- **ET-5** — Le planificateur de SPEC-407 est seul responsable du calcul ; l’UI n’invente pas de disponibilité et affiche les heures dans le fuseau de l’utilisateur.

## 7. Comportements attendus et cas limites

- **CL-1** — Identifiant ou donnée hors schéma : 400 `VALIDATION_FAILED`, sans écriture ni événement ; ressource d’un autre propriétaire : 404 sans révéler son existence.
- **CL-2** — Deux demandes concurrentes identiques ne créent qu’un effet ; une version d’objet devenue obsolète renvoie 409 `CONFLICT` et restitue l’état actuel.
- **CL-3** — Aucun créneau compatible : afficher « Aucun créneau disponible » et proposer d’ajuster le rythme, sans déplacer l’activité.
- **CL-4** — Créneau choisi devenu occupé : 409 et nouvelle liste de trois alternatives.
- **CL-5** — Option de réajustement refusée : planning et date de fin inchangés.

## 8. Instructions d'implémentation

1. Relire les contrats des dépendances et les règles BR-AGE-05, BR-FOR-14 ; définir les schémas Zod et types DTO dans `packages/contracts/src/agenda-deplacer-et-reajuster-le-planning.ts`. Ajouter les valeurs métier à `packages/config/src/product.ts` uniquement si elles viennent d’une règle ou d’un ADR. Commit `feat(SPEC-705): définit les contrats`.
2. Écrire `packages/services/src/agenda-deplacer-et-reajuster-le-planning.ts` et ses fonctions pures d’aide ; toute écriture multi-tables est transactionnelle. Utiliser l’horloge injectée et le client RLS. Commit `feat(SPEC-705): implémente la capacité`.
3. Brancher les routes documentées, les événements après commit et les composants ou la page SDD. Réutiliser `@learny/ui` et ajouter les libellés à `apps/web/messages/fr.ts`. Commit `feat(SPEC-705): expose le parcours`.
4. Couvrir chaque EF et CL par les tests section 12 ; utiliser les fixtures du jeu SPEC-115, l’IA mock et l’horloge figée. Créer la référence de non-régression sans toucher aux maquettes. Commit `test(SPEC-705): vérifie le parcours et les limites`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-705`, corriger les erreurs, lier les preuves réelles aux CA dans `evidence/SPEC-705/acceptance.md` puis terminer avec `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/agenda-deplacer-et-reajuster-le-planning.ts`, `packages/services/src/agenda-deplacer-et-reajuster-le-planning.ts`, `packages/services/src/agenda-deplacer-et-reajuster-le-planning.test.ts`, `packages/services/test/integration/agenda-deplacer-et-reajuster-le-planning.test.ts`, `apps/web/e2e/specs/p7/spec-705.spec.ts`.
- **Modifiés** : `apps/web/messages/fr.ts`, exports des paquets, routes `apps/web/app/api/v1/**` correspondant à ET-6, composants de l’écran SCR-12, catalogue d’événements si la capacité en émet.
- **Lus / réutilisés** : `specs/p7-engagement/SPEC-704-agenda-vues-filtres-et-detail.md`.

## 10. Interface et conformité visuelle

`Agenda.dc.html` : panneau de détail sélectionné, bouton « Déplacer », liste de trois créneaux et confirmation ; état du module bloqué avec les trois cartes d’option. `data-testid` : `slot-move`, `slot-alternatives`, `replan-options`, `replan-confirm`.

- **Contrôles** — vérifier les jetons, l’ordre des régions, les textes, axe sans violation serious/critical et la ligne de base `toHaveScreenshot` ≤ 1 % à 1440 × 900 et 390 × 844. Les états chargement, vide, erreur et permission refusée sont distincts, accessibles au clavier et annoncés sans dépendre de la seule couleur.

## 11. Critères d'acceptation

- **CA-1** — Pour une activité future du seed, l’API renvoie trois créneaux compatibles triés par date ; choisir le deuxième déplace une seule activité et met l’agenda à jour.
- **CA-2** — Une proposition de décalage, volume ou allègement n’altère aucune ligne avant le clic de confirmation ; le refus laisse le plan identique.
- **CA-3** — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
- **CA-4** — La démonstration suit les jetons et la structure prescrits ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.

## 12. Plan de tests

- **Unitaires** — `packages/services/src/spec-705.test.ts`, `describe('[SPEC-705] règles et calculs')` : pour CA-1 : Pour une activité future du seed, l’API renvoie trois créneaux compatibles triés par date ; choisir le deuxième déplace une seule activité et met l’agenda à jour. ; CA-2 : Une proposition de décalage, volume ou allègement n’altère aucune ligne avant le clic de confirmation ; le refus laisse le plan identique. Tester aussi valeurs limites, entrée vide, ordre déterministe et fuseau si le comportement dépend du temps.
- **Intégration** — `packages/services/test/integration/spec-705.test.ts`, `describe('[SPEC-705] service et API')` : exécuter les mêmes cas sur Supabase local avec `LLM_MODE=mock`, vérifier les lignes et événements réellement écrits, puis 400, 404 RLS, 409 et double envoi (CA-3).
- **End-to-end** — `apps/web/e2e/specs/p7/spec-705.spec.ts`, `test('parcours SPEC-705 @SPEC-705')` : partir du seed SPEC-115, ouvrir SCR-12, effectuer les actions des CA-1 à CA-2, recharger, contrôler le résultat et conserver la vidéo. Tester l’état erreur et lancer axe.
- **Visuel** — `test('conformité SPEC-705 @SPEC-705 @visual')` : jetons, régions, textes, captures desktop/mobile ≤ 1 % et axe (CA-4).
- **Non-régression** — Rejouer les étiquettes `[SPEC-704]` et `@SPEC-704` en plus des suites unitaires/intégration complètes.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-2 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-3 | intégration RLS, invalides et idempotence |
| CA-4 | e2e et `@SPEC-705 @visual` |

## 13. Preuves attendues

`evidence/SPEC-705/` contient les rapports réels `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, au moins une vidéo Playwright, les captures finales et `acceptance.md` avec preuve vérifiable pour CA-1 à CA-4. Conserver la capture de la page de démonstration ou de l’écran sans maquette. Une pièce manquante fait échouer la validation ; aucune preuve n’est fabriquée.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent : lint, typecheck, build, unitaires, intégration, e2e avec vidéo, `@visual`, axe, non-régression et CA cochés avec preuve. Les limites et cas d’échec de cette spécification sont couverts, les contrats API restent documentés, et aucune donnée d’un autre utilisateur n’est rendue.

## 15. Décisions et hypothèses

- **ADR-0029 — Planificateur glouton** : Algorithme glouton déterministe : pour chaque formation active (ordre de date de fin), chaque module, chaque activité (apports par chapitre, lecture du cours, exercice éventuel, quiz de validation, marge 1 h), placer au premier créneau libre compatible (jours d'étude, moments préférés, capacité horaire quotidienne cumulée). Quiz global quotidien 30 min en fin de journée d'étude. Replanification incrémentale à chaque événement (module validé, séance manquée, pause, changement de rythme). Si la date de fin ne tient pas : options BR-FOR-14.
- Aucune décision ouverte : une ambiguïté découverte pendant l’implémentation suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification du périmètre.

