---
id: SPEC-3102
title: Coquille, onglets natifs, compte et centre de notifications
phase: P31
priority: mobile
depends_on: [SPEC-3101]
business_rules: [BR-ACC-04, BR-NAV-01, BR-NOT-01, BR-NOT-02, BR-PLA-02]
screens: [SCR-03, SCR-20]
adrs: [ADR-3002, ADR-3003, ADR-3004, ADR-0046]
visual: mockup
---

# SPEC-3102 — Coquille, onglets natifs, compte et centre de notifications

## 1. Objectif

Livrer la structure de navigation de l'application : cinq onglets natifs avec une pile par
onglet, l'en-tête commun (cloche et compte), la feuille « Mon compte », le centre de
notifications, la garde d'onboarding, les états communs (chargement, erreur, hors ligne) et le
mécanisme « Continuer sur le web ».

## 2. Contexte

Maquette : barre d'onglets et en-têtes de tous les écrans (`design/app-mobile/index.html`
§ Différences assumées, lignes Navigation et Contrôles), notifications et compte (états
`design/app-mobile/exports/states/ios-notifications.png`), fonctions `largeHead`, `notifRead`,
`notifUnread` et feuilles `notifications`/`account` dans `design/app-mobile/assets/screens.js` et
`app.js`. Règles web équivalentes : en-tête et menu (SCR-03, `docs/product/screens.md` §2),
centre de notifications (BR-NOT-01). Périmètre : ADR-3002 (onglets, renvois au web). Socle :
ADR-3004 §2 (onglets natifs, `AppTabs`, piles, feuilles). Contrats :
`packages/contracts/src/notifications.ts`, `header.ts`, `me.ts` (onboarding).

## 3. Dépendances

- **SPEC-3101** (session, garde d'authentification, déconnexion).
- `expo-router` (onglets natifs ou `Tabs`), `expo-web-browser`.

## 4. Règles métier couvertes

- BR-ACC-04 — `GET /me/onboarding` : si l'étape IA n'est pas franchie, écran « Terminez votre
  configuration sur le web » (bouton « Continuer sur le web » vers `/premiers-pas/<étape>`,
  bouton « J'ai terminé » qui relit l'état) ; aucune autre route n'est accessible.
- BR-NAV-01 — Adaptation mobile de l'en-tête : cloche avec pastille et bouton « Mon compte »
  (initiales) sur Aujourd'hui ; la feuille compte affiche prénom et nom, « Apprenant · N
  formations en cours », « Paramètres » (onglet Profil), « Mettre en pause » (SPEC-3401),
  « Se déconnecter ». La recherche globale est renvoyée au web (ADR-3002).
- BR-NOT-01 — Centre de notifications en feuille : pastille du nombre de non lues
  (`GET /notifications/unread-count`), groupes « Aujourd'hui », « Hier », « Plus tôt », filtre
  « Toutes / Non lues », « Tout marquer comme lu », notification (icône de type, titre, texte,
  formation, heure, point non lu) qui ouvre l'écran concerné et se marque lue, lien « Gérer les
  notifications » (Profil → Notifications).
- BR-NOT-02 — Chaque type de notification a son icône et sa destination (table d'ET-3).
- BR-PLA-02 — Cibles tactiles des onglets, de la cloche et du compte ≥ 44 pt / 48 dp.

## 5. Exigences fonctionnelles

- **EF-1** — Groupe `(app)` : onglets « Aujourd'hui », « Programme », « Réviser », « Agenda »,
  « Profil », icônes de la maquette (maison, couches, cartes, calendrier, personne), onglet
  initial Aujourd'hui. Chaque onglet a sa pile ; un nouvel appui sur l'onglet actif revient à la
  racine de sa pile puis fait défiler en haut.
- **EF-2** — Les écrans racine des onglets non encore livrés affichent `EmptyState`
  « Écran en préparation » (remplacés par SPEC-3201, 3202, 3203, 3305, 3401).
- **EF-3** — Feuille `notifications` (route modale) : liste paginée (`GET /notifications?filter=`,
  `cursor`), filtres, « Tout marquer comme lu » (`POST /notifications/read-all`), ouverture
  (`POST /notifications/:id/read` puis navigation), état vide « Aucune notification »,
  rafraîchissement par tirer-vers-le-bas.
- **EF-4** — Feuille `compte` (EF de BR-NAV-01) ; « Se déconnecter » demande confirmation
  (« Se déconnecter ? » / « Se déconnecter » / « Annuler ») puis appelle `signOut()`.
- **EF-5** — `openOnWeb(path)` (`src/lib/web.ts`) : ouvre `EXPO_PUBLIC_WEB_URL + path` dans le
  navigateur intégré ; utilisé par tous les renvois d'ADR-3002 avec le libellé « Continuer sur le
  web ».
- **EF-6** — États communs : `Banner` hors ligne en haut de chaque écran des onglets quand le
  réseau est absent ; `ErrorState` avec « Réessayer » sur erreur de chargement ; `Skeleton`
  pendant le premier chargement ; frontière d'erreur globale « Une erreur inattendue est
  survenue » avec « Relancer ».
- **EF-7** — Écran « Aucune formation active » si `GET /formations` est vide : texte et bouton
  « Créer une formation sur le web » (`/formations/nouvelle`).
- **EF-8** — Liens profonds internes `learny://…` et liens universels vers les routes de
  l'application, résolus après la garde d'authentification (utilisés par les notifications et
  par SPEC-3501).

## 6. Exigences techniques

- **ET-1** — `src/navigation/AppTabs.tsx` encapsule les onglets natifs ; s'ils sont
  indisponibles ou instables, bascule sur `Tabs` d'Expo Router sans modifier les écrans
  (ADR-3004 §2). Le choix réel est consigné dans la section 15 au moment de l'implémentation.
- **ET-2** — Pastille de non lues rafraîchie au premier plan et toutes les 60 s quand l'écran
  Aujourd'hui est visible (aucun intervalle en arrière-plan).
- **ET-3** — `src/features/notifications/destinations.ts` : table type → route (quiz de
  validation à venir → `quiz` du module, cours prêt → `cours`, quiz global du jour → `reviser`,
  nouvelle lacune → web `/formations/[fid]/lacunes`, séance prévue → `agenda`, module validé →
  `programme`, séance à replacer → `aujourdhui`, bilan de la semaine → `aujourdhui`, jalon
  atteint → `aujourdhui`, échec de tâche IA → web, export prêt → `profil`, invitation de groupe
  → web) ; type inconnu → reste sur la feuille.
- **ET-4** — Routes en français (ADR-0046) ; noms de fichiers du canevas § 1.
- **ET-5** — Accessibilité : onglets avec rôle et état sélectionné natifs, pastille annoncée
  (« 3 notifications non lues »), feuilles fermables par geste, bouton et retour système, focus
  rendu au déclencheur à la fermeture.

## 7. Comportements attendus et cas limites

- **CL-1** — Notification vers une formation archivée ou supprimée (`404`) : toast « Ce contenu
  n'est plus disponible » et marquage lu.
- **CL-2** — Hors ligne : la feuille notifications montre la dernière liste en cache, actions de
  lecture désactivées avec mention « Disponible une fois en ligne ».
- **CL-3** — Plus de 99 non lues : pastille « 99+ ».
- **CL-4** — Onboarding terminé sur le web pendant que l'écran de garde est ouvert : « J'ai
  terminé » ou le retour au premier plan libère l'accès.
- **CL-5** — Retour Android sur la racine d'un onglet autre qu'Aujourd'hui : bascule vers
  Aujourd'hui ; sur Aujourd'hui : sortie de l'application.

## 8. Instructions d'implémentation

1. Écrire `AppTabs` et le groupe `(app)` avec les cinq piles et leurs écrans provisoires.
2. Écrire l'en-tête `LargeTitleHeader` avec cloche et compte (hook `useUnreadCount`).
3. Écrire les feuilles `notifications` et `compte`, la table des destinations et la garde
   d'onboarding.
4. Écrire `openOnWeb`, les états communs et la frontière d'erreur.
5. Libellés propres au mobile dans `packages/i18n/src/fr/mobile.ts` (espaces `shell`,
   `notifications`) ; libellés existants réutilisés depuis `@learny/i18n`.
6. Tests, flux Maestro, visuel.

## 9. Fichiers et composants concernés

- **Créés** — `apps/mobile/app/(app)/_layout.tsx`, écrans racine des onglets,
  `apps/mobile/app/notifications.tsx`, `apps/mobile/app/compte.tsx`,
  `apps/mobile/app/terminer-sur-le-web.tsx`, `apps/mobile/src/navigation/*`,
  `apps/mobile/src/features/{shell,notifications}/**`, `apps/mobile/src/lib/web.ts`, tests,
  `apps/mobile/e2e/flows/SPEC-3102-*.yaml`.
- **Modifiés** — `apps/mobile/app/_layout.tsx`, `packages/i18n/src/fr/mobile.ts`.
- **Lus** — `packages/contracts/src/{notifications,header,me}.ts`, `packages/i18n/src/fr/*`.

## 10. Interface et conformité visuelle

Mode `mockup` : feuille notifications vs `design/app-mobile/exports/states/ios-notifications.png`
(données de démonstration : 3 non lues) ; en-tête d'Aujourd'hui (cloche, pastille « 3 »,
avatar « AP ») vs zone haute de `ios-02-aujourdhui.png` et `android-02-aujourdhui.png`. Barre
d'onglets masquée dans la comparaison (ADR-3003 §3) mais vérifiée structurellement (cinq
entrées, libellés exacts, onglet actif). `testID` : `tab-aujourdhui`… `tab-profil`,
`header-bell`, `header-unread-badge`, `header-account`, `notifications-filter`,
`notifications-read-all`, `notification-item-<id>`, `account-sign-out`, `onboarding-gate`.
États non maquettés (garde d'onboarding, aucune formation, erreur, hors ligne) vérifiés par
les jetons.

## 11. Critères d'acceptation

- **CA-1** — Les cinq onglets s'affichent avec les libellés exacts et une pile chacun ; l'appui
  sur l'onglet actif revient à la racine.
- **CA-2** — La pastille affiche 3 pour Alex Perrin ; ouvrir une notification la marque lue,
  décrémente la pastille et ouvre l'écran prévu par la table ; « Tout marquer comme lu » vide la
  pastille.
- **CA-3** — Un compte dont l'onboarding n'a pas franchi l'étape IA ne voit que l'écran de garde.
- **CA-4** — La feuille compte affiche « Apprenant · 3 formations en cours » et la déconnexion
  confirmée ramène à la connexion.
- **CA-5** — Hors ligne, le bandeau s'affiche et la feuille notifications montre le cache.
- **CA-6** — Feuille notifications et en-tête conformes à la maquette (écart ≤ 12 %).

## 12. Plan de tests

- **Unitaires** — Vitest `[SPEC-3102]` `destinations.test.ts` (tous les types de BR-NOT-02),
  `group-by-day.test.ts` (Aujourd'hui/Hier/Plus tôt dans le fuseau utilisateur). Jest
  `[SPEC-3102]` : `tabs.test.tsx`, `notifications-sheet.test.tsx`, `account-sheet.test.tsx`,
  `onboarding-gate.test.tsx`, `common-states.test.tsx`. Couvre CA-1, CA-2, CA-3, CA-4, CA-5.
- **Intégration** — Vitest `[SPEC-3102]` `test/integration/notifications.int.test.ts` : liste,
  filtre, lecture, tout lire contre l'API seedée. Couvre CA-2.
- **End-to-end** — Maestro `@SPEC-3102` (vidéo) : `SPEC-3102-navigation.yaml` (onglets, piles,
  retour Android), `SPEC-3102-notifications.yaml` (ouverture, lecture, destination, tout lire),
  `SPEC-3102-compte.yaml` (feuille, déconnexion), `SPEC-3102-hors-ligne.yaml`. Couvre CA-1, CA-2,
  CA-4, CA-5.
- **Visuel** — `@SPEC-3102 @visual` : feuille notifications iOS, en-tête Aujourd'hui iOS et
  Android. Couvre CA-6.
- **Non-régression** — `[SPEC-3101]`, `[SPEC-3003]`.

| Critère | Tests |
|---|---|
| CA-1 | tabs.test, SPEC-3102-navigation.yaml |
| CA-2 | destinations.test, notifications.int, SPEC-3102-notifications.yaml |
| CA-3 | onboarding-gate.test |
| CA-4 | account-sheet.test, SPEC-3102-compte.yaml |
| CA-5 | common-states.test, SPEC-3102-hors-ligne.yaml |
| CA-6 | flux visuel |

## 13. Preuves attendues

`evidence/SPEC-3102/` : `acceptance.md`, rapports, vidéos, captures et comparaisons, table des
destinations testée.

## 14. Définition de terminé

Définition commune adaptée par ADR-3004 ; `validate.mjs SPEC-3102` vert.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0046, ADR-3002, ADR-3003, ADR-3004.
- La recherche globale n'existe pas sur mobile V1 (ADR-3002).
- Choix effectif onglets natifs ou `Tabs` : à consigner ici à l'implémentation (ET-1).
