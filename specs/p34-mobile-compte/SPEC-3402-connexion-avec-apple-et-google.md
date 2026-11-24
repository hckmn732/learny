---
id: SPEC-3402
title: Connexion avec Apple et Google
phase: P34
priority: mobile
depends_on: [SPEC-3101]
business_rules: [BR-ACC-02, BR-ACC-03, BR-PLA-05]
screens: [SCR-01]
adrs: [ADR-0007, ADR-3003, ADR-3006, ADR-3008, ADR-3011]
visual: mockup
---

# SPEC-3402 — Connexion avec Apple et Google

## 1. Objectif

Ajouter « Continuer avec Apple » et « Continuer avec Google » à l'écran de connexion mobile,
conformément à la maquette et aux règles des stores, sans nouvelle route d'API : identité native
puis `signInWithIdToken` de Supabase Auth.

## 2. Contexte

Maquette : écran 01 « Connexion » (`{ios,android}-01-connexion.png`) : Apple d'abord sur iOS,
Google d'abord sur Android, icônes de fournisseur 20 px, marque Google officielle en quatre
couleurs (README de la maquette, § Apports de la référence Figma). ADR-0007 ne prévoyait que lien
magique et mot de passe : ADR-3011 étend les méthodes de connexion au mobile. ADR-3006 §3 :
Google seulement avec Apple. ADR-3008 §7 : flux technique.

## 3. Dépendances

- **SPEC-3101** (écran de connexion, session, acceptation des CGU).
- `expo-apple-authentication`, `@react-native-google-signin/google-signin` (plugin Expo).
- Fournisseurs Apple et Google activés dans Supabase Auth (local : `supabase/config.toml` ;
  hébergé : configuration du projet) ; identifiants (Services ID Apple, clients OAuth Google iOS,
  Android et web) fournis par le porteur. Sans eux : implémentation complète testée avec un
  fournisseur simulé, puis `fail.mjs SPEC-3402 "identifiants Apple/Google absents" --external`.

## 4. Règles métier couvertes

- BR-ACC-02 — Première connexion par Apple ou Google : la feuille d'acceptation des CGU (case non
  pré-cochée) s'affiche avant tout accès ; acceptation enregistrée.
- BR-ACC-03 — L'e-mail fourni par Apple ou Google est considéré vérifié par Supabase ; un e-mail
  relais Apple (« masquer mon adresse ») est accepté tel quel.
- BR-PLA-05 — Seules les données nécessaires sont demandées (nom, e-mail) ; le jeton
  d'identité n'est ni stocké ni journalisé.

## 5. Exigences fonctionnelles

- **EF-1** — Boutons sous le séparateur « ou » : iOS « Continuer avec Apple » (bouton natif
  `AppleAuthenticationButton`, style noir) puis « Continuer avec Google » ; Android l'ordre
  inverse ; le bouton du lien magique reste disponible sous les fournisseurs.
- **EF-2** — Apple : demande des portées `FULL_NAME`, `EMAIL`, nonce aléatoire haché (SHA-256)
  transmis à Apple, nonce brut à `signInWithIdToken({ provider: 'apple', token, nonce })` ; le
  nom reçu à la première connexion renseigne le prénom et le nom du profil s'ils sont vides.
- **EF-3** — Google : `GoogleSignin.signIn()` puis
  `signInWithIdToken({ provider: 'google', token: idToken })`.
- **EF-4** — Après connexion, même aiguillage que SPEC-3101 EF-7 (CGU, vérification,
  onboarding, coquille).
- **EF-5** — Annulation par l'utilisateur : retour silencieux à l'écran, sans message d'erreur.
- **EF-6** — Compte existant par mot de passe avec le même e-mail : comportement de liaison de
  Supabase (identités liées si l'e-mail est vérifié) ; sinon message « Un compte existe déjà avec
  cette adresse. Connectez-vous avec votre mot de passe ou un lien de connexion. ».

## 6. Exigences techniques

- **ET-1** — Disponibilité : Apple affiché seulement si `AppleAuthentication.isAvailableAsync()` ;
  sur Android, Apple passe par le flux web de Supabase (`signInWithOAuth` dans le navigateur
  intégré avec redirection `learny://auth/callback`), Google par le SDK natif.
- **ET-2** — Configuration Expo : `usesAppleSignIn: true`, plugin Google avec `iosUrlScheme` ;
  aucun secret dans le dépôt (identifiants clients publics seulement, via `EXPO_PUBLIC_*`).
- **ET-3** — Tests : fournisseur simulé (`src/auth/providers/mock.ts`) actif en build `e2e` qui
  renvoie un jeton signé par la clé HS256 locale de Supabase (`SUPABASE_JWT_SECRET` du
  environnement local, jamais embarqué hors build e2e).

## 7. Comportements attendus et cas limites

- **CL-1** — Pas de réseau : message de SPEC-3101 CL-2.
- **CL-2** — Jeton refusé par Supabase (fournisseur non activé) : « Cette méthode de connexion
  n'est pas disponible pour le moment. » et journalisation du code sans jeton.
- **CL-3** — Apple ne renvoie pas l'e-mail (connexion ultérieure) : l'identité existante est
  utilisée ; aucune erreur.
- **CL-4** — Double appui : une seule fenêtre du fournisseur.

## 8. Instructions d'implémentation

1. ADR-3011 appliqué : ajouter les boutons et les fournisseurs (`src/auth/providers/{apple,google,mock}.ts`).
2. Configurer Expo, Supabase local (`supabase/config.toml`, fournisseurs désactivés par défaut,
   activés dans l'environnement e2e) et la redirection.
3. Tests avec le fournisseur simulé ; essai manuel documenté sur appareil si les identifiants
   sont fournis.

## 9. Fichiers et composants concernés

- **Créés** — `apps/mobile/src/auth/providers/*`, tests, `apps/mobile/e2e/flows/SPEC-3402-*.yaml`.
- **Modifiés** — `apps/mobile/src/features/auth/*` (boutons), `apps/mobile/app.config.ts`,
  `supabase/config.toml` (section des fournisseurs, désactivés par défaut),
  `packages/i18n/src/fr/mobile.ts`.
- **Lus** — `packages/contracts/src/legal.ts`.

## 10. Interface et conformité visuelle

Mode `mockup` : `ios-01-connexion.png`, `android-01-connexion.png`, zone des boutons de
fournisseur désormais comparée à la maquette (elle était masquée dans SPEC-3101). `testID` :
`auth-apple`, `auth-google`. Le bouton Apple respecte les règles d'Apple (bouton système, aucune
recoloration) ; l'icône Google est la marque officielle quatre couleurs.

## 11. Critères d'acceptation

- **CA-1** — Les deux boutons s'affichent dans l'ordre de la plateforme ; Google n'est jamais
  affiché sans Apple.
- **CA-2** — Une première connexion par le fournisseur simulé crée le compte, impose
  l'acceptation des CGU puis ouvre l'application.
- **CA-3** — L'annulation par l'utilisateur ne montre aucune erreur.
- **CA-4** — Écran de connexion conforme à la maquette, zone des fournisseurs comprise (écart
  ≤ 12 %).

## 12. Plan de tests

- **Unitaires** — Vitest `[SPEC-3402]` `auth/providers/apple-nonce.test.ts`,
  `auth/providers/order.test.ts`. Jest `[SPEC-3402]` : `provider-buttons.test.tsx` (ordre,
  disponibilité, annulation, double appui). Couvre CA-1, CA-3.
- **Intégration** — Vitest `[SPEC-3402]` `test/integration/id-token.int.test.ts` :
  `signInWithIdToken` contre Supabase local avec le fournisseur simulé, acceptation des CGU
  exigée. Couvre CA-2.
- **End-to-end** — Maestro `@SPEC-3402` (vidéo) : `SPEC-3402-fournisseur.yaml` (fournisseur
  simulé, CGU, accès). Couvre CA-2.
- **Visuel** — `@SPEC-3402 @visual` : écran de connexion iOS et Android. Couvre CA-1, CA-4.
- **Non-régression** — `[SPEC-3101]`.

| Critère | Tests |
|---|---|
| CA-1 | order.test, provider-buttons.test, flux visuel |
| CA-2 | id-token.int, SPEC-3402-fournisseur.yaml |
| CA-3 | provider-buttons.test |
| CA-4 | flux visuel |

## 13. Preuves attendues

`evidence/SPEC-3402/` : `acceptance.md`, rapports, vidéo, captures et comparaisons ; si les
identifiants réels sont fournis, compte rendu d'essai sur appareil (sans jeton).

## 14. Définition de terminé

Définition commune adaptée par ADR-3004 ; `validate.mjs SPEC-3402` vert ; blocage `--external`
consigné si les identifiants des fournisseurs manquent pour l'essai réel.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0007, ADR-3003, ADR-3006, ADR-3008, ADR-3011.
- Le web n'est pas modifié : Apple et Google restent propres au mobile en V1.
