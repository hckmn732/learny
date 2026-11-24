# ADR-3008 — Authentification et session de l'application mobile

- **Statut** : Acceptée — précise ADR-1005 pour le client natif
- **Origine** : Déduite (préparation de la piste mobile)
- **Date** : 2026-11-22
- **Liens** : ADR-0007, ADR-0121, ADR-1005, ADR-1009, ADR-3004, ADR-3006, SPEC-3003, SPEC-3101, SPEC-3402

## Contexte

L'API accepte `Authorization: Bearer <jeton d'accès Supabase>` sans `Origin` ni cookie (ADR-1005,
SPEC-1301). Les méthodes de connexion sont le lien magique et le mot de passe (ADR-0007), avec non-
énumération des comptes (ADR-0121). `expo-secure-store` limite chaque valeur à environ 2 Ko, alors
qu'une session Supabase sérialisée dépasse souvent cette taille.

## Décision

1. Le mobile utilise `@supabase/supabase-js` directement contre Supabase Auth (URL et clé publique
   `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`), avec `autoRefreshToken`,
   `persistSession` et `detectSessionInUrl: false`.
2. **Stockage de session** : adaptateur `secureSessionStorage` qui écrit la session dans une
   instance MMKV chiffrée dont la clé (32 octets aléatoires) est stockée dans `expo-secure-store`
   (`keychainAccessible: AFTER_FIRST_UNLOCK`). Rien n'est écrit en clair.
3. **Appels API** : `@learny/api-client` reçoit un fournisseur d'en-têtes qui lit le jeton d'accès
   courant ; après un 401, un seul renouvellement (`refreshSession`) puis une seule nouvelle
   tentative (comportement déjà fourni par `api-client`) ; échec → déconnexion locale et retour à
   la connexion.
4. **Lien magique** : `signInWithOtp` avec `emailRedirectTo` = lien universel
   `https://<domaine web>/auth/mobile` (Associated Domains iOS, App Links Android vérifiés) et
   repli sur le schéma `learny://auth/callback` ; l'application échange le code (`exchangeCodeForSession`,
   PKCE). La page web `/auth/mobile` est une page statique qui redirige vers le schéma si
   l'application n'a pas intercepté le lien ; elle est ajoutée par SPEC-3101 sans modifier les
   autres pages web.
5. **Inscription et CGU** : inscription par mot de passe ou lien magique comme sur le web, avec la
   même non-énumération ; acceptation des versions actives par `POST /me/legal-acceptances` ; une
   réponse `422 LEGAL_ACCEPTANCE_REQUIRED` ouvre la feuille d'acceptation.
6. **Déconnexion** : `POST /auth/sign-out` puis `supabase.auth.signOut()`, purge du cache
   TanStack Query, de la file hors ligne et du stockage MMKV de l'utilisateur.
7. **Apple et Google** (SPEC-3402) : `expo-apple-authentication` et Google Sign-In natif, puis
   `supabase.auth.signInWithIdToken` ; fournisseurs activés dans Supabase Auth, sans route d'API
   nouvelle.

## Conséquences

- Aucune route `/auth/*` n'est ajoutée à l'API ; la page `/auth/mobile` est la seule page web
  ajoutée par la piste mobile.
