---
id: SPEC-115
title: Jeu de données de démonstration et fabriques
phase: P1
priority: V1
depends_on: [SPEC-113]
business_rules: []
screens: []
adrs: [ADR-0071, ADR-0047]
visual: demo
---

# SPEC-115 — Jeu de données de démonstration et fabriques

## 1. Objectif

Créer une seed idempotente qui reproduit les données visibles des maquettes au 11 novembre 2026 à 13:20 à Paris et des fabriques de test pour chaque domaine du schéma P1. Les écrans et comparaisons visuelles doivent pouvoir s'appuyer sur les mêmes identifiants et états à chaque exécution.

## 2. Contexte

ADR-0071 demande de reproduire exactement personne, formations, modules, notions, lacunes, agenda, notifications et automatismes des maquettes ; ADR-0047 fixe l'instant. `docs/product/screens.md` §4 et `design/maquettes/index.html` donnent le contexte, les quatorze fichiers `*.dc.html` les textes et nombres. Lire `docs/engineering/testing.md` §3–§6, `docs/architecture/data-model.md` §1–§12, SPEC-101 (`db:reset`), SPEC-113 (RLS) et les spécifications d'écrans déjà rédigées (SPEC-603, 704, 701, 707). Les maquettes sont en lecture seule ; la seed ne modifie pas leurs sources.

## 3. Dépendances

- **SPEC-113** : toutes les tables P1, politiques RLS et harnais à comptes multiples.
- **SPEC-101/008** : migrations appliquées et commande `pnpm db:seed:demo` prévue par la pile locale.
- **SPEC-005** : manifeste des captures de référence, utilisé pour vérifier les données affichées ; si les références ne sont pas encore générées, la seed reste testable par assertions de données.
- Les identifiants de démonstration sont des UUID déterministes dans un espace réservé, jamais les identifiants d'un compte réel.

## 4. Règles métier couvertes

Aucune règle `BR-*` produit. La seed illustre les règles de formation, révision, groupe, agenda et notifications sans créer de nouvelle valeur normative. Les données nécessaires aux tests ne sont pas des preuves d'un comportement implémenté.

## 5. Exigences fonctionnelles

- **EF-1** — Le compte de démonstration Alex Perrin possède la formation courante « SAP S/4HANA Finance » (7 modules, 48 notions), « Gestion de projet agile » en groupe avec Camille et Hugo, et « Python pour l'analyse de données » à l'étape de validation du programme ; deux formations terminées figurent dans l'onglet dédié. Les titres, statuts, sigles, dates et chiffres repris des maquettes sont consignés dans une fixture versionnée.
- **EF-2** — La formation SAP contient les modules, chapitres, notions, liens, cours et activités nécessaires aux écrans Programme, Module, Cours, Quiz, Quiz global, Exercice, Examen blanc, Carte et Lacunes. Les lacunes, scores, sessions et notions dues sont cohérents entre tableaux, badges et parcours.
- **EF-3** — L'agenda possède les créneaux du 9 au 13 novembre 2026 avec statuts visibles, marges et événements du jour ; notifications, actions d'automatismes et journal reproduisent les libellés et dates des maquettes. Une même action ne crée pas deux lignes lors d'un second `db:seed:demo`.
- **EF-4** — Les données de Camille et Hugo partagent le programme du groupe, mais leurs apports, cours, banques, tentatives, lacunes, agenda et conversations sont différents et privés ; la seed permet de tester réellement BR-GRP-03 et BR-APP-03.
- **EF-5** — `pnpm db:seed:demo` est idempotente : deux exécutions donnent le même nombre de lignes par table, les mêmes identifiants/valeurs et aucun doublon d'activité, notification ou membre. La commande refuse la production et une base dont l'hôte n'est pas local/test.
- **EF-6** — `@learny/testing` exporte des fabriques `user`, `formation`, `module`, `notion`, `resource`, `course`, `brick`, `attempt`, `notionState`, `scheduleSlot`, `notification` et `group`. Chaque fabrique accepte des overrides contrôlés, produit une ligne valide et retourne les IDs créés.
- **EF-7** — Les tests e2e utilisent des identifiants/fonctions de connexion de démonstration fournis par le harnais, jamais un mot de passe inscrit en dur dans le dépôt. La seed est activée uniquement en local/test, à l'horloge fixe ADR-0047.
- **EF-8** — La page `/_dev/sdd/SPEC-115` affiche les comptes fictifs, nombres de formations/modules/notions, dates de l'agenda et un tableau de cohérence des captures, calculés depuis la base et non codés comme succès.

## 6. Exigences techniques

- **ET-1** — `packages/db/src/seed/demo.ts` exécute les insertions dans l'ordre des FK, en transactions et avec `on conflict do update` ciblé sur les identifiants fixes. Des UUID v5 dérivés d'un namespace `learny-demo` stabilisent les clés sans collisions avec les fabriques aléatoires.
- **ET-2** — `packages/db/src/seed/demo-fixtures.ts` contient la source structurée des valeurs visibles ; un champ `source` associe chaque valeur critique à `SCR-xx` et au fichier de maquette, afin qu'une correction de fixture puisse être revue. Ne pas copier du HTML dans la base.
- **ET-3** — Les dates sont des instants UTC correspondant aux heures locales de la maquette ; la seed prend `CLOCK_FIXED_AT=2026-11-11T12:20:00Z` pour les états relatifs et ne lit pas l'heure réelle.
- **ET-4** — La seed ne contourne RLS que via `serviceDb()` dans cette commande de test explicite ; les écrans et tests de lecture emploient `userDb`. Aucune route publique ne permet de déclencher la seed.
- **ET-5** — Les fabriques vivent dans `packages/testing/src/factories/`, utilisent `withRollback` ou suffixes uniques, contrôlent les FK et n'acceptent pas un `owner_id` incohérent avec la formation.
- **ET-6** — La commande produit un résumé par table et contrôle automatiquement 7 modules/48 notions, trois formations en cours ou proposées, deux terminées, trois membres de groupe et les dates d'agenda prescrites.
- **ET-7** — Aucun e-mail, clé, URL de paiement ou fichier réel n'est inventé ; les adresses de test portent un domaine réservé et le mot témoin `learny-test-only` si elles ressemblent à un secret.

## 7. Comportements attendus et cas limites

- **CL-1** — Seed relancée : nombres et empreintes de fixtures identiques.
- **CL-2** — Une table requise ou migration manque : transaction annulée, message nommant la dépendance ; pas de demi-seed.
- **CL-3** — Base de production/preview : commande refusée avant toute connexion en écriture.
- **CL-4** — Une maquette change sans mise à jour de fixture (interdit de la modifier ici) : test de correspondance échoue, sans réécrire la référence.
- **CL-5** — Différence de fuseau : contrôle compare l'heure locale affichée à 13:20, pas seulement la date UTC.
- **CL-6** — Membre de groupe lit l'apport d'Alex : refus RLS malgré programme commun.
- **CL-7** — Fabrique avec UUID déjà utilisé par une autre entité : erreur explicite ou suffixe contrôlé, aucune écriture écrasée.
- **CL-8** — Secrets externes absents : seed fonctionne en `LLM_MODE=mock` et transport mémoire.

## 8. Instructions d'implémentation

1. Relever les valeurs de chaque maquette dans une fixture structurée avec `source` ; créer une matrice SCR → tables/valeurs, sans éditer les maquettes. Commit `docs(SPEC-115): inventorie les données des maquettes`.
2. Écrire la seed transactionnelle et la commande locale, comptes de test et UUID stables ; exécuter deux fois et comparer les empreintes. Commit `feat(SPEC-115): charge le jeu de démonstration`.
3. Écrire les fabriques P1 dans `@learny/testing` et les tests de contraintes/RLS. Commit `test(SPEC-115): ajoute les fabriques et vérifie l'idempotence`.
4. Ajouter la page SDD et les tests e2e/visuels avec horloge fixe ; valider la spécification et renseigner les preuves.

## 9. Fichiers et composants concernés

- **Créés** : `packages/db/src/seed/demo.ts`, `packages/db/src/seed/demo-fixtures.ts`, `packages/db/src/seed/demo.test.ts`, `packages/testing/src/factories/{user,formation,module,notion,resource,course,brick,attempt,notion-state,schedule-slot,notification,group}.ts`, `packages/testing/test/integration/demo-seed.test.ts`, `apps/web/components/sdd-demos/spec-115.tsx`, `apps/web/e2e/specs/p1/spec-115.spec.ts`.
- **Modifiés** : `packages/testing/src/index.ts`, `package.json` (commande `db:seed:demo`), registre SDD et `apps/web/messages/fr.ts`.
- **Lus uniquement** : `design/maquettes/*.dc.html`, `design/references/manifest.json`, `docs/product/screens.md`.

## 10. Interface et conformité visuelle

Mode `demo` : `/_dev/sdd/SPEC-115` montre « Données de démonstration », carte Alex Perrin, trois formations en cours/proposées et deux terminées, « SAP : 7 modules · 48 notions », « Groupe : 3 membres », puis calendrier du 9 au 13 novembre. `data-testid` : `spec-115-profile`, `spec-115-formations`, `spec-115-sap`, `spec-115-group`, `spec-115-agenda`. La page utilise les vraies lignes seedées ; « Seed absente » remplace tout compteur indisponible. Contrôles jetons, structure, axe et captures desktop/mobile ≤ 1 %, à la date fixe.

## 11. Critères d'acceptation

- **CA-1** — La seed crée Alex, les cinq formations décrites, SAP à 7 modules/48 notions, le groupe de trois membres et l'agenda 9–13 novembre avec valeurs concordant aux maquettes.
- **CA-2** — Deux exécutions de `db:seed:demo` gardent le même nombre/ID/empreinte de lignes ; une base distante est refusée.
- **CA-3** — Les fabriques produisent des objets valides et isolés ; un membre ne voit pas les données personnelles d'un autre.
- **CA-4** — Les textes/dates/nombres d'au moins les écrans Accueil, Programme, Agenda et Paramètres correspondent aux fixtures et à la date ADR-0047.
- **CA-5** — La page SDD affiche les nombres réels, passe axe, vidéo et captures desktop/mobile.

## 12. Plan de tests

- **Unitaires** — `packages/db/src/seed/demo.test.ts`, `describe('[SPEC-115] demo fixtures')` : UUID, comptes, 7/48, dates, sources SCR et refus d'environnement distant (CA-1, CA-2).
- **Intégration** — `packages/testing/test/integration/demo-seed.test.ts`, `describe('[SPEC-115] demo seed')` : base remise à zéro, deux seed successives et empreintes, fabriques, RLS A/Camille/Hugo (CA-1 à CA-3).
- **End-to-end** — `apps/web/e2e/specs/p1/spec-115.spec.ts`, `test('inspecte les données de démonstration @SPEC-115')` : ouvrir la page, contrôler compteurs ; parcourir Accueil/Programme/Agenda/Paramètres quand ces pages existent, garder la vidéo (CA-4, CA-5).
- **Visuel** — `test('données de démonstration conformes @SPEC-115 @visual')` : jetons, structure, axe, captures desktop/mobile ≤ 1 % (CA-5).
- **Non-régression** — `[SPEC-113]`, migrations P1 et tests visuels des écrans déjà livrés.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; intégration seed |
| CA-2 | unitaires garde ; intégration répétition |
| CA-3 | intégration fabriques/RLS |
| CA-4 | e2e des écrans disponibles |
| CA-5 | e2e et `@visual` |

## 13. Preuves attendues

`evidence/SPEC-115/` contient résumé par table des deux passages, empreintes/identifiants de fixtures, rapports RLS, vidéos/captures et `acceptance.md`. Les correspondances aux maquettes citent le fichier et l'élément observé, sans prétendre qu'un écran non implémenté a été validé.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent ; seed déterministe et idempotente, garde de base distante actif, données personnelles isolées et valeurs vérifiées contre les maquettes. Les comparaisons complètes des écrans futurs se font dans leurs propres spécifications.

## 15. Décisions et hypothèses

ADR-0071 fixe la fidélité au jeu de maquettes, ADR-0047 la date. Les valeurs absentes des maquettes ne sont pas inventées comme références visuelles ; elles sont des fixtures minimales de fonctionnement, explicitement séparées des valeurs observées.
