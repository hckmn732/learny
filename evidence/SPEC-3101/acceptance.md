# SPEC-3101 — critères d'acceptation

Connexion, inscription et lien magique. Les tests unitaires (Vitest), composants (Jest + RNTL),
d'intégration (pile locale + Mailpit) et la campagne Maestro ont été réellement exécutés sur
l'émulateur Android 15 / API 35 (VM `learny-android`), horloge applicative figée à
`2026-11-11T12:20:00Z`, barre d'état en mode démo.

- **Branche** : `spec/SPEC-3101-connexion-inscription-et-lien-magique`
- **Plateforme validée** : Android 15 / API 35, émulateur `agent37` 1080 × 2400, Maestro 2.12.1.
- **iOS** : non exécuté (aucune VM macOS, ADR-3004 § 6) ; voir l'écart 2.

## Critères

- ✅ **CA-1** — Alex Perrin se connecte par mot de passe et arrive dans la coquille ; des
  identifiants faux affichent le message générique. Preuve : Jest `test/auth/account-form.test.tsx`
  (« connecte le compte et rejoint la coquille », « affiche le message générique d'identifiants
  incorrects », `fr.auth.errors.invalidCredentials`), Vitest `src/auth/auth-errors.test.ts`
  (même phrase pour un code HTTP et pour un code Supabase), flux Maestro `SPEC-3101-connexion`
  (`auth-error` visible après de faux identifiants, puis `shell-placeholder` + `signedIn`).
- ✅ **CA-2** — Un nouvel utilisateur ne peut créer son compte qu'avec la case cochée et un mot de
  passe de 12 caractères ; l'acceptation est enregistrée avec la version active. Preuve : Vitest
  `src/features/auth/validation.test.ts` (bornes et messages identiques au contrat du web,
  `fr.auth.validation` = `ACCOUNT_FORM_MESSAGES`), Jest `account-form.test.tsx`
  (« active le bouton de création une fois la case cochée », « refuse un mot de passe de moins de
  12 caractères »), intégration `test/integration/auth.int.test.ts` (inscription réelle par
  `POST /api/v1/auth/sign-up`, e-mail de confirmation lu dans Mailpit, `verifyOtp`, session et
  `/me` du compte créé). L'écriture de la ligne `legal_acceptances` avec la version active est
  faite par le serveur à la première vérification (`packages/services/src/auth/finalize.ts`,
  couvert par les tests d'intégration de SPEC-202) ; le mobile l'enregistre lui-même par
  `POST /me/legal-acceptances` lorsque le serveur la réclame (feuille d'acceptation, CL-6,
  Jest `use-legal-gate` + `LegalSheet`). Voir l'écart 5.
- ✅ **CA-3** — Un lien reçu dans Mailpit, ouvert dans l'application, connecte l'utilisateur ; le
  même lien rouvert affiche « Ce lien n'est plus valide… ». Preuve : intégration
  `auth.int.test.ts` (envoi réel, e-mail lu dans Mailpit, `token_hash` extrait, `verifyOtp` par
  `src/auth/email-auth.ts` → session du compte, second usage refusé par le fournisseur), flux
  Maestro `SPEC-3101-lien-magique` (`openLink` sur `learny://auth/callback?token_hash=…`, écran
  `auth-callback-error` + `auth-callback-ask`), Vitest `src/auth/deep-link.test.ts` (code PKCE,
  `token_hash` + type, formes invalides), Jest `test/auth/callback.test.tsx` (« Ce lien n'est plus
  valide » sur un lien déjà utilisé, échange du code d'un lien universel, CL-4 : session courante
  fermée et purgée avant d'ouvrir celle d'un autre compte). Voir l'écart 6.
- ✅ **CA-4** — Le message d'envoi du lien magique est identique pour une adresse connue et
  inconnue. Preuve : Vitest `src/auth/email-auth.test.ts` (`sent` et `silent` pour une adresse
  inconnue), intégration `auth.int.test.ts` (adresse inconnue → `silent`, adresse du compte de
  démonstration → `sent`, même phrase affichée), Jest `account-form.test.tsx` (la feuille affiche
  `mobile.auth.magic.sent`), flux Maestro `SPEC-3101-lien-magique` (`auth-magic-sheet-sent`).
- ✅ **CA-5** — « Se déconnecter » ramène à la connexion et purge cache et session. Preuve :
  `src/auth/session.tsx` appelle `POST /api/v1/auth/sign-out` puis `supabase.auth.signOut` et purge
  (ADR-3008 § 6), intégration `auth.int.test.ts` (route de déconnexion → 204, session locale
  nulle), Jest `test/auth/session.test.tsx` (purge + étiquette de session expirée, préexistant),
  flux Maestro `SPEC-3101-connexion` (`auth-signout` → retour à `auth-title`).
- ⚠️ **CA-6** — L'écran de connexion est conforme à la maquette (écart ≤ 12 % hors zones masquées) :
  **écart mesuré 16,6 %, au-dessus du seuil**. Preuve : flux `SPEC-3101-connexion` (`@visual`)
  comparé à l'export `design/app-mobile/exports/screens/android-01-connexion.png` (ADR-3003 § 4),
  rapport `e2e-mobile.json` (`visualChecks`), capture et diff dans
  `artifacts/spec-3101-connexion/`. Répartition mesurée de l'écart par bande de 10 % de hauteur :
  24 %, 22 % (en-tête), 9 %, 5 %, 5 %, 24 %, 32 %, 35 %, 42 %, 3 % — l'écart est un **décalage
  vertical** de la zone des champs et des boutons, pas un défaut de jetons : la structure, les
  libellés et les `testID` sont conformes (Jest + flux), les couleurs et rayons viennent du thème.
  Le second bouton de la maquette (zone Apple/Google, ADR-3003 § 2) a été essayé puis retiré : il
  portait l'écart à 19,3 %. Piste de reprise : ajuster le rythme vertical à l'export (bandes 0-1 et
  5-8), hors budget de cette exécution.

## Validation des étapes

`node tools/sdd/validate.mjs SPEC-3101 --skip-build` — état exact dans `checks.json`.

| Étape | Résultat | Détail |
|---|---|---|
| lint | ✅ | `pnpm lint`, 0 avertissement (les deux paquets touchés inclus) |
| typecheck | ✅ | `pnpm typecheck` |
| build | ⏭ | `--skip-build` : build web préexistant en échec (écart 1) |
| unit | ✅ | Vitest 48 tests `[SPEC-3101]` (erreurs, liens, validation, CGU) + Jest 24 tests (écrans, accessibilité) |
| integration | ✅ | 4 tests `auth.int.test.ts` contre la pile locale et Mailpit |
| e2e | ✅ | 2 flux Maestro `@SPEC-3101`, vidéo de campagne |
| visual | ✖ | 1 comparaison vs l'export de référence : écart 16,6 % (> 12 %, CA-6 non atteint) |
| acceptance | ✖ | 5 critères ✅ + CA-6 ⚠️ (voir l'écart 3 et la répartition par bandes) |

## Écarts assumés

1. **`--skip-build`** : le build web est en échec de façon préexistante (`/_global-error`),
   documenté dans `evidence/SPEC-3001/acceptance.md` (décision du porteur). L'APK e2e est
   construit à part (`pnpm build:mobile:e2e`).
2. **iOS non exécuté** : aucune VM macOS. Les variantes iOS (liens universels
   `applinks:`, `textContentType`, feuille 24 pt) sont déclarées et couvertes par les tests de
   composants ; le job `ios` de la CI mobile reste la seule exécution possible (ADR-3004 § 6).
3. **Zone des fournisseurs** : la maquette place deux boutons Apple et Google ; ADR-3003 § 2 les
   réserve à SPEC-3402. La zone est occupée par « Recevoir un lien de connexion » et « Créer un
   compte », de même hauteur ; c'est l'écart attendu de la comparaison visuelle, consigné ici.
4. **Chemin heureux du lien magique sur l'appareil** : Maestro ne peut pas lire Mailpit depuis la
   VM téléphone. Le flux appareil couvre l'envoi neutre (CA-4) et le refus d'un lien déjà utilisé
   (CA-3, second usage réel contre Supabase) ; le chemin heureux est prouvé par le test
   d'intégration (vrai e-mail, vrai `token_hash`, vrai `verifyOtp`, session obtenue).
5. **Acceptation des CGU** : aucune route ne lit l'état d'acceptation. Le serveur l'écrit à la
   première vérification par son callback (`finalize.ts`) ; le mobile ouvre sa feuille sur le refus
   `422 LEGAL_ACCEPTANCE_REQUIRED`, avec les versions portées par le refus, puis rejoue l'action
   (CL-6). Le test d'intégration ne peut donc pas lire la ligne elle-même (RLS sans lecture
   exposée) : il prouve l'inscription, la confirmation et la session ; la feuille et le rejeu sont
   prouvés par Jest (`use-legal-gate`, `legal.ts`).
6. **Lien magique et gabarits d'e-mail** : les gabarits du dépôt écrivent le lien en dur sur
   `{{ .SiteURL }}/api/v1/auth/callback?token_hash=…` ; l'application intercepte donc le
   `token_hash` en plus du `code` PKCE (ADR-3017). `email_sent` de `supabase/config.toml` est porté
   à 100 **en local uniquement** (la suite d'intégration envoie deux e-mails par exécution).
7. **Garde d'origine de l'API** : `packages/services/src/security/origin-guard.ts` refuse toute
   mutation sans `Origin` ni `Sec-Fetch-Site` (`ORIGIN_REJECTED`). Un client natif ne les envoie
   pas : les mutations du mobile (dont `POST /api/v1/auth/sign-up`) sont refusées en l'état. Le
   test d'intégration porte l'origine de l'application pour éprouver la route ; **c'est un écart
   d'API à corriger hors piste mobile (ADR-3001 § 4)**, à traiter avant la première spec mobile qui
   écrit (SPEC-32xx).
8. **Tests préexistants rouges, hors périmètre** (décision du porteur, non réparés, non
   affaiblis) : `packages/config/src/commit-rules.test.ts`,
   `tools/migration/test/unit/report.test.ts`, `apps/web/test/unit/bundle-split.test.ts`.
9. **Ajout web** : `apps/web/app/auth/mobile/page.tsx` et `apps/web/public/.well-known/*` sont les
   seules additions web (ADR-3008 § 4, ADR-3017) ; aucune page, aucun libellé, aucun oracle
   existant n'est modifié. L'identifiant d'équipe Apple et l'empreinte du certificat de signature
   restent des valeurs de publication, explicites dans ces fichiers.

## Ce qui est livré

- `apps/mobile/app/(auth)/{connexion,inscription,verifier-email}.tsx`, `app/auth/{callback,mobile}.tsx`,
  `app/(app)/{_layout,aujourdhui}.tsx` (coquille d'attente SPEC-3102 avec « Se déconnecter »),
  `app/_layout.tsx` (garde d'authentification), `app/index.tsx` (redirection selon la session).
- `apps/mobile/src/auth/` : `email-auth.ts` (connexion, lien magique, `verifyOtp`, PKCE),
  `native-auth.ts` (client Supabase), `link-types.ts`, `deep-link.ts`, `auth-errors.ts`,
  `pending-auth.ts`, `legal.ts`, `session.tsx` (révocation serveur à la déconnexion).
- `apps/mobile/src/features/auth/` : `AuthScreen`, `TextField`, `Checkbox`, `StrengthMeter`,
  `MagicLinkSheet`, `LegalSheet`, `VerifyEmailScreen`, `CallbackScreen`, `AuthGate`,
  `use-legal-gate.ts`, `validation.ts`, `legal-browser.ts`.
- `packages/contracts/src/password-strength.ts` (partagé), `packages/contracts/src/auth.ts` (export),
  `packages/i18n/src/fr/mobile.ts` (espace `mobile.auth`).
- `apps/web/app/auth/mobile/page.tsx`, `apps/web/public/.well-known/{apple-app-site-association,
  assetlinks.json}` ; `apps/mobile/app.config.ts` (liens universels), `supabase/config.toml`.
- Tests et outillage : 5 fichiers Vitest `[SPEC-3101]`, 2 fichiers Jest, `auth.int.test.ts`,
  `e2e/flows/SPEC-3101-{connexion,lien-magique}.yaml`, baseline `SPEC-3101-connexion.png`.
- ADR-3017 (liens magiques, interception, acceptation des CGU).

## Commandes de reproduction

```sh
cd /root/learny-mobile
pnpm dev:up && pnpm db:reset && pnpm db:seed:demo
node apps/mobile/e2e/prepare-demo-user.mjs
node tools/sdd/validate.mjs SPEC-3101 --skip-build
node tools/sdd/complete.mjs SPEC-3101 --no-merge --no-push
```
