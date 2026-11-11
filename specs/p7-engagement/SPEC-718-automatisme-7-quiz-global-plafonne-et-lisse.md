---
id: SPEC-718
title: "Automatisme 7 : quiz global plafonné et lissé"
phase: P7
priority: V1
depends_on: [SPEC-711, SPEC-406]
business_rules: [BR-AUT-07]
screens: [SCR-10]
adrs: [ADR-0190]
visual: tokens
---

# SPEC-718 — Automatisme 7 : quiz global plafonné et lissé

## 1. Objectif

Application du plafond quotidien et du taux visé, report des notions, message sur l'accueil et le quiz global, annulation (toutes les notions aujourd'hui). Cette spécification livre le contrat, le service, les états d’interface ou de démonstration et les validations nécessaires pour que la capacité soit utilisable et prouvée sans appel à un service réel dans les tests.

## 2. Contexte

Lire `docs/product/vision.md`, `docs/product/business-rules.md`, `docs/product/screens.md`, `docs/architecture/overview.md`, `docs/architecture/data-model.md`, `docs/architecture/api.md`, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. Écran concerné : SCR-10 : `/formations/[fid]/quiz-global`. Les maquettes sont en lecture seule ; le jeu de données SPEC-115 et l’horloge du 11 novembre 2026 permettent des captures reproductibles. Les ADR listés en section 15 priment sur ce texte en cas de conflit.

## 3. Dépendances

- **SPEC-711** — Moteur d'automatismes ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-406** — Tirage de la session de quiz global ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **Architecture transversale** — Les opérations utilisent les contrats Zod de `packages/contracts`, `handler()` de SPEC-201 et le client utilisateur soumis à RLS de SPEC-113. Les dates sont calculées par `@learny/core/time` avec l’horloge injectable ; l’interface réutilise `@learny/ui` et les textes de `apps/web/messages/fr.ts`.
- **Services externes** — Les tests utilisent Supabase local et `LLM_MODE=mock`; tout secret réel reste côté serveur. Si un service tiers est indisponible, exécuter les parties mock, consigner le blocage externe selon `sdd-process.md` §3, sans inventer de résultat.

## 4. Règles métier couvertes

- **BR-AUT-07** — **Quiz global plafonné et lissé** : durée maximale par jour (défaut 15 min ; 10/15/20/30) ; si les notions dues dépassent le plafond, les moins urgentes sont reportées aux jours suivants, lacunes en tête ; taux de mémorisation visé (défaut 90 % ; 85/90/95).

## 5. Exigences fonctionnelles

- **EF-1** — Régler durée maximale quotidienne du quiz global parmi 10/15/20/30 minutes, défaut 15, et rétention visée parmi 85/90/95 %, défaut 90.
- **EF-2** — Quand les notions dues dépassent la durée, placer d’abord les lacunes puis les plus urgentes, reporter les autres aux jours suivants sans les marquer révisées ; afficher le nombre reporté sur accueil et quiz global.
- **EF-3** — « Annuler le lissage » montre toutes les notions dues aujourd’hui dans la session du jour, tout en signalant la durée estimée ; les réponses déjà données restent inchangées.
- **EF-4** — Les règles métier BR-AUT-07 de la section 4 sont obligatoires dans tous les états, y compris les erreurs et la reprise.

## 6. Exigences techniques

- **ET-1** — Les routes API valident entrée/sortie avec Zod et appellent un service soumis à RLS ; un objet d’un autre utilisateur répond 404. Les mutations rejouables portent une clé d’idempotence.
- **ET-2** — Les actions et notifications sont écrites dans une transaction puis émises après commit ; l’horloge injectable et le fuseau IANA du profil déterminent les échéances et les semaines locales.
- **ET-3** — La définition `plafond_quiz` de SPEC-711 (ADR-0190) passe `{maxMinutes,targetRetention}` au tirage pur de SPEC-406 ; le résultat inclut `selected`, `deferred`, `estimatedMinutes` et raison de report.
- **ET-4** — L’action `kind='quiz_smoothed'` porte les IDs des notions reportées, date locale et `undo`; l’annulation reconstruit la session via l’algorithme déterministe, sans écrire un `review_log` artificiel.
- **ET-5** — Changer le plafond affecte la prochaine session non commencée ; une session commencée garde son instantané pour éviter que sa liste change en cours de réponse.

## 7. Comportements attendus et cas limites

- **CL-1** — Identifiant ou donnée hors schéma : 400 `VALIDATION_FAILED`, sans écriture ni événement ; ressource d’un autre propriétaire : 404 sans révéler son existence.
- **CL-2** — Deux demandes concurrentes identiques ne créent qu’un effet ; une version d’objet devenue obsolète renvoie 409 `CONFLICT` et restitue l’état actuel.
- **CL-3** — Aucune notion due : zéro report, pas de bannière.
- **CL-4** — Lacunes seules dépassent le plafond : conserver leur priorité et expliquer le dépassement plutôt que les supprimer silencieusement.
- **CL-5** — Fuseau changé après tirage : session commencée conserve sa date et ses réponses, prochaine session utilise le nouveau jour local.

## 8. Instructions d'implémentation

1. Relire les contrats des dépendances et les règles BR-AUT-07 ; définir les schémas Zod et types DTO dans `packages/contracts/src/automatisme-7-quiz-global-plafonne-et-lisse.ts`. Ajouter les valeurs métier à `packages/config/src/product.ts` uniquement si elles viennent d’une règle ou d’un ADR. Commit `feat(SPEC-718): définit les contrats`.
2. Écrire `packages/automations/src/automatisme-7-quiz-global-plafonne-et-lisse.ts` et ses fonctions pures d’aide ; toute écriture multi-tables est transactionnelle. Utiliser l’horloge injectée et le client RLS. Commit `feat(SPEC-718): implémente la capacité`.
3. Brancher les routes documentées, les événements après commit et les composants ou la page SDD. Réutiliser `@learny/ui` et ajouter les libellés à `apps/web/messages/fr.ts`. Commit `feat(SPEC-718): expose le parcours`.
4. Couvrir chaque EF et CL par les tests section 12 ; utiliser les fixtures du jeu SPEC-115, l’IA mock et l’horloge figée. Créer la référence de non-régression sans toucher aux maquettes. Commit `test(SPEC-718): vérifie le parcours et les limites`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-718`, corriger les erreurs, lier les preuves réelles aux CA dans `evidence/SPEC-718/acceptance.md` puis terminer avec `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/automatisme-7-quiz-global-plafonne-et-lisse.ts`, `packages/automations/src/automatisme-7-quiz-global-plafonne-et-lisse.ts`, `packages/automations/src/automatisme-7-quiz-global-plafonne-et-lisse.test.ts`, `packages/services/test/integration/automatisme-7-quiz-global-plafonne-et-lisse.test.ts`, `apps/web/e2e/specs/p7/spec-718.spec.ts`.
- **Modifiés** : `apps/web/messages/fr.ts`, exports des paquets, routes `apps/web/app/api/v1/**` correspondant à ET-6, composants de l’écran SCR-10, catalogue d’événements si la capacité en émet.
- **Lus / réutilisés** : `specs/p7-engagement/SPEC-711-moteur-d-automatismes.md`, `specs/p4-moteur/SPEC-406-tirage-de-la-session-de-quiz-global.md`.

## 10. Interface et conformité visuelle

SCR-10 : encadré « Réglé par le tuteur » avec durée, notions reportées et action d’annulation ; accueil montre un message cohérent. `data-testid` : `review-cap`, `review-deferred`, `review-smoothing-undo`.

- **Contrôles** — vérifier les jetons, l’ordre des régions, les textes, axe sans violation serious/critical et la ligne de base `toHaveScreenshot` ≤ 1 % à 1440 × 900 et 390 × 844. Les états chargement, vide, erreur et permission refusée sont distincts, accessibles au clavier et annoncés sans dépendre de la seule couleur.

## 11. Critères d'acceptation

- **CA-1** — Par défaut le plafond est 15 minutes et la cible 90 % ; seuls les six choix autorisés sont acceptés.
- **CA-2** — Une session de test au delà du plafond garde les lacunes en tête, reporte les autres sans créer de review log ; Annuler les réintroduit une fois.
- **CA-3** — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
- **CA-4** — La démonstration suit les jetons et la structure prescrits ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.

## 12. Plan de tests

- **Unitaires** — `packages/services/src/spec-718.test.ts`, `describe('[SPEC-718] règles et calculs')` : pour CA-1 : Par défaut le plafond est 15 minutes et la cible 90 % ; seuls les six choix autorisés sont acceptés. ; CA-2 : Une session de test au delà du plafond garde les lacunes en tête, reporte les autres sans créer de review log ; Annuler les réintroduit une fois. Tester aussi valeurs limites, entrée vide, ordre déterministe et fuseau si le comportement dépend du temps.
- **Intégration** — `packages/services/test/integration/spec-718.test.ts`, `describe('[SPEC-718] service et API')` : exécuter les mêmes cas sur Supabase local avec `LLM_MODE=mock`, vérifier les lignes et événements réellement écrits, puis 400, 404 RLS, 409 et double envoi (CA-3).
- **End-to-end** — `apps/web/e2e/specs/p7/spec-718.spec.ts`, `test('parcours SPEC-718 @SPEC-718')` : partir du seed SPEC-115, ouvrir SCR-10, effectuer les actions des CA-1 à CA-2, recharger, contrôler le résultat et conserver la vidéo. Tester l’état erreur et lancer axe.
- **Visuel** — `test('conformité SPEC-718 @SPEC-718 @visual')` : jetons, régions, textes, captures desktop/mobile ≤ 1 % et axe (CA-4).
- **Non-régression** — Rejouer les étiquettes `[SPEC-711]` et `@SPEC-711`, `[SPEC-406]` et `@SPEC-406` en plus des suites unitaires/intégration complètes.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-2 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-3 | intégration RLS, invalides et idempotence |
| CA-4 | e2e et `@SPEC-718 @visual` |

## 13. Preuves attendues

`evidence/SPEC-718/` contient les rapports réels `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, au moins une vidéo Playwright, les captures finales et `acceptance.md` avec preuve vérifiable pour CA-1 à CA-4. Conserver la capture de la page de démonstration ou de l’écran sans maquette. Une pièce manquante fait échouer la validation ; aucune preuve n’est fabriquée.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent : lint, typecheck, build, unitaires, intégration, e2e avec vidéo, `@visual`, axe, non-régression et CA cochés avec preuve. Les limites et cas d’échec de cette spécification sont couverts, les contrats API restent documentés, et aucune donnée d’un autre utilisateur n’est rendue.

## 15. Décisions et hypothèses

- ADR-0190 fixe le contrat et l’idempotence de l’automatisme `plafond_quiz`; le catalogue doit ajouter cette référence pour SPEC-718.
- Aucune décision ouverte : une ambiguïté découverte pendant l’implémentation suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification du périmètre.

