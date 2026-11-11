---
id: SPEC-618
title: "Gestion des formations : changer, pause, limite de trois"
phase: P6
priority: V1
depends_on: [SPEC-603, SPEC-407]
business_rules: [BR-FOR-10, BR-FOR-11, BR-FOR-15]
screens: [SCR-03]
adrs: [ADR-0016, ADR-0075]
visual: tokens
---

# SPEC-618 — Gestion des formations : changer, pause, limite de trois

## 1. Objectif

Sélecteur Changer de formation, formation courante, mise en pause/reprise/archivage d'une formation (gel et replanification), dialogue de limite de trois formations actives (choix de la formation à mettre en pause). Cette spécification livre le contrat, le service, les états d’interface ou de démonstration et les validations nécessaires pour que la capacité soit utilisable et prouvée sans appel à un service réel dans les tests.

## 2. Contexte

Lire `docs/product/vision.md`, `docs/product/business-rules.md`, `docs/product/screens.md`, `docs/architecture/overview.md`, `docs/architecture/data-model.md`, `docs/architecture/api.md`, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. Écran concerné : SCR-03 : `/accueil` (`/` redirige). Les maquettes sont en lecture seule ; le jeu de données SPEC-115 et l’horloge du 11 novembre 2026 permettent des captures reproductibles. Les ADR listés en section 15 priment sur ce texte en cas de conflit.

## 3. Dépendances

- **SPEC-603** — Accueil ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-407** — Planificateur ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **Architecture transversale** — Les services applicatifs utilisent les contrats Zod de `packages/contracts`, `handler()` de SPEC-201, le client utilisateur soumis à RLS de SPEC-113 et les événements de SPEC-203. Les composants interactifs réutilisent `@learny/ui` et les textes passent par `apps/web/messages/fr.ts`.
- **Services externes** — Les tests utilisent Supabase local et `LLM_MODE=mock`; tout secret réel reste côté serveur. Si un service tiers est indisponible, exécuter les parties mock, consigner le blocage externe selon `sdd-process.md` §3, sans inventer de résultat.

## 4. Règles métier couvertes

- **BR-FOR-10** — **Trois formations actives au plus** par utilisateur. Créer ou reprendre une 4e exige de mettre en pause une formation active (choix proposé dans un dialogue).
- **BR-FOR-11** — La « formation en cours » (affichée dans le menu) est la dernière formation active consultée ; « Changer de formation » ouvre la liste des formations actives et en pause.
- **BR-FOR-15** — Mettre une formation en pause gèle son planning (ses créneaux futurs sont retirés) ; la reprendre la replanifie à partir du jour de reprise.

## 5. Exigences fonctionnelles

- **EF-1** — « Changer de formation » liste actives et en pause ; la formation courante est la dernière active consultée et persiste après reconnexion.
- **EF-2** — Mettre en pause gèle les créneaux futurs de cette formation sans effacer les résultats ; reprendre replanifie à partir du jour local de reprise. Archiver retire la formation de la liste active mais conserve son historique accessible.
- **EF-3** — Une quatrième formation active ou une reprise qui dépasserait trois ouvre un dialogue de choix d’une formation à mettre en pause ; aucune transition n’est appliquée avant confirmation explicite.
- **EF-4** — Les règles métier BR-FOR-10, BR-FOR-11, BR-FOR-15 de la section 4 sont obligatoires dans tous les états, y compris les erreurs et la reprise.

## 6. Exigences techniques

- **ET-1** — Chaque lecture et mutation utilise le client de l’utilisateur soumis à RLS ; un autre utilisateur reçoit 404. Les entrées/sorties passent par les schémas Zod de `packages/contracts`, et les routes renvoient `application/problem+json` en erreur.
- **ET-2** — Les écritures multi-tables sont transactionnelles ; un événement est émis après commit et une clé d’idempotence empêche une double transition. Les dates passent par l’horloge injectable et le fuseau IANA du profil.
- **ET-3** — Le service de transition utilise un verrou transactionnel par utilisateur pour compter les formations actives et empêcher deux créations/reprises concurrentes de dépasser trois.
- **ET-4** — `POST /formations/:fid/pause|resume|archive` et `PATCH /me/current-formation` vérifient propriétaire et statuts ; les événements `formation/paused|resumed` sont émis après commit et déclenchent SPEC-407.
- **ET-5** — Le sélecteur conserve l’ID courant en profil, pas seulement `localStorage`; le menu de SPEC-304 reflète le changement dès la navigation suivante.

## 7. Comportements attendus et cas limites

- **CL-1** — Identifiant ou donnée hors schéma : 400 `VALIDATION_FAILED`, sans écriture ni événement ; ressource d’un autre propriétaire : 404 sans révéler son existence.
- **CL-2** — Deux demandes concurrentes identiques ne créent qu’un effet ; une version d’objet devenue obsolète renvoie 409 `CONFLICT` et restitue l’état actuel.
- **CL-3** — Deux reprises simultanées à partir de deux onglets pour passer de deux à quatre actives : une seule réussit, l’autre reçoit le dialogue de limite.
- **CL-4** — Formation mise en pause pendant une activité en cours : l’activité commencée reste consultable ; seuls les créneaux futurs sont gelés.
- **CL-5** — Formation courante archivée : choisir la dernière active consultée restante, sinon l’état sans formation.

## 8. Instructions d'implémentation

1. Définir transitions de statut et `assertActiveLimit` transactionnel avec verrou utilisateur. Commit `feat(SPEC-618): définit les contrats`.
2. Implémenter dernière formation consultée, pause, reprise et archivage avec gel/replanification des seuls créneaux futurs. Commit `feat(SPEC-618): implémente les services`.
3. Brancher sélecteur de coquille et dialogue de quatrième formation avec choix de pause explicite. Commit `feat(SPEC-618): construit le parcours`.
4. Tester deux reprises concurrentes, formation courante archivée et conservation des tentatives passées. Commit `test(SPEC-618): vérifie les cas`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-618`, renseigner les preuves réellement produites puis `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/formation-management.ts`, `packages/services/src/formations/{switch-current,pause,resume,archive,active-limit}.ts`, `packages/services/test/integration/formation-management.test.ts`, `apps/web/components/shell/FormationSwitcher.tsx`, `apps/web/components/formations/ActiveLimitDialog.tsx`, `apps/web/e2e/specs/p6/formation-management.spec.ts`.
- **Modifiés** : `apps/web/app/(app)/accueil/page.tsx`, `packages/services/src/planning/index.ts`, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `specs/p6-parcours/SPEC-603-accueil.md`, `specs/p4-moteur/SPEC-407-planificateur.md`.

## 10. Interface et conformité visuelle

Sélecteur de la coquille et dialogue de limite sur SCR-03 : liste séparant actives/en pause, état sélectionné, actions pause/reprise/archive, trois cartes de choix en cas de limite. `data-testid` : `formation-switcher`, `formation-pause`, `active-limit-dialog`.

- **Contrôles** — vérifier les jetons, l’ordre des régions, les textes, axe sans violation serious/critical et la ligne de base `toHaveScreenshot` ≤ 1 % à 1440 × 900 et 390 × 844. Les états chargement, vide, erreur et permission refusée sont distincts, accessibles au clavier et annoncés sans dépendre de la seule couleur.

## 11. Critères d'acceptation

- **CA-1** — Après consultation de B puis reconnexion, B est la formation courante dans le menu.
- **CA-2** — Une formation en pause n’a plus de créneau futur ; la reprise en crée à partir du jour local sans modifier les tentatives passées.
- **CA-3** — Deux demandes concurrentes ne portent jamais le nombre de formations actives au delà de trois.
- **CA-4** — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
- **CA-5** — La démonstration suit les jetons et la structure prescrits ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.

## 12. Plan de tests

**Unitaires** (1 fichiers, `[SPEC-618]`) :
- `packages/services/src/formations/active-limit.test.ts` — `[SPEC-618]` : 0, 1, 3 et 4 actives ; pause avant reprise ; transition invalide.

**Intégration** (Supabase local, `LLM_MODE=mock`, `[SPEC-618]`) :
- `packages/services/test/integration/formation-management.test.ts` — `[SPEC-618]` : sélection persistée, gel des créneaux, reprise locale, archive, deux reprises concurrentes → au plus trois actives, 404 RLS.

**End-to-end** (`apps/web/e2e/specs/p6/formation-management.spec.ts`, vidéo) :
- **Scénario** — `change et met en pause une formation @SPEC-618` : choisir B, recharger, retrouver B, mettre A en pause puis reprendre et voir agenda recalculé.
- **Scénario** — `limite de trois formations @SPEC-618` : tenter une quatrième, choisir une formation à mettre en pause, confirmer et vérifier trois actives.

**Visuel** — `test('conformité SPEC-618 @SPEC-618 @visual')` : SCR-03 menu et dialogue : liste actives/en pause, état sélectionné, trois cartes de choix, bouton confirmer ; comparaison maquette ≤ 12 %, axe, capture ≤ 1 %.

**Non-régression** — Rejouer `[SPEC-603]` et `@SPEC-603`, `[SPEC-407]` et `@SPEC-407` et les suites complètes unitaires/intégration.

| Critère | Tests |
|---|---|
| CA-1 | unitaires et intégration ciblés ; e2e `@SPEC-618` |
| CA-2 | unitaires et intégration ciblés ; e2e `@SPEC-618` |
| CA-3 | unitaires et intégration ciblés ; e2e `@SPEC-618` |
| CA-4 | intégration RLS/idempotence, e2e erreur |
| CA-5 | `@SPEC-618 @visual`, axe, vidéo |

## 13. Preuves attendues

`evidence/SPEC-618/` contient les rapports réels `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, au moins une vidéo Playwright, les captures finales et `acceptance.md` avec preuve vérifiable pour CA-1 à CA-5. Conserver la capture de la page de démonstration ou de l’écran sans maquette. Une pièce manquante fait échouer la validation ; aucune preuve n’est fabriquée.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent : lint, typecheck, build, unitaires, intégration, e2e avec vidéo, `@visual`, axe, non-régression et CA cochés avec preuve. Les limites et cas d’échec de cette spécification sont couverts, les contrats API restent documentés, et aucune donnée d’un autre utilisateur n’est rendue.

## 15. Décisions et hypothèses

- **ADR-0016 — Pause d'une formation et limite de trois** : Mettre en pause une formation annule ses créneaux futurs (statut `cancelled`) et suspend ses automatismes ; la reprendre relance le planificateur depuis la date de reprise. La pause globale (automatisme 10) est distincte : elle gèle toutes les formations.
- **ADR-0075 — Changer de formation et formation courante** : `profiles.current_formation_id` est mis à jour à chaque ouverture d'une page d'une formation active ou en pause ; si null, la première formation active par `last_opened_at` ; si aucune, la section « Formation en cours » propose « Créer une formation ».
- Aucune décision ouverte : une ambiguïté découverte pendant l’implémentation suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification du périmètre.

