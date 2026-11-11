---
id: SPEC-721
title: "Automatisme 10 : mode pause et retour"
phase: P7
priority: V1
depends_on: [SPEC-711, SPEC-407, SPEC-409]
business_rules: [BR-AUT-10]
screens: [SCR-15]
adrs: [ADR-0016, ADR-0190]
visual: mockup
---

# SPEC-721 — Automatisme 10 : mode pause et retour

## 1. Objectif

Déclaration de pause (date de fin, diagnostic), gel du planning et de la série, reprise anticipée, diagnostic de 10 min au retour, replanification, accès depuis Mon compte et Paramètres. Cette spécification livre le contrat, le service, les états d’interface ou de démonstration et les validations nécessaires pour que la capacité soit utilisable et prouvée sans appel à un service réel dans les tests.

## 2. Contexte

Lire `docs/product/vision.md`, `docs/product/business-rules.md`, `docs/product/screens.md`, `docs/architecture/overview.md`, `docs/architecture/data-model.md`, `docs/architecture/api.md`, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. Écran concerné : SCR-15 : route du catalogue. Les maquettes sont en lecture seule ; le jeu de données SPEC-115 et l’horloge du 11 novembre 2026 permettent des captures reproductibles. Les ADR listés en section 15 priment sur ce texte en cas de conflit.

## 3. Dépendances

- **SPEC-711** — Moteur d'automatismes ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-407** — Planificateur ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-409** — Série et jalons ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **Architecture transversale** — Les opérations utilisent les contrats Zod de `packages/contracts`, `handler()` de SPEC-201 et le client utilisateur soumis à RLS de SPEC-113. Les dates sont calculées par `@learny/core/time` avec l’horloge injectable ; l’interface réutilise `@learny/ui` et les textes de `apps/web/messages/fr.ts`.
- **Services externes** — Les tests utilisent Supabase local et `LLM_MODE=mock`; tout secret réel reste côté serveur. Si un service tiers est indisponible, exécuter les parties mock, consigner le blocage externe selon `sdd-process.md` §3, sans inventer de résultat.

## 4. Règles métier couvertes

- **BR-AUT-10** — **Mode pause et retour** : l'apprenant déclare une pause jusqu'à une date ; le planning est gelé et la série n'est pas interrompue ; au retour, si activé (défaut), un diagnostic de 10 min sur les notions à risque précède la replanification.

## 5. Exigences fonctionnelles

- **EF-1** — L’apprenant déclare une pause jusqu’à une date locale depuis Mon compte ou Paramètres ; la formation est mise en pause, les créneaux futurs gelés et la série considère les jours de pause neutres.
- **EF-2** — Au retour prévu ou anticipé, si le diagnostic est activé par défaut, proposer une séance de 10 minutes sur les notions à risque avant replanification ; le résultat influence les priorités, pas les notes historiques.
- **EF-3** — Le journal explique début, fin et reprise de la pause ; l’apprenant peut annuler une pause future ou reprendre plus tôt, sans dupliquer le diagnostic.
- **EF-4** — Les règles métier BR-AUT-10 de la section 4 sont obligatoires dans tous les états, y compris les erreurs et la reprise.

## 6. Exigences techniques

- **ET-1** — Les routes API valident entrée/sortie avec Zod et appellent un service soumis à RLS ; un objet d’un autre utilisateur répond 404. Les mutations rejouables portent une clé d’idempotence.
- **ET-2** — Les actions et notifications sont écrites dans une transaction puis émises après commit ; l’horloge injectable et le fuseau IANA du profil déterminent les échéances et les semaines locales.
- **ET-3** — Définition `pause` de SPEC-711 (ADR-0190), actions `kind='pause_started'|'pause_ended'`, avec paramètres `endDate` et `diagnosticEnabled=true`; date validée dans le fuseau du profil. `apply` délègue pause/reprise à SPEC-618 et planification à SPEC-407.
- **ET-4** — Le diagnostic utilise le tirage déterministe SPEC-406 en mode `diagnostic` limité à 10 min et écrit les résultats via SPEC-411 ; seul un résultat réel déclenche la replanification.
- **ET-5** — Événement de fin de pause idempotent par formation+date ; les jours neutres sont passés au calcul de série SPEC-409.

## 7. Comportements attendus et cas limites

- **CL-1** — Identifiant ou donnée hors schéma : 400 `VALIDATION_FAILED`, sans écriture ni événement ; ressource d’un autre propriétaire : 404 sans révéler son existence.
- **CL-2** — Deux demandes concurrentes identiques ne créent qu’un effet ; une version d’objet devenue obsolète renvoie 409 `CONFLICT` et restitue l’état actuel.
- **CL-3** — Date de fin antérieure au jour local : refus 422, planning inchangé.
- **CL-4** — Reprise anticipée pendant diagnostic en cours : ne pas lancer un second diagnostic.
- **CL-5** — Diagnostic désactivé : reprendre et replanifier immédiatement, sans séance fictive.

## 8. Instructions d'implémentation

1. Relire les contrats des dépendances et les règles BR-AUT-10 ; définir les schémas Zod et types DTO dans `packages/contracts/src/automatisme-10-mode-pause-et-retour.ts`. Ajouter les valeurs métier à `packages/config/src/product.ts` uniquement si elles viennent d’une règle ou d’un ADR. Commit `feat(SPEC-721): définit les contrats`.
2. Écrire `packages/automations/src/automatisme-10-mode-pause-et-retour.ts` et ses fonctions pures d’aide ; toute écriture multi-tables est transactionnelle. Utiliser l’horloge injectée et le client RLS. Commit `feat(SPEC-721): implémente la capacité`.
3. Brancher les routes documentées, les événements après commit et les composants ou la page SDD. Réutiliser `@learny/ui` et ajouter les libellés à `apps/web/messages/fr.ts`. Commit `feat(SPEC-721): expose le parcours`.
4. Couvrir chaque EF et CL par les tests section 12 ; utiliser les fixtures du jeu SPEC-115, l’IA mock et l’horloge figée. Créer la référence de non-régression sans toucher aux maquettes. Commit `test(SPEC-721): vérifie le parcours et les limites`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-721`, corriger les erreurs, lier les preuves réelles aux CA dans `evidence/SPEC-721/acceptance.md` puis terminer avec `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/automatisme-10-mode-pause-et-retour.ts`, `packages/automations/src/automatisme-10-mode-pause-et-retour.ts`, `packages/automations/src/automatisme-10-mode-pause-et-retour.test.ts`, `packages/services/test/integration/automatisme-10-mode-pause-et-retour.test.ts`, `apps/web/e2e/specs/p7/spec-721.spec.ts`.
- **Modifiés** : `apps/web/messages/fr.ts`, exports des paquets, routes `apps/web/app/api/v1/**` correspondant à ET-6, composants de l’écran SCR-15, catalogue d’événements si la capacité en émet.
- **Lus / réutilisés** : `specs/p7-engagement/SPEC-711-moteur-d-automatismes.md`, `specs/p4-moteur/SPEC-407-planificateur.md`, `specs/p4-moteur/SPEC-409-serie-et-jalons.md`.

## 10. Interface et conformité visuelle

`Parametres.dc.html` : carte Mode pause avec date de fin, interrupteur diagnostic et état de reprise ; menu Mon compte offre la même entrée. `data-testid` : `pause-mode`, `pause-end-date`, `pause-diagnostic`, `pause-resume`.

- **Contrôles** — Utiliser la référence du SCR-15 dans `design/references/` et mesurer ≤ 12 % de pixels différents ; vérifier les jetons, l’ordre des régions, les textes, axe sans violation serious/critical et la ligne de base `toHaveScreenshot` ≤ 1 % à 1440 × 900 et 390 × 844. Les états chargement, vide, erreur et permission refusée sont distincts, accessibles au clavier et annoncés sans dépendre de la seule couleur.

## 11. Critères d'acceptation

- **CA-1** — Déclarer une pause de trois jours retire les créneaux futurs et laisse la série inchangée pendant ces jours neutres.
- **CA-2** — Au retour, un diagnostic de 10 minutes est proposé une fois par défaut ; le désactiver reprend directement le planning.
- **CA-3** — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
- **CA-4** — L’écran respecte la maquette avec un écart ≤ 12 % ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.

## 12. Plan de tests

- **Unitaires** — `packages/services/src/spec-721.test.ts`, `describe('[SPEC-721] règles et calculs')` : pour CA-1 : Déclarer une pause de trois jours retire les créneaux futurs et laisse la série inchangée pendant ces jours neutres. ; CA-2 : Au retour, un diagnostic de 10 minutes est proposé une fois par défaut ; le désactiver reprend directement le planning. Tester aussi valeurs limites, entrée vide, ordre déterministe et fuseau si le comportement dépend du temps.
- **Intégration** — `packages/services/test/integration/spec-721.test.ts`, `describe('[SPEC-721] service et API')` : exécuter les mêmes cas sur Supabase local avec `LLM_MODE=mock`, vérifier les lignes et événements réellement écrits, puis 400, 404 RLS, 409 et double envoi (CA-3).
- **End-to-end** — `apps/web/e2e/specs/p7/spec-721.spec.ts`, `test('parcours SPEC-721 @SPEC-721')` : partir du seed SPEC-115, ouvrir SCR-15, effectuer les actions des CA-1 à CA-2, recharger, contrôler le résultat et conserver la vidéo. Tester l’état erreur et lancer axe.
- **Visuel** — `test('conformité SPEC-721 @SPEC-721 @visual')` : jetons, régions, textes, comparaison de référence ≤ 12 %, captures desktop/mobile ≤ 1 % et axe (CA-4).
- **Non-régression** — Rejouer les étiquettes `[SPEC-711]` et `@SPEC-711`, `[SPEC-407]` et `@SPEC-407`, `[SPEC-409]` et `@SPEC-409` en plus des suites unitaires/intégration complètes.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-2 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-3 | intégration RLS, invalides et idempotence |
| CA-4 | e2e et `@SPEC-721 @visual` |

## 13. Preuves attendues

`evidence/SPEC-721/` contient les rapports réels `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, au moins une vidéo Playwright, les captures finales et `acceptance.md` avec preuve vérifiable pour CA-1 à CA-4. Conserver la comparaison côte à côte et le diff avec la référence de maquette. Une pièce manquante fait échouer la validation ; aucune preuve n’est fabriquée.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent : lint, typecheck, build, unitaires, intégration, e2e avec vidéo, `@visual`, axe, non-régression et CA cochés avec preuve. Les limites et cas d’échec de cette spécification sont couverts, les contrats API restent documentés, et aucune donnée d’un autre utilisateur n’est rendue.

## 15. Décisions et hypothèses

- **ADR-0016 — Pause d'une formation et limite de trois** : Mettre en pause une formation annule ses créneaux futurs (statut `cancelled`) et suspend ses automatismes ; la reprendre relance le planificateur depuis la date de reprise. La pause globale (automatisme 10) est distincte : elle gèle toutes les formations.
- Aucune décision ouverte : une ambiguïté découverte pendant l’implémentation suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification du périmètre.

