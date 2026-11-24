---
id: SPEC-3401
title: Profil, réglages, pause et confidentialité
phase: P34
priority: mobile
depends_on: [SPEC-3102]
business_rules: [BR-ACC-05, BR-ACC-08, BR-ACC-10, BR-ACC-11, BR-ACC-12, BR-SET-02, BR-SET-03, BR-SET-05, BR-SET-06, BR-AUT-10]
screens: [SCR-15]
adrs: [ADR-0044, ADR-0340, ADR-3002, ADR-3003, ADR-3006]
visual: mockup
---

# SPEC-3401 — Profil, réglages, pause et confidentialité

## 1. Objectif

Livrer l'onglet Profil : identité et indicateurs, réglages du profil et du rythme, des
notifications et des modèles d'IA, statut d'abonnement, mise en pause, export des données,
suppression du compte, aide et pages légales, déconnexion.

## 2. Contexte

Maquette : écran 09 « Profil » (`view.html#screen=profile`, fonctions `profile` et `profileRow`
de `design/app-mobile/assets/screens.js`, exports `{ios,android}-08-profil.png`), § Interactions
« Profil » du README (réglages, identité, notifications, sécurité, rythme, modèles, abonnement,
aide, confidentialité, déconnexion). Équivalent web : SCR-15 (`Parametres.dc.html`, SPEC-707 à
SPEC-710, SPEC-725), pause (SPEC-721), données personnelles (SPEC-211). Contrats :
`parametres-onglets-et-profil.ts` (`GET/PATCH /me/profile`), `parametres-notifications.ts`
(`GET/PATCH /me/notification-settings`), `parametres-modeles-d-ia.ts` et `ai-credentials.ts`
(`GET/PUT /me/ai/task-models`, `GET /me/ai/credentials`), `billing.ts`
(`GET /billing/subscription`), `personal-data.ts` (`POST /me/export`, `GET /me/exports/:id`,
`POST/DELETE /me/deletion`), `automatisme-10-mode-pause-et-retour.ts` (`POST/GET/DELETE /me/pause`).
Règles des stores : ADR-3006.

## 3. Dépendances

- **SPEC-3102** (coquille, feuille compte, `openOnWeb`).
- Données SPEC-115 : Alex Perrin, 3 formations, 12 jours, 86 %, 4 lacunes, 5 h par semaine le soir.

## 4. Règles métier couvertes

- BR-ACC-05 — Choix du ton (vouvoiement / tutoiement) dans Identité.
- BR-ACC-08 — Rythme : heures par jour (1 à 6), jours d'étude, moments ; résumé chiffré.
- BR-ACC-10 — « Exporter mes données » (`POST /me/export`) ; état de l'export et lien de
  téléchargement ouvert dans le navigateur quand il est prêt.
- BR-ACC-11 — « Supprimer mon compte » : confirmation, suppression effective à J+30, annulation
  possible (bannière « Suppression prévue le … » avec « Annuler la suppression »).
- BR-ACC-12 — Identité : prénom, nom, e-mail (lecture seule), langue des cours, ton, fuseau.
- BR-SET-02 — Enregistrement transactionnel du profil et du rythme avec version attendue
  (`409 CONFLICT` → rechargement et message), confirmation « Modifications enregistrées ».
- BR-SET-03 — Notifications : canal application verrouillé, e-mail, six types avec compteur
  « N sur 6 activés », programme du jour, heures calmes, week-end. Le canal « navigateur » est
  affiché « Notifications de l'appareil » à partir de SPEC-3501 ; avant, il n'est pas affiché.
- BR-SET-05 — Modèles d'IA : liste des cinq tâches avec le modèle choisi et sa compatibilité ;
  choix parmi les fournisseurs déjà configurés (`PUT /me/ai/task-models`) ; ajout, vérification
  et suppression de fournisseurs renvoyés au web (« Gérer mes fournisseurs sur le web »).
- BR-SET-06 — Abonnement : statut (« Gratuit » ou statut et fin de période) sans bouton d'achat
  ni de portail (ADR-3006).
- BR-AUT-10 — « Mettre en pause » : date de reprise, gel du planning (`POST /me/pause`),
  bannière « En pause jusqu'au … » et « Reprendre maintenant » (`DELETE /me/pause`).

## 5. Exigences fonctionnelles

- **EF-1** — Racine `(app)/profil` : sur-titre « Mon compte », titre « Profil », bouton réglages ;
  carte identité (avatar « AP », « Alex Perrin », « Apprenant · 3 formations en cours », puce
  « Membre depuis septembre ») ; trois indicateurs « 12 j de série », « 86 % retenu à 1 mois »,
  « 4 lacunes ».
- **EF-2** — Groupe « COMPTE » : Identité, Notifications (« 3 non lues · rappels et bilans »),
  Sécurité et connexion ; groupe « APPRENTISSAGE » : Rythme et rappels (« 5 h par semaine ·
  soirs »), Modèles d'IA ; groupe « ABONNEMENT » : statut ; groupe « AIDE ET CONFIDENTIALITÉ » :
  Aide (web), Conditions d'utilisation, Politique de confidentialité, Données et confidentialité
  (export, suppression) ; bouton « Se déconnecter » ; version de l'application en pied.
- **EF-3** — Chaque ligne ouvre un écran empilé de la pile Profil : `identite`, `notifications`,
  `securite`, `rythme`, `modeles`, `abonnement`, `confidentialite` ; formulaires avec
  « Enregistrer » actif seulement si modifié, confirmation de sortie si non enregistré.
- **EF-4** — Sécurité et connexion : e-mail de connexion, méthode utilisée, « Se déconnecter de
  cet appareil » ; aucun changement de mot de passe (aucune règle ne le prévoit).
- **EF-5** — Pause : depuis la feuille compte (SPEC-3102) et la ligne Rythme ; sélecteur de date
  natif borné (demain au plus tôt).
- **EF-6** — Suppression : saisie de confirmation « SUPPRIMER », rappel du délai de 30 jours et de
  l'annulation ; après demande, la bannière s'affiche sur Profil et Aujourd'hui.

## 6. Exigences techniques

- **ET-1** — Hooks `useProfile`, `useNotificationSettings`, `useTaskModels`, `useSubscription`,
  `usePause`, `useDeletion`, `useExport` ; mutations avec version attendue et invalidations.
- **ET-2** — Composants de plateforme : `ListRow` (iOS insérée à chevrons, Android à icônes et
  en-têtes de groupe), `Switch` natif, sélecteurs de date et d'heure natifs.
- **ET-3** — `POST /billing/checkout` et `POST /billing/portal` ne sont jamais appelés (test de
  garde sur le client d'API du mobile).

## 7. Comportements attendus et cas limites

- **CL-1** — Conflit de version à l'enregistrement : « Vos réglages ont changé ailleurs. Nous
  avons rechargé la dernière version. »
- **CL-2** — Aucun fournisseur d'IA configuré : état vide de BR-SET-05 et renvoi au web.
- **CL-3** — Export déjà en cours : état « Export en préparation » sans nouvelle demande.
- **CL-4** — Hors ligne : écrans lisibles depuis le cache, enregistrements désactivés.
- **CL-5** — Reconnexion d'un compte en suppression programmée : proposition d'annulation (même
  comportement que le web).

## 8. Instructions d'implémentation

1. Hooks et mutations ; écran racine Profil.
2. Écrans Identité, Rythme (résumé chiffré), Notifications, Modèles, Abonnement, Sécurité,
   Confidentialité ; pause et suppression.
3. Libellés repris de `@learny/i18n` (paramètres) et ajouts `mobile.profile`.
4. Tests, Maestro, visuel.

## 9. Fichiers et composants concernés

- **Créés** — `apps/mobile/app/(app)/profil/*.tsx`, `apps/mobile/src/features/profil/**`,
  `apps/mobile/src/data/{profile,notification-settings,task-models,subscription,pause,personal-data}.ts`,
  tests, `apps/mobile/e2e/flows/SPEC-3401-*.yaml`.
- **Modifiés** — `apps/mobile/app/(app)/profil/index.tsx`, feuille compte (pause),
  `packages/i18n/src/fr/mobile.ts`.
- **Lus** — contrats cités en section 2, `packages/i18n/src/fr/*` (paramètres).

## 10. Interface et conformité visuelle

Mode `mockup` : `ios-08-profil.png`, `android-08-profil.png` (racine). Masques : barre d'état,
barre d'onglets. `testID` : `profile-identity`, `profile-stat-<n>`, `profile-row-<id>`,
`profile-sign-out`, `settings-save`, `pause-date`, `deletion-confirm`, `export-request`. Écrans
de détail non maquettés vérifiés par les jetons et la structure (`ListRow`, `Switch`).

## 11. Critères d'acceptation

- **CA-1** — La racine affiche les valeurs de démonstration et tous les groupes d'EF-2.
- **CA-2** — Modifier le ton et le rythme enregistre le profil (lu ensuite sur le web) ; un
  conflit de version recharge les valeurs.
- **CA-3** — Les réglages de notifications et le choix d'un modèle par tâche sont enregistrés.
- **CA-4** — Pause et reprise fonctionnent ; demande puis annulation de suppression fonctionnent ;
  l'export est demandé.
- **CA-5** — Aucun bouton ni appel d'achat ou de portail d'abonnement.
- **CA-6** — Racine conforme à la maquette (écart ≤ 12 %).

## 12. Plan de tests

- **Unitaires** — Vitest `[SPEC-3401]` `features/profil/rhythm-summary.test.ts`,
  `api/billing-guard.test.ts`. Jest `[SPEC-3401]` : `profile-screen.test.tsx`,
  `identity-form.test.tsx`, `notifications-settings.test.tsx`, `task-models.test.tsx`,
  `pause.test.tsx`, `deletion.test.tsx`. Couvre CA-1, CA-2, CA-3, CA-4, CA-5.
- **Intégration** — Vitest `[SPEC-3401]` `test/integration/profile.int.test.ts` : profil avec
  version, notifications, modèles, pause, suppression et annulation, export. Couvre CA-2, CA-3,
  CA-4.
- **End-to-end** — Maestro `@SPEC-3401` (vidéo) : `SPEC-3401-profil.yaml` (racine, identité,
  rythme), `SPEC-3401-pause.yaml`, `SPEC-3401-suppression.yaml`. Couvre CA-1, CA-2, CA-4.
- **Visuel** — `@SPEC-3401 @visual` : racine iOS/Android. Couvre CA-6.
- **Non-régression** — `[SPEC-3102]`, e2e web `@SPEC-707` (lecture des valeurs modifiées).

| Critère | Tests |
|---|---|
| CA-1 | profile-screen.test, SPEC-3401-profil.yaml |
| CA-2 | identity-form.test, profile.int, SPEC-3401-profil.yaml |
| CA-3 | notifications-settings.test, task-models.test, profile.int |
| CA-4 | pause.test, deletion.test, profile.int, SPEC-3401-pause.yaml, SPEC-3401-suppression.yaml |
| CA-5 | billing-guard.test |
| CA-6 | flux visuel |

## 13. Preuves attendues

`evidence/SPEC-3401/` : `acceptance.md`, rapports, vidéos, captures et comparaisons.

## 14. Définition de terminé

Définition commune adaptée par ADR-3004 ; `validate.mjs SPEC-3401` vert.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0044, ADR-0340, ADR-3002, ADR-3003, ADR-3006.
- Automatismes (SPEC-710) et clés d'IA personnelles restent sur le web (ADR-3002).
