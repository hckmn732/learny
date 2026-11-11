---
id: SPEC-306
title: "Panneau des notifications"
phase: P3
priority: V1
depends_on: [SPEC-305, SPEC-209]
business_rules: [BR-NOT-01]
screens: [SCR-03]
adrs: []
visual: mockup
---

# SPEC-306 — Panneau des notifications

## 1. Objectif

Panneau de la cloche conforme à la maquette : pastille non lues, groupes Aujourd'hui/Hier/Plus tôt, filtre Toutes/Non lues, tout marquer comme lu, état vide, lien Gérer les notifications, navigation vers la cible et marquage lu ; API notifications (liste, compteur, lecture). La livraison est vérifiable par les contrats, les états d’interface et les critères de la section 11.

## 2. Contexte

Lire `docs/product/business-rules.md` pour BR-NOT-01, `docs/product/screens.md` pour SCR-03 (Accueil, route `/accueil` (`/` redirige), maquette `Main.dc.html`), `docs/architecture/overview.md` §3–§4, `docs/architecture/api.md`, `docs/engineering/conventions.md` §4–§9 et `docs/engineering/testing.md` §1–§7. Le contenu et les états de la maquette citée en section 10 font foi, sans modification de `design/maquettes/`.

## 3. Dépendances

- **SPEC-305** — Coquille : en-tête figé et menu Mon compte.
- **SPEC-209** — Service unifié de notifications.
- Les contrats Zod et services existants restent la source des DTO ; aucune donnée d’un autre utilisateur n’est chargée dans la coquille. Les tests utilisent `CLOCK_FIXED_AT=2026-11-11T12:20:00Z` et `LLM_MODE=mock`.

## 4. Règles métier couvertes

- **BR-NOT-01** — Centre de notifications (cloche) : pastille du nombre de non lues ; liste groupée « Aujourd'hui », « Hier », « Plus tôt » ; filtre Toutes / Non lues ; « Tout marquer comme lu » ; chaque notification (icône de type, titre, texte, formation, heure, point non lu) mène à l'écran concerné et se marque lue au clic ; lien « Gérer les notifications ».

## 5. Exigences fonctionnelles

- **EF-1** — La cloche affiche le nombre de notifications non lues du seul utilisateur connecté. Son panneau regroupe les éléments en Aujourd’hui, Hier, Plus tôt dans le fuseau du profil et les trie du plus récent au plus ancien dans chaque groupe.
- **EF-2** — Les filtres Toutes et Non lues modifient la liste sans changer le nombre total non lu. Chaque ligne montre icône de type, titre, texte, formation, heure locale et point non lu.
- **EF-3** — L’activation d’une ligne la marque lue puis ouvre sa cible ; Tout marquer comme lu applique l’action à toute la liste, avec mise à jour du compteur et sans doublon sur une seconde demande.
- **EF-4** — Gérer les notifications mène à `/parametres#notifications`. L’état vide de toutes les notifications et l’état vide du seul filtre Non lues ont des messages distincts.
- **EF-5** — Le panneau se ferme par Échap ou clic extérieur ; le focus revient à la cloche et la mise à jour du compteur est annoncée de manière non intrusive.

## 6. Exigences techniques

- **ET-1** — L’API `GET /api/v1/notifications?filter=all|unread` renvoie des notifications paginées du seul utilisateur connecté, déjà triées par `created_at` décroissant ; `GET /unread-count` renvoie un entier non négatif.
- **ET-2** — `POST /api/v1/notifications/:id/read` et `POST /api/v1/notifications/read-all` sont idempotents. L’ouverture d’une cible marque la notification lue avant la navigation sans perdre le lien profond.
- **ET-3** — Les groupes Aujourd’hui, Hier et Plus tôt sont calculés dans le fuseau IANA du profil avec l’horloge injectée, pas par comparaison naïve de dates UTC.
- **ET-4** — Les entrées et réponses sont validées par les schémas partagés de `packages/contracts` ; les mutations passent par `packages/services`, utilisent la session utilisateur et ne dépendent pas d’un état client faisant autorité. Les chaînes visibles sont centralisées dans `apps/web/messages/fr.ts`.
- **ET-5** — Chaque composant interactif possède un nom accessible, un focus visible et un `data-testid` stable ; les données asynchrones ont chargement, vide et erreur avec réessai. Les dates sont formatées dans le fuseau de l’utilisateur avec l’horloge injectable.

## 7. Comportements attendus et cas limites

- **CL-1** — Notification déjà lue : aucune deuxième mutation visible.
- **CL-2** — Cible supprimée ou interdite : marquer lue puis afficher une page d’erreur sûre.
- **CL-3** — Requête de lecture en échec : conserver le point non lu et proposer Réessayer.
- **CL-4** — Aucune notification : message et lien vers les préférences ; filtre Non lues vide : texte distinct.

## 8. Instructions d'implémentation

1. Lire les contrats des dépendances et la maquette ; relever les régions, textes, états et interactions exacts avant d’écrire les composants. Préserver les composants `@learny/ui` déjà livrés.
2. Définir les DTO et services nécessaires, puis écrire `apps/web/components/notifications/notification-panel.tsx` avec les comportements EF et les cas limites CL. Les données ne sont accessibles qu’au propriétaire ou au membre autorisé selon RLS.
3. Ajouter les états chargement, vide et erreur, le responsive, le clavier, le focus et les messages français ; brancher la page ou la coquille sur les routes existantes. Commits atomiques `feat(SPEC-306): …`.
4. Écrire les tests unitaires, d’intégration et navigateur de la section 12, avec leurs étiquettes, capture et vidéo. Commit `test(SPEC-306): …`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-306`, consigner les preuves observées dans `evidence/SPEC-306/acceptance.md`, corriger jusqu’au vert puis exécuter `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/notifications.ts`, `packages/services/src/notifications/list.ts`, `apps/web/app/api/v1/notifications/route.ts`, `apps/web/app/api/v1/notifications/unread-count/route.ts`, `apps/web/app/api/v1/notifications/[id]/read/route.ts`, `apps/web/app/api/v1/notifications/read-all/route.ts`, `apps/web/components/notifications/notification-panel.tsx`, `apps/web/e2e/specs/p3/spec-306.spec.ts`, `apps/web/components/notifications/notification-panel.test.tsx`, `apps/web/test/integration/notifications-panel.test.ts`.
- **Modifiés** : `apps/web/messages/fr.ts`, `apps/web/components/shell/app-shell.tsx` ou la route liée à SCR-03 (Accueil, route `/accueil` (`/` redirige), maquette `Main.dc.html`), exports de `packages/contracts/src/index.ts` si un DTO est ajouté.
- **Lus / réutilisés** : `@learny/ui`, services et routes des dépendances, `docs/product/screens.md`, maquette de la section 10 ; dépendances SPEC-305, SPEC-209.

## 10. Interface et conformité visuelle

Mode `mockup`. SCR-03, panneau de `design/maquettes/Main.dc.html` : titre « Notifications », filtres « Toutes » et « Non lues », groupes Aujourd’hui/Hier/Plus tôt, icône, titre, texte, formation, heure et point non lu ; action « Tout marquer comme lu » et lien « Gérer les notifications ». Capturer panneaux avec et sans contenu. Les états chargement, vide, erreur et réussite doivent être représentés ; tous les contrôles ont un libellé et un ordre de tabulation cohérent. Vérifier `expectTokens`, les régions et textes attendus, la comparaison à la référence si une maquette s’applique (écart ≤ 12 %), puis `toHaveScreenshot` avec `maxDiffPixelRatio: 0.01`.

## 11. Critères d'acceptation

- **CA-1** — Avec les données figées au 11 novembre 2026, les notifications apparaissent dans les trois groupes Aujourd’hui, Hier et Plus tôt avec heure du profil.
- **CA-2** — Le filtre Non lues n’affiche que les non lues ; ouvrir l’une d’elles la marque lue et décrémente le compteur exactement une fois.
- **CA-3** — Tout marquer comme lu laisse zéro non lue ; une seconde invocation ne crée aucune écriture supplémentaire ni valeur négative.
- **CA-4** — La liste et les mutations refusent l’accès à une notification appartenant à un autre utilisateur.
- **CA-5** — Panneau, état vide et focus sont conformes à la maquette ; axe sans serious/critical, capture ≤ 12 % et vidéo présente.

## 12. Plan de tests

- **Unitaires** — `apps/web/components/notifications/notification-panel.test.tsx`, `describe('[SPEC-306] Panneau des notifications')` : ouverture, filtre et lecture d’une notification ; données vides, limites et accessibilité des contrôles (CA-1 à CA-3).
- **Intégration** — `apps/web/test/integration/notifications-panel.test.ts`, `describe('[SPEC-306] Panneau des notifications service')` : tout marquer comme lu et compteur à zéro, RLS avec deux utilisateurs et réponse d’erreur sûre (CA-2 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p3/spec-306.spec.ts`, `test('Panneau des notifications @SPEC-306')` : états vide et erreur avec focus rendu, vérifier les textes et l’URL, capturer l’état final et conserver la vidéo (CA-1, CA-4, CA-5).
- **Visuel** — `test('Panneau des notifications @SPEC-306 @visual')` : jetons, structure, axe, capture desktop 1440×900 et mobile 390×844 ; comparaison de maquette si applicable (CA-5).
- **Non-régression** — rejouer les étiquettes `[SPEC-305]` / `@SPEC-305`, `[SPEC-209]` / `@SPEC-209`.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; e2e |
| CA-2 | unitaires ; intégration |
| CA-3 | unitaires ; intégration |
| CA-4 | intégration ; e2e |
| CA-5 | e2e ; @visual |

## 13. Preuves attendues

`evidence/SPEC-306/` contient `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, une vidéo réelle du scénario `@SPEC-306`, captures desktop/mobile, comparaisons visuelles applicables et `acceptance.md` reliant chaque CA au test et à sa sortie. Aucune capture ou réussite n’est déclarée sans fichier effectivement généré.

## 14. Définition de terminé

La définition commune de `docs/engineering/testing.md` §7 est remplie : lint, typecheck, build, tests unitaires et d’intégration filtrés, e2e avec vidéo, au moins un test `@visual`, axe, preuves et absence de régression. Les comportements, bornes et textes de la section 5 sont observés ; l’accès d’un autre utilisateur ne révèle pas ces données.

## 15. Décisions et hypothèses

Les valeurs normatives viennent des règles métier et de la maquette ; aucune valeur produit n’est introduite hors du catalogue. Toute ambiguïté d’implémentation découverte ensuite suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification de la spécification.
