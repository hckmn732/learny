---
id: SPEC-3101
title: Connexion, inscription et lien magique
phase: P31
priority: mobile
depends_on: [SPEC-3002, SPEC-3003]
business_rules: [BR-ACC-01, BR-ACC-02, BR-ACC-03, BR-ACC-09, BR-PLA-05, BR-PLA-06]
screens: [SCR-01]
adrs: [ADR-0007, ADR-0121, ADR-1005, ADR-3003, ADR-3006, ADR-3008]
visual: mockup
---

# SPEC-3101 — Connexion, inscription et lien magique

## 1. Objectif

Permettre de se connecter, de créer un compte et de recevoir un lien magique depuis
l'application, d'ouvrir ce lien dans l'application, d'accepter les CGU et de se déconnecter, avec
les mêmes règles et les mêmes messages que le web.

## 2. Contexte

Maquette : écran 01 « Connexion » (`design/app-mobile/view.html#screen=welcome&platform=ios|android`,
fonction `welcome` de `design/app-mobile/assets/screens.js`, exports
`design/app-mobile/exports/screens/{ios,android}-01-connexion.png`), lue avec les corrections
d'ADR-3003 §2 « Connexion ». Règles et flux : ADR-0007 (méthodes), ADR-0121 (non-énumération,
redirections), ADR-3008 (session mobile, lien universel, schéma `learny`). Contrats :
`packages/contracts/src/auth.ts` (bornes du mot de passe, messages), `legal.ts`
(`POST /me/legal-acceptances`). Libellés web : `packages/i18n/src/fr/auth.ts`. L'écran web
équivalent est SCR-01 (`Inscription.dc.html`).

## 3. Dépendances

- **SPEC-3002** (composants), **SPEC-3003** (client Supabase, session, erreurs).
- `expo-linking`, `expo-web-browser` ; liens universels : fichiers
  `apple-app-site-association` et `assetlinks.json` servis par le web (`apps/web/public/.well-known/`).
- Supabase Auth local avec Mailpit (`pnpm dev:up`) pour lire les liens magiques en test.

## 4. Règles métier couvertes

- BR-ACC-01 — Connexion par mot de passe (12 caractères minimum, indicateur de solidité à
  l'inscription) ou par lien magique (valable 1 h, usage unique, géré par Supabase).
- BR-ACC-02 — Inscription : case « J'accepte les conditions d'utilisation et la politique de
  confidentialité » non pré-cochée, bouton inactif tant qu'elle n'est pas cochée ; acceptation
  enregistrée par `POST /me/legal-acceptances` à la première session.
- BR-ACC-03 — Tant que l'e-mail n'est pas vérifié, l'écran « Vérifiez votre e-mail » s'affiche
  (renvoi limité à une fois par 60 s, `POST /auth/resend`).
- BR-ACC-09 — « Se déconnecter » ferme la session (ADR-3008 §6) et mène à l'écran de connexion.
- BR-PLA-05 — Consentement explicite enregistré avec version et date ; aucune donnée collectée
  avant connexion hormis l'e-mail saisi.
- BR-PLA-06 — Les liens « conditions d'utilisation » et « politique de confidentialité » ouvrent
  `/legal/cgu` et `/legal/confidentialite` du web dans le navigateur intégré, sans connexion.

## 5. Exigences fonctionnelles

- **EF-1** — Route `(auth)/connexion` : marque Learny, titre « Reprenez là où vous en êtes. »,
  sous-titre de la maquette, contrôle segmenté « Se connecter » / « Créer un compte », champs
  « Adresse e-mail » et « Mot de passe », lien « Mot de passe oublié ? », bouton citron
  « Se connecter », séparateur « ou », bouton contour « Recevoir un lien de connexion » (libellé
  web du lien magique), mentions légales.
- **EF-2** — Mode « Créer un compte » : titre « Créez votre espace d'apprentissage. », indicateur
  de solidité sous le mot de passe (libellés web), aide « 12 caractères minimum », case
  d'acceptation (BR-ACC-02), bouton « Créer mon compte ».
- **EF-3** — « Mot de passe oublié ? » et « Recevoir un lien de connexion » ouvrent la feuille
  « Recevoir un lien de connexion » (e-mail prérempli) ; l'envoi affiche « Si un compte existe
  pour cette adresse, un lien vient d'être envoyé. » (message identique pour adresse connue ou
  inconnue, ADR-0121).
- **EF-4** — Pendant l'envoi, le bouton affiche l'indicateur et « Connexion… » / « Création… » ;
  les champs sont désactivés.
- **EF-5** — Erreurs affichées sous le champ concerné avec les messages web : e-mail invalide,
  mot de passe trop court, identifiants incorrects (message générique sans révéler l'existence du
  compte), trop de tentatives (`429`, avec délai).
- **EF-6** — Ouverture d'un lien magique ou de confirmation (`https://<web>/auth/mobile?code=…` ou
  `learny://auth/callback?code=…`) : route `auth/callback` qui échange le code, puis redirige
  selon l'état (EF-7) ; code expiré ou déjà utilisé → « Ce lien n'est plus valide. Demandez-en un
  nouveau. » avec bouton vers la feuille d'EF-3.
- **EF-7** — Après connexion : acceptation des CGU manquante → feuille d'acceptation ; e-mail non
  vérifié → `(auth)/verifier-email` ; sinon coquille (SPEC-3102).
- **EF-8** — Page web `apps/web/app/auth/mobile/page.tsx` : page statique minimale (marque, texte
  « Ouverture de l'application… », lien « Ouvrir Learny » vers `learny://auth/callback` avec le
  même code) ; aucune autre page web n'est modifiée.
- **EF-9** — `signOut()` exposé par `src/auth/session.tsx` pour la feuille compte (SPEC-3102) et
  le profil (SPEC-3401).

## 6. Exigences techniques

- **ET-1** — Connexion par mot de passe : `supabase.auth.signInWithPassword` ; inscription :
  `POST /api/v1/auth/sign-up` (même non-énumération et mêmes validations que le web) puis
  connexion à la vérification ; lien magique : `POST /api/v1/auth/magic-link` avec
  `redirectTo` = lien universel mobile (paramètre accepté par le contrat ; s'il ne l'est pas,
  `signInWithOtp` direct avec `emailRedirectTo`, consigné en ADR).
- **ET-2** — Validation locale avec les schémas Zod de `packages/contracts/src/auth.ts`
  (mêmes bornes et messages que le web).
- **ET-3** — Liens universels : `associatedDomains` iOS `applinks:<domaine web>` et
  `intentFilters` Android `autoVerify` sur `/auth/mobile` ; fichiers `.well-known` servis par le
  web avec l'identifiant `fr.learny.app`.
- **ET-4** — Champs : `textContentType`/`autoComplete` `email`, `password`, `newPassword` ;
  `keyboardType="email-address"` ; `secureTextEntry` avec bouton « Afficher le mot de passe »
  (rôle bouton, libellé) ; `returnKeyType` enchaînant les champs.
- **ET-5** — Aucun mot de passe journalisé ni persisté ; le formulaire est vidé à la sortie.

## 7. Comportements attendus et cas limites

- **CL-1** — Double appui sur « Se connecter » : une seule requête.
- **CL-2** — Réseau absent : message « Connexion impossible : vérifiez votre réseau. » et bouton
  actif dès le retour du réseau.
- **CL-3** — Lien magique ouvert sur un appareil où l'application n'est pas installée : la page
  web d'EF-8 s'affiche ; avec l'application installée mais lien non intercepté, le bouton ouvre
  l'application.
- **CL-4** — Lien magique d'un autre compte alors qu'une session est ouverte : la session
  courante est fermée et purgée avant d'ouvrir la nouvelle.
- **CL-5** — Renvoi de l'e-mail de vérification avant 60 s : bouton inactif avec compte à rebours.
- **CL-6** — Version des CGU changée côté serveur (`422 LEGAL_ACCEPTANCE_REQUIRED` sur une
  mutation) : la feuille d'acceptation s'ouvre, puis la mutation est rejouée.

## 8. Instructions d'implémentation

1. Écrire `features/auth/` : formulaire, contrôle segmenté, indicateur de solidité (réutiliser
   la fonction de calcul du web si elle est dans un paquet partagé, sinon l'y déplacer par ajout
   rétrocompatible), feuille lien magique, feuille CGU.
2. Écrire les routes `(auth)/connexion`, `(auth)/inscription` (alias du mode création),
   `(auth)/verifier-email`, `auth/callback` et la garde dans `app/_layout.tsx`.
3. Configurer liens universels et schéma ; ajouter la page web `auth/mobile` et les fichiers
   `.well-known`.
4. Ajouter les libellés propres au mobile dans `packages/i18n/src/fr/mobile.ts` (espace `auth`).
5. Tests Jest, intégration (Mailpit), flux Maestro et visuel.

## 9. Fichiers et composants concernés

- **Créés** — `apps/mobile/app/(auth)/*.tsx`, `apps/mobile/app/auth/callback.tsx`,
  `apps/mobile/src/features/auth/**`, `apps/web/app/auth/mobile/page.tsx`,
  `apps/web/public/.well-known/apple-app-site-association`, `apps/web/public/.well-known/assetlinks.json`,
  `apps/mobile/e2e/flows/SPEC-3101-*.yaml`, tests.
- **Modifiés** — `apps/mobile/app.config.ts`, `apps/mobile/app/_layout.tsx`,
  `packages/i18n/src/fr/mobile.ts`.
- **Lus** — `packages/contracts/src/auth.ts`, `packages/contracts/src/legal.ts`,
  `packages/i18n/src/fr/auth.ts`.

## 10. Interface et conformité visuelle

Mode `mockup` : références `ios-01-connexion.png` et `android-01-connexion.png` (état initial,
mode connexion, e-mail `alex.perrin@exemple.fr` prérempli par le flux de test). Zones masquées :
barre d'état, indicateur d'accueil ; zone attendue différente de la maquette : bouton du lien
magique à la place des boutons Apple/Google (ADR-3003), comparée à la ligne de base de cette
zone. `testID` : `auth-mode`, `auth-email`, `auth-password`, `auth-submit`, `auth-magic-link`,
`auth-forgot`, `auth-terms-checkbox`, `auth-error`. États : envoi, erreur, feuille lien magique,
vérification d'e-mail (vérifiés par les jetons). Accessibilité : libellés de champs associés,
erreurs annoncées (`accessibilityLiveRegion` sur Android, annonce VoiceOver sur iOS).

## 11. Critères d'acceptation

- **CA-1** — Alex Perrin se connecte par mot de passe et arrive dans la coquille ; des
  identifiants faux affichent le message générique.
- **CA-2** — Un nouvel utilisateur ne peut créer son compte qu'avec la case cochée et un mot de
  passe de 12 caractères ; l'acceptation est enregistrée avec la version active.
- **CA-3** — Un lien magique reçu dans Mailpit, ouvert sur l'émulateur, connecte l'utilisateur ;
  le même lien rouvert affiche « Ce lien n'est plus valide… ».
- **CA-4** — Le message d'envoi du lien magique est identique pour une adresse connue et inconnue.
- **CA-5** — « Se déconnecter » ramène à la connexion et purge cache et session.
- **CA-6** — L'écran de connexion est conforme à la maquette (écart ≤ 12 % hors zones masquées).

## 12. Plan de tests

- **Unitaires** — Vitest `[SPEC-3101]` `features/auth/validation.test.ts` (bornes, messages,
  solidité). Jest `[SPEC-3101]` `test/auth/*.test.tsx` : modes, case CGU, double appui, erreurs,
  feuille lien magique, accessibilité. Couvre CA-1, CA-2, CA-4.
- **Intégration** — Vitest `[SPEC-3101]` `test/integration/auth.int.test.ts` : inscription,
  e-mail dans Mailpit, échange du code, acceptation des CGU enregistrée, non-énumération,
  déconnexion. Couvre CA-2, CA-3, CA-4, CA-5.
- **End-to-end** — Maestro `@SPEC-3101` (vidéo) : `SPEC-3101-connexion.yaml` (connexion, erreur,
  déconnexion), `SPEC-3101-lien-magique.yaml` (envoi, ouverture du lien par
  `adb shell am start -d`, connexion, réouverture refusée). Couvre CA-1, CA-3, CA-5.
- **Visuel** — `@SPEC-3101 @visual` : écran de connexion iOS et Android vs exports 01. Couvre CA-6.
- **Non-régression** — `[SPEC-3003]`, tests e2e web `@SPEC-202` et `@SPEC-601` (la page
  `auth/mobile` ne doit rien changer au web).

| Critère | Tests |
|---|---|
| CA-1 | auth/*.test.tsx, SPEC-3101-connexion.yaml |
| CA-2 | validation.test, auth.int |
| CA-3 | auth.int, SPEC-3101-lien-magique.yaml |
| CA-4 | auth/*.test.tsx, auth.int |
| CA-5 | auth.int, SPEC-3101-connexion.yaml |
| CA-6 | flux visuel |

## 13. Preuves attendues

`evidence/SPEC-3101/` : `acceptance.md`, rapports, vidéos des deux flux, captures et
comparaisons iOS/Android, extrait Mailpit (adresse de test), ligne `legal_acceptances` créée.

## 14. Définition de terminé

Définition commune adaptée par ADR-3004 ; `validate.mjs SPEC-3101` vert ; aucune régression web.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0007, ADR-0121, ADR-1005, ADR-3003, ADR-3006, ADR-3008.
- « Mot de passe oublié ? » envoie un lien magique (ADR-3003) ; aucune réinitialisation.
- Apple et Google : SPEC-3402 uniquement.
