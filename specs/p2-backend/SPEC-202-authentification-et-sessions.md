---
id: SPEC-202
title: Authentification et sessions
phase: P2
priority: V1
depends_on: [SPEC-201, SPEC-102]
business_rules: [BR-ACC-01, BR-ACC-03, BR-ACC-09]
screens: []
adrs: [ADR-0007, ADR-0121]
visual: demo
---

# SPEC-202 — Authentification et sessions

## 1. Objectif

Livrer l'authentification serveur de Learny avec Supabase Auth et `@supabase/ssr` : routes `/api/v1/auth/*` (lien magique, inscription et connexion par mot de passe, renvoi limité, rappel du lien, déconnexion), gabarits français des e-mails d'authentification, middleware qui rafraîchit la session et protège les pages (non connecté → `/connexion`, onboarding inachevé → `/premiers-pas/<étape>`), et l'événement `user/signed-up`. Les écrans (SCR-01) sont livrés par SPEC-601 ; ici tout est démontré par la page `/_dev/sdd/SPEC-202`.

## 2. Contexte

- ADR-0007 : lien magique 1 h à usage unique, mot de passe ≥ 12, confirmation obligatoire, renvoi toutes les 60 s, e-mails via SMTP Resend (production) ou Mailpit (local).
- Inventaire : `docs/architecture/api.md` §2 (ligne Authentification) ; écrans et routes : `docs/product/screens.md` (SCR-01, SCR-02) ; maquette de référence des textes : `design/maquettes/Inscription.dc.html` (étapes Compte et Vérification).
- Profil créé par trigger à l'insertion dans `auth.users` (SPEC-102) avec `onboarding_step = 'profil'`.
- Documents : `docs/product/business-rules.md` (ACC), `docs/architecture/data-model.md` §1 et §11, ADR-0007, ADR-0030, ADR-0045, ADR-0121.

## 3. Dépendances

- **SPEC-201** : `handler()`, `defineRoute`, `AppError`, catalogue d'erreurs, client typé, `getSessionUser`.
- **SPEC-102** : `profiles` (`onboarding_step`, `timezone`, `terms_version`, `terms_accepted_at`, `deletion_scheduled_for`) et trigger de création.
- Déjà présents (P0/P1) : `@learny/jobs` (client Inngest, SPEC-007) pour émettre l'événement ; `legal_acceptances` (SPEC-112) ; `supabase/config.toml` (SPEC-008) ; Mailpit local (SPEC-008) ; `@learny/testing` (`mail.ts` : lecture de Mailpit).
- Bibliothèques : `@supabase/ssr` ≥ 0.6, `@supabase/supabase-js` ≥ 2.
- Variables : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `MAILPIT_URL` (test, défaut `http://127.0.0.1:8025`). Production : SMTP Resend configuré dans le projet Supabase Cloud (SPEC-013/808) ; absent → blocage externe documenté, jamais simulé en production.

## 4. Règles métier couvertes

- **BR-ACC-01** : lien magique (`signInWithOtp`, `otp_expiry = 3600` s, usage unique natif de GoTrue) ou e-mail + mot de passe (`minimum_password_length = 12` côté Supabase **et** schéma Zod `min(12)`, aucune règle de composition ; l'indicateur de solidité est côté interface, SPEC-601).
- **BR-ACC-03** : `enable_confirmations = true` ; aucune session n'est délivrée avant vérification ; renvoi via `POST /auth/resend`, refusé moins de 60 s après le précédent envoi (`max_frequency = "60s"` côté Supabase, traduit en `429 RESEND_TOO_SOON` avec `Retry-After`).
- **BR-ACC-09** : `POST /auth/sign-out` ferme la session (cookies supprimés) ; le client redirige vers `/connexion`.

## 5. Exigences fonctionnelles

- **EF-1** Inscription par lien magique : `POST /api/v1/auth/magic-link` `{ email, mode: 'sign-up', acceptedTerms: true, timezone }` → 202 ; GoTrue crée le compte non vérifié et envoie le gabarit `confirmation` (« Confirmez votre adresse e-mail », lien `type=signup`) ; le lien est valable 1 heure, une seule fois, et sa vérification vaut connexion. Pour une adresse déjà inscrite, le gabarit `magic_link` est envoyé à la place (même réponse 202).
- **EF-2** Connexion par lien magique : même route avec `mode: 'sign-in'` → 202 ; si l'adresse est inconnue, la réponse est identique (202) et aucun e-mail n'est envoyé (pas d'énumération des comptes).
- **EF-3** Inscription par mot de passe : `POST /api/v1/auth/sign-up` `{ email, password, acceptedTerms: true, timezone }` → 201 `{ status: 'confirmation_sent' }` ; e-mail « Confirmez votre adresse e-mail » ; adresse déjà inscrite → même réponse (non-énumération), aucun second compte.
- **EF-4** Connexion par mot de passe : `POST /api/v1/auth/sign-in` `{ email, password }` → 200 `{ destination }` et cookies de session ; mauvais couple → `401 INVALID_CREDENTIALS` (« Adresse e-mail ou mot de passe incorrect. ») ; e-mail non vérifié → `403 EMAIL_NOT_CONFIRMED` (« Vérifiez votre adresse e-mail avant de vous connecter. »).
- **EF-5** Renvoi : `POST /api/v1/auth/resend` `{ email, kind: 'signup' | 'magic_link' }` → 202 ; dans les 60 s suivant un envoi → `429 RESEND_TOO_SOON`, `Retry-After: <secondes restantes>`, détail « Vous pourrez renvoyer le lien dans N secondes. ».
- **EF-6** Rappel du lien : `GET /api/v1/auth/callback?token_hash=…&type=magiclink|signup|email&next=…` vérifie le jeton, pose les cookies et redirige (302) vers la destination (EF-8). Jeton expiré, déjà utilisé ou invalide → 302 vers `/connexion?erreur=lien-invalide`.
- **EF-7** Déconnexion : `POST /api/v1/auth/sign-out` → 204, cookies Supabase et cookie `lr-onboarded` supprimés.
- **EF-8** Destination après authentification (`resolvePostAuthDestination`) : `deletion_scheduled_for` non nul → `/parametres#profil` (SPEC-707/211 y proposent l'annulation) ; sinon `onboarding_step ∈ {profil, rythme, ia}` → `/premiers-pas/<onboarding_step>` ; sinon `next` s'il est un chemin relatif sûr (commence par `/`, pas par `//`, sans `\`, longueur ≤ 512) ; sinon `/accueil`.
- **EF-9** Middleware des pages : non connecté sur une page protégée → 307 vers `/connexion?suite=<chemin encodé>` ; connecté sur `/connexion` ou `/inscription` → 307 vers la destination ; connecté dont l'onboarding n'a pas franchi l'étape IA, sur une page applicative hors `/premiers-pas/*` → 307 vers `/premiers-pas/<étape>`.
- **EF-10** À la première vérification réussie d'un compte, l'acceptation des CGU et de la politique de confidentialité (version courante) est enregistrée et l'événement `user/signed-up` est émis une seule fois.

## 6. Exigences techniques

**ET-1 — Contrats** (`packages/contracts/src/auth.ts`) :
```ts
const Email = z.string().trim().toLowerCase().email().max(254);
const Timezone = z.string().max(64).refine(isValidIanaZone, 'Fuseau horaire inconnu');
export const MagicLinkInput = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('sign-up'), email: Email, acceptedTerms: z.literal(true), timezone: Timezone.optional() }),
  z.object({ mode: z.literal('sign-in'), email: Email, next: z.string().max(512).optional() }),
]);
export const SignUpInput = z.object({ email: Email, password: z.string().min(12).max(72),
  acceptedTerms: z.literal(true), timezone: Timezone.optional() });
export const SignInInput = z.object({ email: Email, password: z.string().min(1).max(72), next: z.string().max(512).optional() });
export const ResendInput = z.object({ email: Email, kind: z.enum(['signup', 'magic_link']) });
export const SignInOutput = z.object({ destination: z.string() });
```
`isValidIanaZone(z)` = `Intl.supportedValuesOf('timeZone').includes(z) || z === 'UTC'` (dans `@learny/core/time`, créé ici s'il n'existe pas ; SPEC-207 le reprend).

**ET-2 — Routes** (toutes `auth: 'public'`, `rateLimit: 'auth'`, non idempotentes) :
| Méthode et chemin | Entrée | Succès | Erreurs |
|---|---|---|---|
| POST `/api/v1/auth/magic-link` | `MagicLinkInput` | 202 `Empty` | 400, 429 `RESEND_TOO_SOON`, 429 `RATE_LIMITED`, 503 |
| POST `/api/v1/auth/sign-up` | `SignUpInput` | 201 `{ status: 'confirmation_sent' }` | 400, 429, 503 |
| POST `/api/v1/auth/sign-in` | `SignInInput` | 200 `SignInOutput` | 400, 401 `INVALID_CREDENTIALS`, 403 `EMAIL_NOT_CONFIRMED`, 429, 503 |
| POST `/api/v1/auth/resend` | `ResendInput` | 202 | 400, 429 `RESEND_TOO_SOON`, 503 |
| POST `/api/v1/auth/sign-out` | — | 204 | — (sans session : 204) |
| GET `/api/v1/auth/callback` | query `token_hash` (1..512), `type`, `next?` | 302 | 302 vers `/connexion?erreur=lien-invalide` |
Codes ajoutés au catalogue : `INVALID_CREDENTIALS` (401, « Identifiants incorrects »), `RESEND_TOO_SOON` (429, « Renvoi trop rapproché »).
Correspondance des erreurs GoTrue : `invalid_credentials` → 401 ; `email_not_confirmed` → 403 ; `over_email_send_rate_limit` ou message « only request this after N seconds » → 429 `RESEND_TOO_SOON` (`Retry-After = N`, défaut 60) ; `otp_disabled`/`signup_disabled` en mode `sign-in` (adresse inconnue) → 202 silencieux ; erreur réseau/5xx GoTrue → `503 SERVICE_UNAVAILABLE`.

**ET-3 — Clients Supabase** (`apps/web/lib/supabase/`) : `server.ts` (`createServerClient` avec `cookies()` de Next, `getAll`/`setAll`), `middleware.ts` (variante pour `NextRequest`/`NextResponse`), `admin.ts` (clé service, **uniquement** dans `packages/services/src/auth/finalize.ts`). Cookies : `httpOnly`, `secure` hors `localhost`, `sameSite: 'lax'`, `path: '/'`.

**ET-4 — Services** (`packages/services/src/auth/`) :
```ts
export function requestMagicLink(ctx, input: MagicLinkInput): Promise<Result<void>>;
export function signUpWithPassword(ctx, input: SignUpInput): Promise<Result<{ status: 'confirmation_sent' }>>;
export function signInWithPassword(ctx, input: SignInInput): Promise<Result<{ destination: string }>>;
export function resendLink(ctx, input: ResendInput): Promise<Result<void>>;
export function finalizeFirstVerification(sctx: SystemContext, userId: string): Promise<{ firstTime: boolean }>;
export function resolvePostAuthDestination(profile: { onboardingStep; deletionScheduledFor }, next?: string): string;
```
`emailRedirectTo` = `${NEXT_PUBLIC_APP_URL}/api/v1/auth/callback` (+ `?next=` encodé pour la connexion). Les métadonnées d'inscription sont passées dans `options.data` : `{ signup: { termsAcceptedAt: clock.now().toISOString(), cguVersion, privacyVersion, timezone } }` (versions lues dans `packages/config/src/product.ts`, constante `LEGAL_VERSIONS = { cgu: '2026-11-11', privacy: '2026-11-11' }`, à créer si absente ; SPEC-806 la fait évoluer).
`finalizeFirstVerification` (appelé par le rappel et par la connexion par mot de passe) : en transaction `serviceDb()`, si aucune ligne `legal_acceptances` pour l'utilisateur : insère `cgu` et `privacy` avec versions et `accepted_at` des métadonnées, met à jour `profiles.terms_version` (`cgu:<v>;privacy:<v>`), `terms_accepted_at` et `timezone` (si fournie et valide, sinon laisse `Europe/Paris`) ; puis, après commit, émet `user/signed-up` avec l'identifiant d'événement `user-signed-up:<userId>` (déduplication Inngest). Renvoie `firstTime`.

**ET-5 — Événement** : `user/signed-up` `{ userId: uuid, method: 'magic_link' | 'password', signedUpAt: IsoDateTime }`, envoyé par `inngest.send` du client de `@learny/jobs` ; SPEC-203 l'intègre au catalogue typé et remplace l'appel par `emitAfterCommit`. Aucun consommateur n'est livré ici (l'e-mail de bienvenue est SPEC-204).

**ET-6 — Middleware** (`apps/web/middleware.ts`) : `matcher` excluant `_next/static`, `_next/image`, fichiers avec extension, `/api/inngest`, `/api/v1/webhooks/*`. Étapes : 1) rafraîchir la session (`auth.getUser()`), recopier les cookies sur la réponse ; 2) chemins `/api/*` : rien d'autre ; 3) chemins publics : `/`, `/connexion`, `/inscription`, `/verifier-email`, `/legal/*`, `/invitation/*`, `/hors-ligne`, `/_dev/*` (si `ENABLE_SDD_PAGES`), `/openapi.json` ; 4) page protégée sans utilisateur → `/connexion?suite=` ; 5) onboarding : si le cookie `lr-onboarded` vaut l'identifiant de l'utilisateur, passer ; sinon lire `profiles.onboarding_step` (client utilisateur, RLS) ; étape ∈ {`rappels`, `depart`, `done`} → poser `lr-onboarded=<userId>` (httpOnly, 1 an) et passer ; sinon rediriger hors `/premiers-pas/*`. `/` redirige vers `/accueil` (connecté) ou `/connexion`.

**ET-7 — Configuration Supabase** (`supabase/config.toml`) : `[auth] site_url = "http://localhost:3000"`, `additional_redirect_urls = ["http://localhost:3000/api/v1/auth/callback"]`, `minimum_password_length = 12`, `password_requirements = ""` ; `[auth.email] enable_signup = true`, `enable_confirmations = true`, `double_confirm_changes = true`, `otp_expiry = 3600`, `max_frequency = "60s"` ; `[auth.email.smtp]` vers Mailpit (`host = "host.docker.internal"`, `port = 1025`, `admin_email = "no-reply@learny.local"`, `sender_name = "Learny"`) si SPEC-008 ne l'a pas déjà fait ; gabarits :
| Gabarit | Sujet | Fichier |
|---|---|---|
| `magic_link` | Votre lien de connexion à Learny | `supabase/templates/magic-link.html` |
| `confirmation` | Confirmez votre adresse e-mail | `supabase/templates/confirmation.html` |
Corps (HTML simple, polices système, bouton noir `#111113` texte blanc, rayon 12 px) : magic link — « Bonjour, voici votre lien pour vous connecter à Learny. Il est valable 1 heure et ne fonctionne qu'une fois. » + bouton « Me connecter » vers `{{ .SiteURL }}/api/v1/auth/callback?token_hash={{ .TokenHash }}&type=magiclink` ; confirmation — « Bienvenue sur Learny. Confirmez votre adresse pour activer votre compte : le lien est valable 1 heure. » + bouton « Confirmer mon adresse » (`type=signup`). Pied commun : « Vous n'êtes pas à l'origine de cette demande ? Ignorez ce message. » et lien « Gérer mes notifications » vers `{{ .SiteURL }}/parametres#notifications` (BR-NOT-08). Les mêmes fichiers sont poussés en production par le script de déploiement (SPEC-013).

**ET-8 — Sécurité** : aucune information d'existence de compte divulguée (EF-2, EF-3) ; `next` filtré (redirection ouverte impossible) ; temps de réponse de `magic-link` non dépendant de l'existence du compte (appel GoTrue systématique) ; journaux sans e-mail ni mot de passe (seulement `userId` quand connu).

## 7. Comportements attendus et cas limites

- **CL-1 Lien magique réutilisé** : second clic → `/connexion?erreur=lien-invalide`.
- **CL-2 Lien expiré** (horloge GoTrue : jeton vieux de > 3600 s, simulé en test en mettant `otp_expiry = 2` dans une instance dédiée, ou par un jeton déjà consommé) → même redirection.
- **CL-3 Double soumission du formulaire de lien magique** en < 60 s → le second appel renvoie `429 RESEND_TOO_SOON`, un seul e-mail dans Mailpit.
- **CL-4 Redirection ouverte** : `next=//evil.example` ou `next=https://evil.example` → ignoré, destination par défaut.
- **CL-5 Onboarding interrompu à l'étape `rythme`** : connexion → `/premiers-pas/rythme` ; tentative d'ouvrir `/agenda` → redirection vers `/premiers-pas/rythme`.
- **CL-6 Compte en suppression programmée** : connexion → `/parametres#profil`.
- **CL-7 GoTrue indisponible** (arrêt du conteneur auth en test d'intégration simulé par une URL injoignable) → `503 SERVICE_UNAVAILABLE`, aucun cookie posé.
- **CL-8 Double vérification concurrente** (deux onglets) → `finalizeFirstVerification` idempotent (verrou `select … for update` sur `profiles`) : une seule paire `legal_acceptances`, un seul événement (identifiant d'événement dédupliqué).
- **CL-9 Fuseau invalide** fourni à l'inscription → 400 `VALIDATION_FAILED` (`body.timezone`).
- **CL-10 Déconnexion sans session** → 204 (idempotente).

## 8. Instructions d'implémentation

1. Mettre à jour `supabase/config.toml` (ET-7), écrire `supabase/templates/magic-link.html` et `confirmation.html`. Commit `feat(SPEC-202): configuration et gabarits Supabase Auth`.
2. Écrire `packages/contracts/src/auth.ts` et l'enregistrer dans `routes.ts` ; ajouter les codes au catalogue.
3. Écrire `apps/web/lib/supabase/{server,middleware,admin}.ts`.
4. Écrire `packages/services/src/auth/{magic-link,password,resend,finalize,destination}.ts` et la table de correspondance des erreurs GoTrue (`gotrue-errors.ts`). Commit `feat(SPEC-202): services d'authentification`.
5. Écrire les routes `apps/web/app/api/v1/auth/{magic-link,sign-up,sign-in,resend,sign-out,callback}/route.ts` (callback : route Next native, pas `handler()`, car elle redirige ; elle réutilise `requestId` et le journal).
6. Écrire `apps/web/middleware.ts`. Commit `feat(SPEC-202): routes auth et middleware`.
7. Page de démonstration (section 10) et helpers de test : `packages/testing/src/auth.ts` (`signInAs(page, user)` qui pose les cookies d'une session de fabrique ; `latestMail(to)` via Mailpit si absent).
8. Tests (section 12). Commit `test(SPEC-202): parcours d'authentification`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/auth.ts`, `packages/services/src/auth/*.ts`, `apps/web/lib/supabase/{server,middleware,admin}.ts`, `apps/web/app/api/v1/auth/*/route.ts`, `apps/web/middleware.ts`, `supabase/templates/{magic-link,confirmation}.html`, `apps/web/components/sdd/Spec202Demo.tsx`, `packages/testing/src/auth.ts`.
- **Modifiés** : `supabase/config.toml`, `packages/core/src/errors.ts` (2 codes), `packages/contracts/src/routes.ts`, `packages/config/src/product.ts` (`LEGAL_VERSIONS` si absent), `apps/web/public/openapi.json` (régénéré).
- **Lus** : `profiles`, `legal_acceptances`, client Inngest `@learny/jobs`, `handler()`.

## 10. Interface et conformité visuelle

Mode `demo`. Page `/_dev/sdd/SPEC-202` :
1. `h1` « SPEC-202 — Authentification et sessions ».
2. Carte « État de la session » (`data-testid="auth-session"`) : « Non connecté » ou « Connecté : <userId> · étape d'onboarding <étape> ».
3. Carte « Lien magique » : champ « Adresse e-mail » (`auth-email`), boutons « Créer un compte par lien » et « Me connecter par lien », message de résultat (`auth-result`, `role="status"`) : « Lien envoyé. Il reste valable 1 heure. » ; erreur 429 affichée « Vous pourrez renvoyer le lien dans N secondes. » avec compte à rebours.
4. Carte « Mot de passe » : champs e-mail et « Mot de passe » (12 caractères au moins), boutons « Créer un compte » et « Me connecter ».
5. Carte « Destination » : liste des cas de `resolvePostAuthDestination` calculés côté serveur (tableau `auth-destinations`).
6. Bouton « Se déconnecter » (`auth-sign-out`).
Contrôles visuels : jetons (fond `#F4F4F1`, cartes blanches bordure `#E7E6E1`, bouton principal `#111113` texte blanc, polices Inter/Space Grotesk), ordre des cartes, `toHaveScreenshot` (`maxDiffPixelRatio: 0.01`). Accessibilité : `label` associés, résultats `aria-live`, axe sans violation serious/critical.

## 11. Critères d'acceptation

- **CA-1** Inscription par lien magique de bout en bout : e-mail reçu dans Mailpit avec le sujet « Confirmez votre adresse e-mail » (nouvelle adresse) ou « Votre lien de connexion à Learny » (adresse existante), clic → session active, redirection `/premiers-pas/profil`, deux lignes `legal_acceptances`, un événement `user/signed-up`.
- **CA-2** Inscription par mot de passe : < 12 caractères → 400 ; ≥ 12 → e-mail de confirmation ; connexion avant confirmation → 403 `EMAIL_NOT_CONFIRMED` ; après → 200 et cookies.
- **CA-3** Un second envoi dans les 60 s renvoie 429 `RESEND_TOO_SOON` avec `Retry-After` entre 1 et 60, et Mailpit ne contient qu'un message.
- **CA-4** Un lien magique déjà utilisé ou invalide redirige vers `/connexion?erreur=lien-invalide`.
- **CA-5** Le middleware redirige : page protégée sans session → `/connexion?suite=…` ; onboarding à `rythme` → `/premiers-pas/rythme` ; `next` externe ignoré.
- **CA-6** La déconnexion renvoie 204, supprime les cookies et une requête ultérieure à une route `auth: 'user'` renvoie 401.
- **CA-7** Aucune réponse ne révèle l'existence d'un compte (mêmes statut et corps pour adresse connue et inconnue en `sign-in` par lien et en `sign-up`).

## 12. Plan de tests

- **Unitaires** : `packages/services/src/auth/destination.test.ts` — `describe('[SPEC-202] destination après authentification')` : table des cas (suppression, chaque étape, `next` sûr/dangereux). `gotrue-errors.test.ts` — `[SPEC-202] correspondance des erreurs` : chaque erreur GoTrue → code, `Retry-After` extrait. `packages/contracts/src/auth.test.ts` — `[SPEC-202] contrats` : mot de passe 11/12 caractères, `acceptedTerms` obligatoire, fuseau invalide. `apps/web/middleware.test.ts` — `[SPEC-202] middleware` (requêtes simulées) : chemins publics, redirections, cookie `lr-onboarded`.
- **Intégration** (`packages/services/test/integration/auth.test.ts`, Supabase local + Mailpit) — `describe('[SPEC-202] authentification')` : inscription mot de passe → mail → vérification via `token_hash` extrait du message → `finalizeFirstVerification` (legal_acceptances, timezone, événement capturé par l'espion du client Inngest) ; double finalisation concurrente → une seule ligne/événement ; 429 au second renvoi ; adresse inconnue en `sign-in` → 202 et aucun e-mail ; 401/403 ; callback invalide → 302 `lien-invalide`.
- **End-to-end** (`apps/web/e2e/specs/p2/spec-202-auth.spec.ts`, vidéo) : `test('inscription et connexion par lien magique puis déconnexion @SPEC-202', …)` : `/_dev/sdd/SPEC-202`, saisie d'une adresse unique, « Créer un compte par lien », lecture du lien dans Mailpit, navigation vers le lien, arrivée sur `/premiers-pas/profil`, retour à la page de démonstration (« Connecté »), « Se déconnecter », tentative `/accueil` → `/connexion?suite=%2Faccueil`. `test('mot de passe et renvoi limité @SPEC-202', …)`.
- **Visuel** : `test('page de démonstration SPEC-202 @SPEC-202 @visual', …)` : `expectTokens`, structure, `toHaveScreenshot`.
- **Non-régression** : `@SPEC-201`, `[SPEC-102]` (trigger profil), `@SPEC-006`.
- **Traçabilité** :
| Critère | Tests |
|---|---|
| CA-1 | int inscription ; e2e lien magique |
| CA-2 | int mot de passe ; e2e mot de passe ; unit contrats |
| CA-3 | int renvoi ; e2e renvoi |
| CA-4 | int callback invalide |
| CA-5 | unit middleware, destination ; e2e redirection `/accueil` |
| CA-6 | e2e déconnexion ; int 401 après déconnexion |
| CA-7 | int non-énumération |

## 13. Preuves attendues

Vidéos des deux tests e2e, capture de l'e-mail rendu par Mailpit (`screenshots/mail-magic-link.png`), capture de la page après connexion, ligne de base visuelle, rapports.

## 14. Définition de terminé

Définition commune (`docs/engineering/testing.md` §7) ; en plus : `supabase db reset` applique la configuration sans erreur, les gabarits HTML passent la validation `html-validate` (ajoutée aux tests unitaires), aucune clé service importée hors `packages/services/src/auth/finalize.ts`.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0007, ADR-0030 (fuseau détecté à l'inscription), ADR-0045 (acceptation enregistrée), ADR-0032 (lien de préférences dans les e-mails), ADR-0022 (clé service limitée).
- **Décision créée** : ADR-0121 « Flux d'authentification et redirections » — jeton `token_hash` vérifié côté serveur, non-énumération, acceptation légale et fuseau transmis en métadonnées puis enregistrés à la première vérification, `user/signed-up` émis après vérification (une fois), accès à l'application dès l'étape `rappels`, redirection des comptes en suppression programmée vers `/parametres#profil`.
- **Décision créée** : ADR-0252 « Authentification : proxy Next 16, redirection relative, mail local et rappel du lien » (`middleware.ts` devient `proxy.ts` fusionné avec la garde SDD, `next` porté par le cookie `lr-next`, rappel en 302 relatif, Mailpit du CLI Supabase en local, `/` public jusqu'à SPEC-601).
- Hypothèse : la limite de 60 s est appliquée par GoTrue (`max_frequency`) ; la limitation par IP (10/min) devient effective avec SPEC-208 sans modification des routes.
