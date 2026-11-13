---
id: SPEC-601
title: Inscription, connexion et vérification de l'e-mail
phase: P6
priority: V1
depends_on: [SPEC-202, SPEC-308, SPEC-302]
business_rules: [BR-ACC-01, BR-ACC-02, BR-ACC-03]
screens: [SCR-01]
adrs: [ADR-0007, ADR-0045, ADR-0161, ADR-0168]
visual: mockup
---

# SPEC-601 — Inscription, connexion et vérification de l'e-mail

## 1. Objectif

Livrer les écrans `/inscription`, `/connexion` et `/verifier-email` conformes à `design/maquettes/Inscription.dc.html` (étapes « Compte » et « Vérification », et mode `?connexion`) : choix entre lien magique et mot de passe, indicateur de solidité, acceptation obligatoire des CGU et de la politique de confidentialité, messages d'erreur, renvoi du lien limité à un toutes les 60 s et bascule inscription ↔ connexion. Les écrans s'appuient exclusivement sur le service d'authentification de SPEC-202.

## 2. Contexte

Premier écran du parcours (SCR-01, `docs/product/screens.md` §1). Il précède les « Premiers pas » (SPEC-602). La logique d'authentification (Supabase Auth, `@supabase/ssr`, routes `/api/v1/auth/*`, callback, middleware) est livrée par SPEC-202 ; la mise en page divisée (panneau sombre Learny + colonne de contenu) par SPEC-308 ; les composants de saisie par SPEC-302.

À lire : `design/maquettes/Inscription.dc.html` (blocs `isCompte`, `isMail`, script `renderVals` : `methods`, `strength`, `submitCompte`, `mailText`, `stepDots`), `docs/product/business-rules.md` §ACC, `docs/architecture/api.md` (routes `/auth/*`), ADR-0007, ADR-0045, `docs/engineering/conventions.md` §4–5, `docs/engineering/testing.md` §3 et §6.

## 3. Dépendances

- **SPEC-202** (done) : routes `POST /api/v1/auth/magic-link`, `POST /api/v1/auth/sign-up`, `POST /api/v1/auth/sign-in`, `POST /api/v1/auth/resend`, `GET /api/v1/auth/callback` ; middleware (non connecté → `/connexion`, onboarding inachevé → `/premiers-pas/<étape>`) ; événement `user/signed-up` ; limitation 60 s du renvoi ; durée du lien 1 h.
- **SPEC-308** (done) : composant `AuthLayout` (panneau `aside` sombre `#111113` + `main`), pages système.
- **SPEC-302** (done) : `Button`, `TextField`, `Checkbox`, `FormField` (erreurs `role="alert"`), `Link` ; `react-hook-form` + résolveur Zod (ADR-0064).
- **SPEC-112** (via SPEC-202) : table `legal_acceptances` ; **SPEC-102** : colonnes `profiles.terms_version`, `profiles.terms_accepted_at`, `profiles.timezone`.
- **SPEC-204/Mailpit** : e-mails d'authentification (transport `memory` en test, inspectable via `packages/testing/src/mail.ts`).
- Externes : Supabase Auth (local via Supabase CLI). Aucun appel IA. Aucun mode mock nécessaire en dehors de Mailpit/transport mémoire.

Contrat attendu de SPEC-202 (s'il diffère sur un nom de champ, SPEC-601 adapte son client sans changer le comportement décrit ici, et le signale dans son rapport) :

| Route | Corps | Réponse |
|---|---|---|
| `POST /auth/magic-link` | `{ email, intent: 'signup'|'login', termsAccepted?: true, termsVersion?: string, timezone?: string }` | `202 {}` (toujours, même si l'adresse est inconnue en connexion) |
| `POST /auth/sign-up` | `{ email, password, termsAccepted: true, termsVersion, timezone }` | `202 {}` (e-mail de confirmation envoyé) |
| `POST /auth/sign-in` | `{ email, password }` | `200 { redirectTo }` ; `401 INVALID_CREDENTIALS` ; `403 EMAIL_NOT_CONFIRMED` |
| `POST /auth/resend` | `{ email, kind: 'magic_link'|'confirmation' }` | `202 { retryAfterSec: 60 }` ; `429 RATE_LIMITED` (`Retry-After`) |

## 4. Règles métier couvertes

- **BR-ACC-01** — Deux méthodes, présentées comme un `radiogroup` « Façon de se connecter » : « Recevoir un lien de connexion » (lien valable 1 h, usage unique, porté par SPEC-202) et « Choisir un mot de passe » / « Avec mon mot de passe ». Le mot de passe d'inscription exige 12 caractères au moins, sans autre contrainte ; un indicateur de solidité à 4 barres et un texte d'aide sont affichés à l'inscription uniquement.
- **BR-ACC-02** — À l'inscription, une case à cocher non pré-cochée « J'accepte les conditions d'utilisation et la politique de confidentialité… » est obligatoire ; la version des documents (`LEGAL_DOCUMENTS_VERSION`) et la date d'acceptation sont transmises et enregistrées (deux lignes `legal_acceptances` `cgu` et `privacy` + `profiles.terms_version/terms_accepted_at`).
- **BR-ACC-03** — L'adresse doit être vérifiée avant tout accès : après l'envoi, l'écran « Vérifiez votre boîte mail » s'affiche ; le lien peut être renvoyé, au plus une fois toutes les 60 s (bouton désactivé avec compte à rebours, et refus serveur 429 sinon).

## 5. Exigences fonctionnelles

- **EF-1 — Routes.** `/inscription` (mode inscription), `/connexion` (mode connexion, équivalent `?connexion` de la maquette), `/verifier-email` (étape « Vérification »). Un utilisateur déjà connecté qui ouvre l'une de ces routes est redirigé par le middleware de SPEC-202 (`/premiers-pas/<étape>` si l'onboarding n'a pas franchi l'étape IA, sinon `/accueil`).
- **EF-2 — Panneau latéral** (`aside aria-label="Learny"`) : logo + « Learny » ; titre « Apprenez vite. » / « Retenez longtemps. » (retour à la ligne) ; paragraphe « Un tuteur IA conçoit votre parcours, transforme vos ressources en cours, vous entraîne et vous fait réviser au bon moment. » ; liste à coches : « Des cours construits à partir de vos propres ressources, sources citées », « Des révisions espacées pour ne pas oublier », « Gratuit avec votre propre clé d'IA » ; compteur d'étapes et 7 segments (`ol aria-label="Étapes de l'inscription"`), libellés accessibles « Étape n : <nom>, faite|en cours ». Noms des étapes : Compte, Vérification, Profil, Rythme, IA, Rappels, Départ. Compteur : `/inscription` → « Étape 1 sur 7 · Compte » ; `/connexion` → « Connexion » ; `/verifier-email` → « Étape 2 sur 7 · Vérification ». Segments : faits `#C6F432`, courant `#FFFFFF` (`aria-current="step"`), à venir `#2E2E34`.
- **EF-3 — Écran Compte, mode inscription.** Titre `h1` « Créer votre compte », sous-titre « Deux minutes pour démarrer, sans carte bancaire. ». Carte blanche contenant dans l'ordre : champ « Adresse e-mail » (`type=email`, `autocomplete=email`, placeholder « vous@exemple.fr ») ; groupe radio avec deux cartes — « Recevoir un lien de connexion » / « Sans mot de passe : un lien valable 1 heure, envoyé par e-mail. » et « Choisir un mot de passe » / « 12 caractères au moins. » (défaut : lien) ; si mot de passe : champ « Mot de passe » (`type=password`, `autocomplete=new-password`, placeholder « 12 caractères au moins »), 4 barres et texte d'aide ; case CGU ; zone d'erreur ; bouton principal noir « Recevoir mon lien » (méthode lien) ou « Créer mon compte » (méthode mot de passe). Sous la carte : « Déjà un compte ? » + bouton-lien « Se connecter » (→ `/connexion`, l'adresse saisie est conservée).
- **EF-4 — Écran Compte, mode connexion.** Titre « Bon retour », sous-titre « Connectez-vous pour reprendre là où vous en étiez. ». Méthodes : « Recevoir un lien de connexion » / « Sans mot de passe : un lien valable 1 heure, envoyé par e-mail. » et « Avec mon mot de passe » / « Connexion immédiate. ». Mot de passe : `autocomplete=current-password`, sans barres ni aide. Pas de case CGU. Bouton « Recevoir mon lien de connexion » ou « Se connecter ». Pied : « Pas encore de compte ? » + « Créer un compte » (→ `/inscription`).
- **EF-5 — Solidité du mot de passe** (inscription) : `strength = min(4, (len ≥ 12 ? 2 : len ≥ 8 ? 1 : 0) + (contient un chiffre ? 1 : 0) + (contient un caractère hors [A-Za-z0-9] ? 1 : 0))`. Barre i (0..3) colorée si `i < strength` : `#14A38B` si `strength ≥ 3`, sinon `#F97316` ; sinon `#E7E6E1`. Texte d'aide : vide → « 12 caractères au moins ; une phrase facile à retenir fonctionne bien. » ; `strength ≥ 3` → « Mot de passe solide. » ; sinon « Encore un effort : allongez-le, ajoutez un chiffre ou un symbole. ». Les barres sont `aria-hidden` ; le texte d'aide est relié au champ par `aria-describedby` et annoncé (`aria-live="polite"`).
- **EF-6 — Validation à la soumission** (dans cet ordre, premier échec affiché dans la zone `role="alert"` fond `#FFEDE0`, texte `#8F3305`) : adresse ne respectant pas `^[^\s@]+@[^\s@]+\.[^\s@]+$` après `trim` → « Saisissez une adresse e-mail valide. » ; inscription + mot de passe < 12 caractères → « Le mot de passe doit faire 12 caractères au moins. » ; connexion + mot de passe vide → « Saisissez votre mot de passe. » ; inscription sans case cochée → « Acceptez les conditions pour créer votre compte. ». Toute frappe dans un champ ou changement de méthode efface l'erreur.
- **EF-7 — Envois.** Inscription + lien → `POST /auth/magic-link` (`intent: 'signup'`, `termsAccepted`, `termsVersion`, `timezone` détecté par `Intl.DateTimeFormat().resolvedOptions().timeZone`, repli `Europe/Paris`). Inscription + mot de passe → `POST /auth/sign-up`. Connexion + lien → `POST /auth/magic-link` (`intent: 'login'`). Connexion + mot de passe → `POST /auth/sign-in` puis navigation vers `redirectTo` (pas d'écran Vérification). Pendant l'envoi, le bouton passe en état chargement (`aria-busy="true"`, désactivé) : aucune double soumission.
- **EF-8 — Écran Vérification** (`/verifier-email`). Bouton « Retour » (chevron, → page Compte d'origine, adresse conservée). Carte centrée : pictogramme enveloppe sur fond `#F1FBD3` ; `h1` « Vérifiez votre boîte mail » ; texte « Nous avons envoyé un lien de connexion à <adresse>. Ouvrez-le sur cet appareil pour continuer. » (méthode lien) ou « Nous avons envoyé un lien de confirmation à <adresse>. Ouvrez-le sur cet appareil pour continuer. » (méthode mot de passe) ; « votre adresse » si l'adresse n'est pas connue ; bouton « J'ai cliqué sur le lien » ; ligne « Rien reçu ? Regardez dans les indésirables, ou renvoyez le lien. » où « renvoyez le lien » est un bouton ; après renvoi réussi : `role="status"` « Nouveau lien envoyé. Il reste valable 1 heure. ».
- **EF-9 — Renvoi limité.** Après un envoi (initial ou renvoi), le bouton « renvoyez le lien » est désactivé 60 s et son libellé devient « renvoyez le lien (dans N s) » (N décroissant, horloge injectable côté client). Un 429 serveur affiche dans la zone d'alerte « Patientez encore N s avant un nouvel envoi. » (N = `Retry-After`).
- **EF-10 — « J'ai cliqué sur le lien ».** Appelle `GET /api/v1/me` : session présente → navigation vers `/premiers-pas/<onboarding_step>` (ou `/accueil` si `done`) ; absente → zone `role="status"` « Le lien n'a pas encore été ouvert sur ce navigateur. Ouvrez-le depuis l'e-mail reçu. ».
- **EF-11 — Retour du lien.** Le callback de SPEC-202 redirige vers `/premiers-pas/profil` (nouvel inscrit) ou la destination d'origine. Lien expiré ou déjà utilisé → redirection `/connexion?erreur=lien-expire`, qui affiche dans la zone d'alerte « Ce lien a expiré ou a déjà servi. Demandez-en un nouveau. ».
- **EF-12 — Erreurs serveur** : `401 INVALID_CREDENTIALS` → « Adresse e-mail ou mot de passe incorrect. » ; `403 EMAIL_NOT_CONFIRMED` → appel automatique de `POST /auth/resend` (`kind: 'confirmation'`) puis navigation vers `/verifier-email` avec le message `role="status"` « Confirmez d'abord votre adresse : nous venons de vous renvoyer le lien. » ; `429` → « Trop de tentatives. Réessayez dans quelques minutes. » ; réseau indisponible ou 5xx → « Connexion au service impossible. Vérifiez votre réseau et réessayez. ».
- **EF-13 — Liens légaux** : « conditions d'utilisation » → `/legal/cgu`, « politique de confidentialité » → `/legal/confidentialite`, ouverts dans un nouvel onglet (`target="_blank" rel="noopener"`), suivis de « Mes ressources restent privées. ».

## 6. Exigences techniques

- **ET-1 — Pages** : `apps/web/app/(auth)/inscription/page.tsx`, `apps/web/app/(auth)/connexion/page.tsx`, `apps/web/app/(auth)/verifier-email/page.tsx` (Server Components minces) dans le groupe `(auth)` utilisant `AuthLayout` (SPEC-308). Composant client unique `apps/web/components/auth/AccountForm.tsx` (props `mode: 'signup'|'login'`), `apps/web/components/auth/VerifyEmailCard.tsx`, `apps/web/components/auth/AuthStepper.tsx` (props `current: 0..6`, `label`).
- **ET-2 — Schéma Zod** `packages/contracts/src/auth.ts` (réutilisé si SPEC-202 l'a créé, complété sinon) : `accountFormSchema = z.discriminatedUnion('method', [...])` avec `email: z.string().trim().regex(EMAIL_RE)`, `password: z.string().min(12)` (inscription) ou `.min(1)` (connexion), `termsAccepted: z.literal(true)` (inscription). Les messages d'erreur de EF-6 proviennent de `apps/web/messages/fr.ts` (`messages.auth.*`).
- **ET-3 — Pure function** `passwordStrength(pwd: string): 0|1|2|3|4` dans `apps/web/lib/auth/password-strength.ts`, conforme à EF-5.
- **ET-4 — Adresse en attente.** Aucune donnée personnelle dans l'URL : l'adresse, la méthode et l'intention sont conservées dans `sessionStorage['learny.pendingAuth'] = { email, method, intent, sentAt }` (lecture/écriture protégées par `try/catch`). `/verifier-email` lit cette clé ; `sentAt` (ISO, horloge injectable) sert au compte à rebours après rechargement.
- **ET-5 — Version légale** : constante `LEGAL_DOCUMENTS_VERSION` exportée par `packages/config/src/product.ts` (valeur initiale `'2026-11-11'`, mise à jour par SPEC-806). SPEC-202 enregistre l'acceptation ; si son service ne l'écrit pas encore, SPEC-601 ajoute dans `packages/services/src/auth/complete-sign-up.ts` l'écriture idempotente des deux lignes `legal_acceptances` et de `profiles.terms_version/terms_accepted_at` au premier passage du callback (métadonnées utilisateur `termsVersion`, `termsAcceptedAt`, `timezone` transmises à Supabase via `options.data`).
- **ET-6 — Anti-énumération** (ADR-0168) : en connexion par lien, la réponse est toujours `202` et l'écran Vérification s'affiche même pour une adresse inconnue ; à l'inscription par mot de passe sur une adresse existante, même comportement (Supabase renvoie un succès factice) ; seul `sign-in` révèle un échec, avec un message qui ne distingue pas « adresse inconnue » de « mauvais mot de passe ».
- **ET-7 — Accessibilité** : `radiogroup` avec `aria-label="Façon de se connecter"`, chaque carte `role="radio"` + `aria-checked`, navigation flèches haut/bas et Espace (composant `ChoiceCard` + `ChoiceGroup` ajouté à `@learny/ui`, réutilisé par SPEC-602) ; focus visible `3px solid #5B5BD6` décalé de 2 px ; erreur annoncée (`role="alert"`) ; après soumission en erreur, le focus va sur le premier champ fautif ; cibles ≥ 44 px.
- **ET-8 — Sécurité** : aucune donnée envoyée hors `/api/v1/auth/*` ; mot de passe jamais journalisé ni stocké côté client ; formulaire `method="post"` neutralisé (soumission par `fetch` avec en-tête `Origin`, vérifié par SPEC-208).
- **ET-9 — Performances** : pages statiques côté serveur (aucune requête base au rendu) ; JS client de la page ≤ 60 ko gzip (mesuré au build, consigné dans les preuves).

## 7. Comportements attendus et cas limites

- **CL-1 — Double clic** sur « Créer mon compte » : le bouton est désactivé dès le premier clic ; une seule requête part (vérifié par interception réseau).
- **CL-2 — Renvoi trop tôt** (rechargement de `/verifier-email` après 20 s) : compte à rebours repris à 40 s grâce à `sentAt` ; si `sessionStorage` est indisponible, le bouton est actif et un éventuel 429 serveur affiche « Patientez encore N s avant un nouvel envoi. ».
- **CL-3 — Lien ouvert sur un autre appareil** : « J'ai cliqué sur le lien » renvoie le message de EF-10 ; l'utilisateur peut se reconnecter normalement.
- **CL-4 — Lien expiré (> 1 h) ou déjà utilisé** : EF-11.
- **CL-5 — Adresse avec espaces ou majuscules** : `trim()` côté client ; normalisation en minuscules côté SPEC-202 ; affichée telle que saisie (sans espaces) dans le texte de vérification.
- **CL-6 — Perte de réseau** pendant l'envoi : message de EF-12, bouton réactivé, champs conservés.
- **CL-7 — Mot de passe de 12 caractères exactement** : accepté ; 11 caractères : refusé côté client et côté serveur (`400 VALIDATION_FAILED` → même message que EF-6).
- **CL-8 — Compte déjà existant** inscrit par mot de passe qui tente « Créer mon compte » : écran Vérification (ET-6), l'e-mail reçu indique de se connecter (gabarit SPEC-202).
- **CL-9 — Adresse non confirmée en connexion par mot de passe** : EF-12 (`EMAIL_NOT_CONFIRMED`).
- **CL-10 — Utilisateur connecté** qui ouvre `/inscription` : redirection (EF-1), aucune page intermédiaire.
- **CL-11 — Basculer inscription ↔ connexion** : l'adresse est conservée, la méthode est conservée, le mot de passe est vidé, l'erreur effacée.
- **CL-12 — Limitation de débit** (10 requêtes/min/IP sur `/auth/*`) : 429 → EF-12.
- **CL-13 — Navigateur sans JavaScript** : hors périmètre (application cliente) ; un `<noscript>` affiche « Activez JavaScript pour utiliser Learny. ».

## 8. Instructions d'implémentation

1. Ajouter `ChoiceCard` et `ChoiceGroup` à `packages/ui/src/components/` (rôle `radio`/`radiogroup`, styles de la maquette : sélection bordure 2 px `#111113` fond `#F8F8F6`, sinon bordure 1 px `#DAD9D3` ; pastille 18 px), leurs tests Testing Library et leur entrée dans la galerie `/_dev/ui`. Commit `feat(SPEC-601): ajoute ChoiceCard et ChoiceGroup au design system`.
2. Créer `apps/web/lib/auth/password-strength.ts` et ses tests unitaires.
3. Ajouter `messages.auth` dans `apps/web/messages/fr.ts` avec **tous** les textes de EF-2 à EF-13 (aucune chaîne en dur dans les composants).
4. Compléter `packages/contracts/src/auth.ts` (ET-2) et `LEGAL_DOCUMENTS_VERSION` (ET-5).
5. Écrire `AuthStepper`, `AccountForm` (react-hook-form + Zod, validation à la soumission uniquement, ordre EF-6), `VerifyEmailCard` (compte à rebours via `useClock()` de `@learny/core/clock` côté client), et la gestion `sessionStorage` (`apps/web/lib/auth/pending-auth.ts`).
6. Créer les trois pages dans `app/(auth)/` ; lire `?erreur=lien-expire` sur `/connexion`. Commit `feat(SPEC-601): écrans d'inscription, de connexion et de vérification`.
7. Si nécessaire, compléter `complete-sign-up.ts` (ET-5) avec test d'intégration. Commit `feat(SPEC-601): enregistre l'acceptation des conditions`.
8. Écrire les tests unitaires, d'intégration et e2e (section 12), y compris le test `@visual` par régions (ADR-0161). Commit `test(SPEC-601): …`.
9. Lancer `node tools/sdd/validate.mjs SPEC-601`, compléter `evidence/SPEC-601/acceptance.md`.

## 9. Fichiers et composants concernés

- **Créés** : `apps/web/app/(auth)/inscription/page.tsx`, `apps/web/app/(auth)/connexion/page.tsx`, `apps/web/app/(auth)/verifier-email/page.tsx`, `apps/web/components/auth/AccountForm.tsx`, `apps/web/components/auth/VerifyEmailCard.tsx`, `apps/web/components/auth/AuthStepper.tsx`, `apps/web/lib/auth/password-strength.ts`, `apps/web/lib/auth/pending-auth.ts`, `packages/ui/src/components/ChoiceCard.tsx`, `packages/ui/src/components/ChoiceGroup.tsx`, tests (section 12).
- **Modifiés** : `apps/web/messages/fr.ts` (`auth`), `packages/contracts/src/auth.ts`, `packages/config/src/product.ts` (`LEGAL_DOCUMENTS_VERSION`), `packages/ui/src/index.ts` (exports), page galerie `/_dev/ui`, éventuellement `packages/services/src/auth/complete-sign-up.ts`.
- **Réutilisés** : `AuthLayout` (SPEC-308), `Button`, `TextField`, `Checkbox`, `FormField` (SPEC-302), client API typé `apps/web/lib/api-client.ts` (SPEC-201), middleware (SPEC-202), helpers e2e `@learny/testing` (horloge, axe, `mail.ts`, `compareRegions`).

## 10. Interface et conformité visuelle

- Maquette : `design/maquettes/Inscription.dc.html` — états « Compte » (inscription, méthode lien, défaut), « Compte » mode `?connexion`, « Vérification ». Références : fichiers SCR-01 listés dans `design/references/manifest.json` (SPEC-005), viewports 1440×900 et 390×844.
- Structure (ordre DOM) : `aside[aria-label="Learny"]` (logo, accroche, liste, stepper) puis `main` > colonne `max-width: 560px` (35 rem) : [Retour] → `h1` + sous-titre → carte (`data-testid="auth-card"`) → pied de bascule.
- `data-testid` : `auth-stepper`, `auth-step-counter`, `auth-email`, `auth-method-magic`, `auth-method-password`, `auth-password`, `auth-strength`, `auth-strength-hint`, `auth-terms`, `auth-error`, `auth-submit`, `auth-switch`, `verify-card`, `verify-confirm`, `verify-resend`, `verify-status`, `auth-back`.
- Jetons contrôlés (`expectTokens`) : fond page `#F4F4F1` ; panneau `#111113` ; coche `#C6F432` ; carte blanche bordure `#E7E6E1` rayon 24 px ; bouton principal `#111113` texte blanc rayon 14 px hauteur min 50 px ; `h1` Space Grotesk 32 px 600 ; champs bordure `#DAD9D3` rayon 12 px hauteur 48 px ; liens `#3A3AA8` ; alerte fond `#FFEDE0` texte `#8F3305` ; statut renvoi `#0B5C4D` (valeurs en rem, échelle 90 %, ADR-0034).
- États : chargement (bouton `aria-busy`), erreur (EF-6/EF-12), statut renvoyé, compte à rebours.
- Responsive : sous 900 px, le panneau passe au-dessus du contenu (flex-wrap de la maquette), largeur pleine ; à 360 px aucun défilement horizontal ; cibles ≥ 44 px.
- Contrôles automatisés : (1) jetons ci-dessus ; (2) structure et textes exacts de EF-2 à EF-4, EF-8 ; (3) comparaison à la référence en pleine page (l'écran est livré entièrement par cette spécification) avec horloge figée 2026-11-11T12:20:00Z, écart ≤ 12 % pour chacun des trois états ; (4) ligne de base `toHaveScreenshot` (`maxDiffPixelRatio: 0.01`).

## 11. Critères d'acceptation

- **CA-1** — Les trois routes affichent exactement les textes et l'ordre des régions de la section 10 ; les trois comparaisons visuelles desktop sont ≤ 12 %.
- **CA-2** — Inscription par lien magique de bout en bout : un e-mail arrive (transport mémoire) en moins de 5 s, son lien ouvre une session et mène à `/premiers-pas/profil` ; `legal_acceptances` contient 2 lignes avec `LEGAL_DOCUMENTS_VERSION`.
- **CA-3** — Inscription par mot de passe : < 12 caractères refusé avec le message exact ; l'indicateur affiche 0 à 4 barres selon EF-5 (tests tabulés) ; confirmation par e-mail requise avant toute page de l'application.
- **CA-4** — Sans case CGU cochée, aucune requête n'est envoyée et « Acceptez les conditions pour créer votre compte. » est affiché.
- **CA-5** — Le renvoi est impossible pendant 60 s (bouton désactivé, compte à rebours) et un appel serveur forcé reçoit 429.
- **CA-6** — Connexion par mot de passe : identifiants faux → message neutre ; corrects → redirection sous 2 s vers `/accueil` (onboarding terminé) ; connexion par lien sur une adresse inconnue → écran Vérification identique (anti-énumération).
- **CA-7** — Lien expiré → `/connexion` affiche « Ce lien a expiré ou a déjà servi. Demandez-en un nouveau. ».
- **CA-8** — Aucune violation axe serious/critical sur les trois écrans ; parcours complet réalisable au clavier ; aucune adresse e-mail dans une URL (vérifié sur toutes les requêtes du test e2e).

## 12. Plan de tests

**Unitaires** (Vitest)
- `apps/web/lib/auth/password-strength.test.ts` — `describe('[SPEC-601] passwordStrength')` : tableau `''→0`, `'abcdefgh'→1`, `'abcdefgh1'→2`, `'abcdefghijkl'→2`, `'abcdefghijk1'→3`, `'abcdefghij1!'→4`, `'a1!'→2`.
- `apps/web/components/auth/AccountForm.test.tsx` — `describe('[SPEC-601] AccountForm')` : ordre des erreurs EF-6, libellés des boutons selon mode/méthode, case non pré-cochée, effacement de l'erreur à la frappe, bouton désactivé pendant l'envoi.
- `apps/web/components/auth/VerifyEmailCard.test.tsx` — `describe('[SPEC-601] VerifyEmailCard')` : compte à rebours avec horloge figée (60 → 0), texte lien/confirmation, message 429.
- `packages/ui/src/components/ChoiceGroup.test.tsx` — `describe('[SPEC-601] ChoiceGroup')` : flèches, Espace, `aria-checked`.

**Intégration** (Vitest, Supabase local réel)
- `apps/web/test/integration/auth-screens.test.ts` — `describe('[SPEC-601] parcours d'authentification')` : sign-up mot de passe → e-mail de confirmation en transport mémoire ; magic-link `intent: 'login'` sur adresse inconnue → 202 ; resend deux fois en 10 s → 429 avec `Retry-After` ; callback → 2 lignes `legal_acceptances`, `profiles.terms_version` renseigné, `profiles.timezone` = valeur transmise.

**End-to-end** (Playwright, vidéo, horloge figée)
- `apps/web/e2e/specs/p6/spec-601-auth.spec.ts`
  - `test('inscription par lien magique jusqu'aux premiers pas @SPEC-601')` : ouvrir `/inscription` ; vérifier compteur « Étape 1 sur 7 · Compte » ; saisir une adresse invalide → message ; corriger ; cliquer « Recevoir mon lien » sans CGU → message ; cocher ; soumettre → `/verifier-email`, texte avec l'adresse ; lire l'e-mail via `mail.ts` ; ouvrir le lien → `/premiers-pas/profil`.
  - `test('inscription par mot de passe et solidité @SPEC-601')` : choisir « Choisir un mot de passe », saisir successivement 3 mots de passe, vérifier barres/texte ; « Créer mon compte » → Vérification ; « J'ai cliqué sur le lien » avant ouverture → message EF-10.
  - `test('renvoi limité à 60 s @SPEC-601')` : « renvoyez le lien » → statut « Nouveau lien envoyé… » ; bouton désactivé « (dans 60 s) » ; avancer l'horloge de 60 s (`page.clock.fastForward`) → actif.
  - `test('connexion par mot de passe, erreurs et lien expiré @SPEC-601')` : utilisateur de fabrique onboardé ; mauvais mot de passe → message neutre ; bon → `/accueil` ; `/connexion?erreur=lien-expire` → message ; bascule « Créer un compte » conserve l'adresse.
  - Chaque test exécute `expectNoAxeViolations(page)` et vérifie qu'aucune URL de requête ne contient `@`.
- **Visuel** : `test('conformité SCR-01 compte, connexion et vérification @SPEC-601 @visual')` : `expectTokens` (section 10), structure, `compareWithReference` pleine page pour les 3 états ≤ 12 %, `toHaveScreenshot` (desktop et mobile 390×844).
- **Non-régression** : rejouer `@SPEC-202`, `@SPEC-308`, `@SPEC-302`.

| Critère | Tests |
|---|---|
| CA-1 | visuel `@SPEC-601 @visual`, `AccountForm.test.tsx` |
| CA-2 | e2e « inscription par lien magique… », intégration callback |
| CA-3 | `password-strength.test.ts`, e2e « inscription par mot de passe… » |
| CA-4 | `AccountForm.test.tsx`, e2e lien magique |
| CA-5 | `VerifyEmailCard.test.tsx`, e2e « renvoi limité », intégration resend 429 |
| CA-6 | e2e « connexion par mot de passe… », intégration magic-link adresse inconnue |
| CA-7 | e2e « connexion par mot de passe, erreurs et lien expiré » |
| CA-8 | axe dans tous les e2e, contrôle des URL |

## 13. Preuves attendues

`evidence/SPEC-601/` : vidéos des 4 tests e2e ; captures `inscription-compte.png`, `connexion.png`, `verification.png`, `verification-compte-a-rebours.png`, `mobile-inscription.png` ; comparaisons `visual/SCR-01-*` (côte à côte + diff + taux) ; taille JS de la page (ET-9) dans `summary.md` ; rapports axe.

## 14. Définition de terminé

Définition commune (`docs/engineering/testing.md` §7) ; en plus : `ChoiceCard`/`ChoiceGroup` présents dans la galerie `/_dev/ui` sans violation axe ; tous les textes dans `apps/web/messages/fr.ts` ; aucune donnée personnelle dans les URL ; acceptation des conditions enregistrée avec la version.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0007 (méthodes, 1 h, 12 caractères, 60 s), ADR-0045 (pages légales, version), ADR-0034 (échelle 90 %), ADR-0046 (routes françaises), ADR-0064 (formulaires), ADR-0047 (horloge).
- **ADR-0168** (créé) : messages d'authentification neutres (anti-énumération) et conservation de l'adresse en `sessionStorage` plutôt que dans l'URL.
- **ADR-0161** (créé) : méthode de comparaison visuelle ; ici l'écran est livré entièrement, la comparaison est en pleine page.
- **ADR-0303** (créé) : `useClock` reste dans `apps/web` pour ne pas ajouter React à `@learny/core` ; `GET /api/v1/me` est livré avec le DTO complet que SPEC-602 étendra ; `lien-expire` et `lien-invalide` affichent le même message d'expiration.
- Textes ajoutés (absents de la maquette, nécessaires aux états) : messages EF-10, EF-11, EF-12, compte à rebours EF-9, `<noscript>`.
- Hypothèse : le contrat `/auth/*` de SPEC-202 correspond au tableau de la section 3 ; tout écart de nommage est absorbé par le client sans changement de comportement.
