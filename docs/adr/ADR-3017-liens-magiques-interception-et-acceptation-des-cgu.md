# ADR-3017 — Liens magiques de l'application mobile, interception des liens et acceptation des CGU

- **Statut** : Acceptée — précise ADR-3008 § 4 et § 5 pour le client mobile
- **Origine** : Déduite (implémentation de SPEC-3101, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-23
- **Liens** : ADR-0007, ADR-0121, ADR-3003, ADR-3005, ADR-3008, SPEC-3101

## Contexte

ADR-3008 § 4 prévoyait `signInWithOtp` avec `emailRedirectTo` = lien universel
`https://<domaine web>/auth/mobile` et repli `learny://auth/callback`, puis
`exchangeCodeForSession` (PKCE). Trois faits de l'implémentation obligent à préciser ce point :

1. Les gabarits d'e-mail du dépôt (`supabase/templates/{magic-link,confirmation}.html`) construisent
   le lien en dur sur `{{ .SiteURL }}/api/v1/auth/callback?token_hash=…&type=…` : `emailRedirectTo`
   n'a **aucun effet** sur le lien reçu, et GoTrue ne redirige donc pas vers `/auth/mobile`.
2. Le contrat `MagicLinkInput` (`packages/contracts/src/auth.ts`) n'accepte pas de `redirectTo`, et
   la piste mobile ne modifie ni l'API ni le contrat avant P35 (ADR-3001 § 4).
3. La route `GET /api/v1/auth/callback` vérifie le `token_hash` côté serveur et pose des cookies
   web : elle ne peut pas ouvrir de session dans l'application.

## Décision

1. **L'application demande son lien magique à Supabase Auth directement** (ADR-3008 § 4) avec
   `shouldCreateUser: false` et `emailRedirectTo: learny://auth/callback` ; le schéma est déclaré
   dans `supabase/config.toml` (`additional_redirect_urls`, ajout rétrocompatible). L'envoi ne crée
   jamais de compte et une adresse inconnue reçoit la même réponse affichée qu'une adresse connue
   (ADR-0121, CA-4).
2. **La route `auth/callback` accepte les deux formes de lien** : `?code=…` (PKCE, échangé par
   `exchangeCodeForSession`) et `?token_hash=…&type=magiclink|signup|email` (vérifié par
   `verifyOtp`). La seconde forme est celle des e-mails du projet ; elle est atteinte parce que
   l'application déclare les liens universels sur `/auth/mobile` **et** sur
   `/api/v1/auth/callback` (`associatedDomains` iOS, `intentFilters` Android `autoVerify`), et parce
   que le repli `learny://auth/callback` reste utilisable (`adb shell am start -d`, CL-3).
3. **L'inscription mobile est celle du mot de passe** (`POST /api/v1/auth/sign-up`, mêmes
   validations et même non-énumération que le web, EF-2) ; le lien magique est une méthode de
   connexion (EF-3). L'inscription par lien magique reste servie par le web, sans changement.
4. **La page web `apps/web/app/auth/mobile/page.tsx`** (EF-8) est une page statique minimale qui
   renvoie le même code au schéma `learny://auth/callback`. C'est, avec
   `apps/web/public/.well-known/{apple-app-site-association,assetlinks.json}`, la **seule** addition
   web de la piste mobile (ADR-3008 § 4, ADR-3001 § 7) : aucune page, aucun libellé, aucun oracle
   existant n'est modifié. L'identifiant d'équipe Apple et l'empreinte SHA-256 du certificat de
   signature sont des valeurs de publication, laissées explicites dans ces deux fichiers.
5. **Acceptation des CGU** : aucune route ne lit l'état d'acceptation, et le serveur enregistre déjà
   les versions actives à la première vérification (`packages/services/src/auth/finalize.ts`). La
   feuille d'acceptation s'ouvre donc sur le refus `422 LEGAL_ACCEPTANCE_REQUIRED`, avec **les
   versions portées par le refus** (`errors[].path = cguVersion|privacyVersion`), puis rejoue
   l'action refusée (CL-6). Aucune version n'est devinée côté client.
6. **Déconnexion** : `signOut()` appelle d'abord `POST /api/v1/auth/sign-out` (révocation du jeton de
   rafraîchissement) puis `supabase.auth.signOut({ scope: 'local' })` et purge le cache (ADR-3008
   § 6, BR-ACC-09) ; une réponse serveur en échec ne bloque jamais la déconnexion locale (c'était
   le seul point d'ADR-3008 § 6 non encore implémenté par SPEC-3003).
7. **Un seul flux `@visual`** (ADR-3015 § 5) compare la capture de l'écran de connexion à l'export
   `design/app-mobile/exports/screens/android-01-connexion.png` ; la zone des boutons Apple/Google,
   remplacée par le bouton du lien magique (ADR-3003 § 2), est l'écart attendu et documenté. Le
   chemin heureux du lien magique sur l'appareil ne peut pas lire Mailpit depuis Maestro : il est
   prouvé par le test d'intégration (vrai e-mail, vrai `token_hash`, vrai `verifyOtp`, refus du
   second usage) et le flux appareil couvre l'envoi neutre et le refus d'un lien déjà utilisé.
8. **Imports partagés** : `passwordStrength` rejoint `packages/contracts/src/password-strength.ts`
   (ajout rétrocompatible, ADR-3005 § 3) et `@learny/contracts` le réexporte ; le module web
   `apps/web/lib/auth/password-strength.ts` reste inchangé. `@learny/i18n` reçoit l'espace
   `mobile.auth`. Aucun autre paquet partagé n'est modifié.

## Conséquences

- Un lien magique demandé depuis l'application connecte l'utilisateur dès que la plateforme ouvre
  l'application sur le lien de l'e-mail ; sans interception (application absente), le lien mène au
  web, comme avant : aucun comportement web n'est modifié.
- Les gabarits d'e-mail peuvent passer à `{{ .ConfirmationURL }}` dans une spec d'infrastructure ;
  l'application accepterait alors le `code` PKCE sans changement (les deux formes sont déjà gérées).
- `signOut()` dépend désormais du client d'API pour la révocation ; son absence (tests unitaires)
  est absorbée et ne change pas la déconnexion locale.
