# SPEC-3402 — Connexion avec Apple et Google — acceptation

Branche : `spec/SPEC-3402-connexion-avec-apple-et-google` · ADR appliqués : 0007, 3003, 3006,
3008, 3011, **3024** (nouveau) · Références visuelles : `design/app-mobile/exports/screens/android-01-connexion.png`.

## 1. Ce qui est livré

- `apps/mobile/src/auth/providers/` : `types.ts`, `nonce.ts`, `order.ts`, `errors.ts`, `apple.ts`
  (natif iOS + flux web Supabase sur Android), `google.ts` (SDK natif), `mock.ts` (fournisseur
  simulé des builds e2e), `index.ts` (registre).
- `apps/mobile/src/auth/provider-access.ts` (échange du jeton d'identité, session, nom du profil),
  `legal-cache.ts`, `legal-versions.ts`, `navigation-hold.ts` (suspension de `AuthGate`).
- `apps/mobile/src/features/auth/ProviderButtons.tsx` et `useProviderSignIn.ts` ;
  `AuthScreen.tsx` (zone fournisseurs sous « ou », lien magique conservé dessous) ; `AuthGate.tsx`.
- Configuration Expo : `usesAppleSignIn`, plugin Google (`iosUrlScheme` publique) ; `supabase/config.toml`
  : `[auth.external.google]` désactivé par défaut (Apple l'était déjà) ; i18n `mobile.auth.providers`.
- Tests : Vitest `nonce.test.ts`, `order.test.ts`, `errors.test.ts`, `provider-access.test.ts`,
  intégration `id-token.int.test.ts` ; Jest `provider-buttons.test.tsx`, `provider-signin.test.tsx` ;
  Maestro `e2e/flows/SPEC-3402-fournisseur.yaml` (+ ligne de base visuelle).
- Outillage e2e : `e2e/prepare-oauth-user.mjs` (compte de campagne recréé sans CGU), variables
  publiques du fournisseur simulé dans `build-e2e.mjs` (build e2e uniquement).

## 2. Critères d'acceptation

| CA | Preuve | État |
|---|---|---|
| CA-1 — ordre par plateforme, Google jamais sans Apple | Vitest `order.test.ts` (iOS/Android + `appleAvailable:false`), Jest `provider-buttons.test.tsx` (ordre rendu, libellés, rôle), flux Maestro (`auth-providers`, `auth-google`, `auth-apple` visibles) | ✅ |
| CA-2 — première connexion : CGU puis application | Jest `provider-signin.test.tsx` (feuille imposée, `AuthGate` suspendu jusqu'à l'acceptation, nom appliqué), Vitest intégration `id-token.int.test.ts` (compte neuf : paire refusée puis acceptée sur l'API réelle, nom enregistré), flux Maestro (feuille → acceptation → `onboarding-gate`) | ✅ |
| CA-3 — annulation silencieuse | Jest `provider-signin.test.tsx` (« ne montre rien quand l'utilisateur annule », aucun appel API, aucune erreur), Vitest `errors.test.ts` (codes et messages d'annulation) | ✅ |
| CA-4 — conformité visuelle, zone fournisseurs comprise | Comparaison `compare.mjs` du flux `@visual` : écart mesuré **11,23 %** (seuil 12 %), zones masquées : chrome système uniquement (`DEFAULT_ZONES`), aucune zone fournisseur masquée | ✅ |

Non-régression : suites mobiles `[SPEC-3402]` vertes ; `[SPEC-3101]` rejouée par `validate.mjs`.

## 3. Écarts assumés

1. **Identifiants OAuth Apple/Google absents** (blocage externe consigné par
   `fail.mjs SPEC-3402 … --external`). Conséquence : l'échange réel `signInWithIdToken` contre les
   serveurs d'Apple et de Google n'est pas exécuté ; il est prouvé par un client Supabase simulé
   (`provider-access.test.ts`, `provider-signin.test.tsx`) et par le flux e2e à fournisseur simulé.
2. **Fournisseur simulé (ET-3)** : GoTrue ne peut pas vérifier un jeton signé localement sans les
   clés des fournisseurs, et la pile Supabase est partagée (aucun redémarrage possible). Le build
   e2e remplace donc la fenêtre du fournisseur par la connexion d'un compte dédié, recréé sans
   acceptation des CGU avant chaque campagne (`e2e/prepare-oauth-user.mjs`) : tout ce qui suit
   l'ouverture de session (CGU, nom, navigation) est le code de production. Le mot de passe de ce
   compte de test n'existe que dans le bundle e2e.
3. **Versions légales** (ADR-3024) : l'API ne sérialise pas les `errors` d'un
   `422 LEGAL_ACCEPTANCE_REQUIRED` ni d'un `409 CONFLICT` (vérifié sur la pile locale :
   `toProblem` ne les écrit que pour `VALIDATION_FAILED`). Le client mobile embarque donc les
   versions de sa livraison et le serveur valide la paire ; P35 doit exposer les versions actives.
   Un changement de version sans nouvelle application ferme l'accès (409) au lieu d'enregistrer
   une acceptation erronée.
4. **iOS** : pas de macOS sur la VM ; `expo prebuild` et la compilation ne sont prouvés que pour
   Android. L'ordre iOS, la disponibilité Apple et le bouton natif sont couverts par les tests
   unitaires (module natif simulé) ; l'écart est consigné, sans blocage.
5. **Maestro 2.12.1** : un seul flux `@visual` par spécification (dette de transport connue) ; les
   noms de flux sont en ASCII pour éviter l'échec `InvalidPathException`.
6. Tests pré-existants rouges hors périmètre mobile (décision du porteur, `BRIEF.md`) :
   `packages/config/src/commit-rules.test.ts`, `apps/web/test/unit/bundle-split.test.ts`,
   `tools/migration/test/unit/report.test.ts` — ni réparés ni affaiblis.

## 4. Reproduire

```sh
cd /root/wt/SPEC-3402
set -a; . ./.env.local; . ./apps/mobile/e2e/e2e.env; set +a
bash tools/dev/mobile-check.sh SPEC-3402
flock /tmp/learny-emulator.lock flock /tmp/learny-gradle.lock \
  env ORG_GRADLE_PROJECT_reactNativeArchitectures=x86_64 pnpm -s build:mobile:e2e
flock /tmp/learny-emulator.lock pnpm -s test:e2e:mobile --tags SPEC-3402
node tools/sdd/validate.mjs SPEC-3402 --skip-build --skip-campaign
```
