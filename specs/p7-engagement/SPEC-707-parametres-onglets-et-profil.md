---
id: SPEC-707
title: "Paramètres : onglets et Profil"
phase: P7
priority: V1
depends_on: [SPEC-304, SPEC-211]
business_rules: [BR-SET-01, BR-SET-02, BR-ACC-05, BR-ACC-06, BR-ACC-07, BR-ACC-08, BR-ACC-10, BR-ACC-11, BR-ACC-12]
screens: [SCR-15]
adrs: []
visual: mockup
---

# SPEC-707 — Paramètres : onglets et Profil

## 1. Objectif

Écran Parametres.dc.html : onglets ARIA synchronisés avec l'URL, onglet Profil (identité, langue des cours, ton, fuseau, rythme et résumé, Enregistrer), Données et confidentialité (export, suppression avec confirmation et annulation). Cette spécification livre le contrat, le service, les états d’interface ou de démonstration et les validations nécessaires pour que la capacité soit utilisable et prouvée sans appel à un service réel dans les tests.

## 2. Contexte

Lire `docs/product/vision.md`, `docs/product/business-rules.md`, `docs/product/screens.md`, `docs/architecture/overview.md`, `docs/architecture/data-model.md`, `docs/architecture/api.md`, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. Écran concerné : SCR-15 : route du catalogue. Les maquettes sont en lecture seule ; le jeu de données SPEC-115 et l’horloge du 11 novembre 2026 permettent des captures reproductibles. Les ADR listés en section 15 priment sur ce texte en cas de conflit.

## 3. Dépendances

- **SPEC-304** — Coquille : menu latéral ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-211** — Export des données et suppression du compte ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **Architecture transversale** — Les opérations utilisent les contrats Zod de `packages/contracts`, `handler()` de SPEC-201 et le client utilisateur soumis à RLS de SPEC-113. Les dates sont calculées par `@learny/core/time` avec l’horloge injectable ; l’interface réutilise `@learny/ui` et les textes de `apps/web/messages/fr.ts`.
- **Services externes** — Les tests utilisent Supabase local et `LLM_MODE=mock`; tout secret réel reste côté serveur. Si un service tiers est indisponible, exécuter les parties mock, consigner le blocage externe selon `sdd-process.md` §3, sans inventer de résultat.

## 4. Règles métier couvertes

- **BR-SET-01** — Paramètres en quatre onglets (ARIA tabs) : Profil, Notifications, Automatismes, Modèles d'IA ; l'onglet actif est reflété dans l'URL (`#profil`, `#notifications`, `#automatismes`, `#modeles`) ; défaut Profil.
- **BR-SET-02** — Profil : identité (prénom, nom, e-mail en lecture seule), langue des cours, ton, fuseau horaire ; rythme d'apprentissage avec résumé chiffré (« 5 h par jour, 5 jours sur 7, plutôt matin et après-midi : 25 h par semaine. ») ; données et confidentialité (exporter, supprimer le compte) ; « Enregistrer » avec confirmation.
- **BR-ACC-05** — Ton du tuteur : **vouvoiement** par défaut, **tutoiement** possible (profil). Le ton s'applique à tout texte rédigé par le tuteur (cours, discussion, corrections, messages des notifications et automatismes). Les libellés fixes de l'interface restent au vouvoiement.
- **BR-ACC-06** — Interface en **français uniquement** en V1. Langue des cours au choix (fr, en, es, de ; défaut fr) : le tuteur rédige dans cette langue quelle que soit la langue des ressources.
- **BR-ACC-07** — Chaque utilisateur a un fuseau horaire (IANA ; défaut détecté par le navigateur, sinon `Europe/Paris`). Toutes les dates et heures affichées, planifiées et envoyées le sont dans ce fuseau.
- **BR-ACC-08** — Rythme d'étude : heures par jour (entier 1 à 6, défaut 2 à l'onboarding), jours d'étude (au moins 1 ; défaut lundi à vendredi), moments préférés (au moins 1 parmi matin 08:00-12:00, après-midi 13:00-18:00, soir 18:00-22:00 ; défaut soir). Ce rythme est la valeur par défaut des nouvelles formations.
- **BR-ACC-10** — Export de toutes les données à tout moment : archive ZIP contenant cours (Markdown), apports originaux, résultats et réglages (JSON), prête en moins de 15 minutes, lien de téléchargement valable 7 jours, notifié par e-mail.
- **BR-ACC-11** — Suppression du compte : effective **30 jours** après la demande ; annulable jusque-là (bouton dans Paramètres, ou simple reconnexion qui propose l'annulation) ; à J+30 toutes les données personnelles et fichiers sont effacés définitivement ; un e-mail confirme la demande et la suppression.
- **BR-ACC-12** — Le profil comporte : prénom, nom, e-mail (non modifiable en V1), langue des cours, ton du tuteur, fuseau horaire, rythme d'étude.

## 5. Exigences fonctionnelles

- **EF-1** — La page Paramètres comporte exactement quatre onglets ARIA : Profil, Notifications, Automatismes, Modèles d’IA ; l’onglet actif suit `#profil|notifications|automatismes|modeles`, avec Profil par défaut et navigation clavier.
- **EF-2** — Profil affiche prénom, nom, e-mail en lecture seule, langue des cours `fr|en|es|de` (défaut fr), ton vous/tu (défaut vous), fuseau IANA et rythme : 1–6 h/jour, au moins un jour et un moment parmi matin, après-midi, soir. Le résumé calcule les heures par semaine.
- **EF-3** — « Enregistrer » persiste les changements et affiche confirmation ; un autre onglet ou rechargement retrouve les valeurs. Les libellés fixes restent en français/vouvoiement alors que les futurs contenus du tuteur utilisent le ton/locale choisis.
- **EF-4** — Données et confidentialité offre export ZIP (prêt < 15 min, lien 7 jours) et suppression J+30 annulable, avec dialogues de confirmation et état de demande ; l’e-mail du profil reste non modifiable en V1.
- **EF-5** — Les règles métier BR-SET-01, BR-SET-02, BR-ACC-05, BR-ACC-06, BR-ACC-07, BR-ACC-08, BR-ACC-10, BR-ACC-11, BR-ACC-12 de la section 4 sont obligatoires dans tous les états, y compris les erreurs et la reprise.

## 6. Exigences techniques

- **ET-1** — Les routes API valident entrée/sortie avec Zod et appellent un service soumis à RLS ; un objet d’un autre utilisateur répond 404. Les mutations rejouables portent une clé d’idempotence.
- **ET-2** — Les actions et notifications sont écrites dans une transaction puis émises après commit ; l’horloge injectable et le fuseau IANA du profil déterminent les échéances et les semaines locales.
- **ET-3** — Contrats `ProfilePatch` et `StudyRhythm` bornés par BR-ACC-07/08 ; `PATCH /me/profile` effectue une transaction avec version attendue et invalide les vues dépendantes du fuseau/rythme.
- **ET-4** — Les boutons export/suppression délèguent à SPEC-211 et n’annoncent « prêt » ou « supprimé » que sur le statut réel. Le dialogue de suppression indique la date locale J+30 calculée par `@learny/core/time`.
- **ET-5** — Les onglets utilisent `role=tablist`, `tab`, `tabpanel`, `aria-selected`, roving tabindex et hash synchronisé sans perdre le focus.

## 7. Comportements attendus et cas limites

- **CL-1** — Identifiant ou donnée hors schéma : 400 `VALIDATION_FAILED`, sans écriture ni événement ; ressource d’un autre propriétaire : 404 sans révéler son existence.
- **CL-2** — Deux demandes concurrentes identiques ne créent qu’un effet ; une version d’objet devenue obsolète renvoie 409 `CONFLICT` et restitue l’état actuel.
- **CL-3** — Hash inconnu : ouvrir Profil et normaliser l’URL, sans écran blanc.
- **CL-4** — Fuseau IANA invalide ou aucun jour d’étude : erreur de champ et aucune sauvegarde partielle.
- **CL-5** — Demande de suppression déjà planifiée : afficher l’annulation, empêcher un second job.

## 8. Instructions d'implémentation

1. Relire les contrats des dépendances et les règles BR-SET-01, BR-SET-02, BR-ACC-05, BR-ACC-06, BR-ACC-07, BR-ACC-08, BR-ACC-10, BR-ACC-11, BR-ACC-12 ; définir les schémas Zod et types DTO dans `packages/contracts/src/parametres-onglets-et-profil.ts`. Ajouter les valeurs métier à `packages/config/src/product.ts` uniquement si elles viennent d’une règle ou d’un ADR. Commit `feat(SPEC-707): définit les contrats`.
2. Écrire `packages/services/src/parametres-onglets-et-profil.ts` et ses fonctions pures d’aide ; toute écriture multi-tables est transactionnelle. Utiliser l’horloge injectée et le client RLS. Commit `feat(SPEC-707): implémente la capacité`.
3. Brancher les routes documentées, les événements après commit et les composants ou la page SDD. Réutiliser `@learny/ui` et ajouter les libellés à `apps/web/messages/fr.ts`. Commit `feat(SPEC-707): expose le parcours`.
4. Couvrir chaque EF et CL par les tests section 12 ; utiliser les fixtures du jeu SPEC-115, l’IA mock et l’horloge figée. Créer la référence de non-régression sans toucher aux maquettes. Commit `test(SPEC-707): vérifie le parcours et les limites`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-707`, corriger les erreurs, lier les preuves réelles aux CA dans `evidence/SPEC-707/acceptance.md` puis terminer avec `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/parametres-onglets-et-profil.ts`, `packages/services/src/parametres-onglets-et-profil.ts`, `packages/services/src/parametres-onglets-et-profil.test.ts`, `packages/services/test/integration/parametres-onglets-et-profil.test.ts`, `apps/web/e2e/specs/p7/spec-707.spec.ts`.
- **Modifiés** : `apps/web/messages/fr.ts`, exports des paquets, routes `apps/web/app/api/v1/**` correspondant à ET-6, composants de l’écran SCR-15, catalogue d’événements si la capacité en émet.
- **Lus / réutilisés** : `specs/p3-interface/SPEC-304-coquille-menu-lateral.md`, `specs/p2-backend/SPEC-211-export-des-donnees-et-suppression-du-compte.md`.

## 10. Interface et conformité visuelle

`Parametres.dc.html` : barre de quatre onglets, carte Identité, Langue et ton, fuseau, rythme et résumé chiffré, Données et confidentialité, bouton « Enregistrer ». `data-testid` : `settings-tabs`, `profile-rhythm-summary`, `profile-save`, `data-export`, `account-delete`.

- **Contrôles** — Utiliser la référence du SCR-15 dans `design/references/` et mesurer ≤ 12 % de pixels différents ; vérifier les jetons, l’ordre des régions, les textes, axe sans violation serious/critical et la ligne de base `toHaveScreenshot` ≤ 1 % à 1440 × 900 et 390 × 844. Les états chargement, vide, erreur et permission refusée sont distincts, accessibles au clavier et annoncés sans dépendre de la seule couleur.

## 11. Critères d'acceptation

- **CA-1** — Le hash `#notifications` sélectionne l’onglet correspondant, les flèches changent d’onglet et `#profil` est le défaut.
- **CA-2** — Avec 5 h/jour et 5 jours, le résumé indique 25 h/semaine ; 0 ou 7 h/jour et zéro jour sont refusés.
- **CA-3** — L’export et la suppression utilisent les statuts réels du service ; J+30 et l’annulation sont visibles sans supprimer immédiatement.
- **CA-4** — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
- **CA-5** — L’écran respecte la maquette avec un écart ≤ 12 % ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.

## 12. Plan de tests

- **Unitaires** — `packages/services/src/spec-707.test.ts`, `describe('[SPEC-707] règles et calculs')` : pour CA-1 : Le hash `#notifications` sélectionne l’onglet correspondant, les flèches changent d’onglet et `#profil` est le défaut. ; CA-2 : Avec 5 h/jour et 5 jours, le résumé indique 25 h/semaine ; 0 ou 7 h/jour et zéro jour sont refusés. ; CA-3 : L’export et la suppression utilisent les statuts réels du service ; J+30 et l’annulation sont visibles sans supprimer immédiatement. Tester aussi valeurs limites, entrée vide, ordre déterministe et fuseau si le comportement dépend du temps.
- **Intégration** — `packages/services/test/integration/spec-707.test.ts`, `describe('[SPEC-707] service et API')` : exécuter les mêmes cas sur Supabase local avec `LLM_MODE=mock`, vérifier les lignes et événements réellement écrits, puis 400, 404 RLS, 409 et double envoi (CA-4).
- **End-to-end** — `apps/web/e2e/specs/p7/spec-707.spec.ts`, `test('parcours SPEC-707 @SPEC-707')` : partir du seed SPEC-115, ouvrir SCR-15, effectuer les actions des CA-1 à CA-3, recharger, contrôler le résultat et conserver la vidéo. Tester l’état erreur et lancer axe.
- **Visuel** — `test('conformité SPEC-707 @SPEC-707 @visual')` : jetons, régions, textes, comparaison de référence ≤ 12 %, captures desktop/mobile ≤ 1 % et axe (CA-5).
- **Non-régression** — Rejouer les étiquettes `[SPEC-304]` et `@SPEC-304`, `[SPEC-211]` et `@SPEC-211` en plus des suites unitaires/intégration complètes.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-2 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-3 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-4 | intégration RLS, invalides et idempotence |
| CA-5 | e2e et `@SPEC-707 @visual` |

## 13. Preuves attendues

`evidence/SPEC-707/` contient les rapports réels `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, au moins une vidéo Playwright, les captures finales et `acceptance.md` avec preuve vérifiable pour CA-1 à CA-5. Conserver la comparaison côte à côte et le diff avec la référence de maquette. Une pièce manquante fait échouer la validation ; aucune preuve n’est fabriquée.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent : lint, typecheck, build, unitaires, intégration, e2e avec vidéo, `@visual`, axe, non-régression et CA cochés avec preuve. Les limites et cas d’échec de cette spécification sont couverts, les contrats API restent documentés, et aucune donnée d’un autre utilisateur n’est rendue.

## 15. Décisions et hypothèses

- Aucun ADR spécifique dans le catalogue ; les règles métier, conventions et documents d’architecture cités sont appliqués sans nouveau choix de produit.
- Aucune décision ouverte : une ambiguïté découverte pendant l’implémentation suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification du périmètre.

