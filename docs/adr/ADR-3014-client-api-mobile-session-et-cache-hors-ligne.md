# ADR-3014 — Client d'API mobile, session sécurisée et cache hors ligne : décisions d'implémentation

- **Statut** : Acceptée — précise ADR-3004 § 3 et ADR-3008 § 2 et § 3
- **Origine** : Déduite (pendant l'implémentation de SPEC-3003, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-22
- **Liens** : ADR-1005, ADR-3004, ADR-3005, ADR-3008, ADR-3012, SPEC-3003

## Contexte

SPEC-3003 branche l'application sur `/api/v1` : instance de `@learny/api-client` avec Bearer,
renouvellement unique après `401`, session Supabase dans une MMKV chiffrée, cache TanStack Query
persistant, file hors ligne et bandeau « Hors ligne ». Quatre points n'étaient tranchés ni par
ADR-3008 ni par le canevas mobile, et un cinquième est apparu pendant la campagne e2e.

## Décision

1. **Le renouvellement sérialisé vit dans `src/auth/session-token.ts`**, pas dans le client
   d'API. `api-client` (ADR-3005) ne change pas : il appelle `refreshAccessToken` à chaque `401`,
   et cette fonction est `refreshSessionOnce()`, qui partage une seule promesse entre tous les
   appelants (ET-2, CL-1). Dix requêtes concurrentes produisent un renouvellement et dix reprises,
   prouvé par `src/auth/session-token.test.ts`, `src/api/client.test.ts` et
   `test/auth/session.test.tsx`. Conséquence : le contrat d'`api-client` reste intact et le
   comportement est testable sans réseau.
2. **Le stockage chiffré est pur et injectable.** `src/auth/secure-storage.ts` ne connaît ni MMKV
   ni `expo-secure-store` : il reçoit un `SessionStorageBackend` (trousseau + fabrique de magasin
   chiffré + générateur de clé) et applique la règle « jamais de session en clair ».
   `src/auth/secure-backend.ts` est le seul module qui touche les deux natifs. CA-5 est ainsi
   prouvé par un test Vitest qui simule un magasin n'acceptant que du chiffré (le clair n'apparaît
   ni dans le trousseau ni dans les octets du magasin) ; le test ne prétend pas exécuter l'AES de
   MMKV, il prouve que l'adaptateur écrit toujours dans le magasin ouvert avec la clé du trousseau,
   clé de 32 octets créée une seule fois. La preuve « matérielle » de l'AES-256 reste celle de
   MMKV (`encryptionKey`), bibliothèque retenue par ADR-3004 § 3.
3. **Le cache persistant est isolé par compte et par version** (`buster = version:userId`), écrit
   dans la même MMKV chiffrée que la session mais sous une clé distincte, avec `maxAge` 24 h égal au
   `gcTime`. Une montée de version de l'application ignore le cache précédent au lieu de le
   restaurer (CL-5) ; la purge de déconnexion retire le cache et la file sans toucher à la session
   (celle-ci est retirée par le client Auth, ADR-3008 § 6).
4. **`expo/fetch` est injecté, jamais importé par la logique testable** : `src/api/transport.ts`
   est le seul import d'`expo/fetch` et `src/api/client.ts` reçoit son transport. Le registre
   `src/api/registry.ts` évite que `src/api/stream.ts` dépende de l'instance native : la lecture
   SSE reste testable en Node (Vitest), ce qui couvre EF-8 et CA-3 sans appareil.
5. **La coupure réseau de la page de démonstration est un contrôle de démonstration.** Maestro
   2.12.1 ne pilote pas le mode avion (aucune commande, vérifié sur le binaire de la VM appareil)
   et le transport dual-VM (ADR-3012) n'exécute `adb` qu'autour de la campagne, pas entre deux
   étapes d'un flux. La page `/_dev/sdd/SPEC-3003` expose donc `sdd-offline-toggle`, qui bascule le
   **même** `onlineManager` que NetInfo alimente (`src/offline/network-wiring.ts`) : le bandeau et
   la mise en cache hors ligne sont rendus et vérifiés sur l'appareil, la détection réelle de
   NetInfo étant couverte par les tests Jest (`test/offline/offline-banner.test.tsx`). Ce contrôle
   n'existe que dans les builds `EXPO_PUBLIC_ENABLE_SDD_PAGES=1` et ne modifie aucune règle métier.
6. **Les identifiants du compte de démonstration viennent de l'environnement du build** :
   `MOBILE_DEMO_PASSWORD` de `apps/mobile/e2e/e2e.env` (non versionné) est appliqué au compte seedé
   par `apps/mobile/e2e/prepare-demo-user.mjs` et inliné dans le bundle e2e sous
   `EXPO_PUBLIC_SDD_DEMO_PASSWORD`. La page ne l'affiche jamais, aucun journal ne le contient, et un
   build normal (sans la variable) affiche simplement l'état déconnecté.

## Conséquences

- `packages/api-client` n'est pas modifié ; les tests existants de ce paquet restent la référence.
- Les deux modules natifs ajoutés (`react-native-mmkv` + `react-native-nitro-modules`,
  `expo-secure-store`, `expo-crypto`, `@react-native-community/netinfo`) sont compilés dans l'APK ;
  le premier build complet après leur ajout a été vérifié sur l'émulateur Android 15 / API 35.
- Le jour où Maestro saura couper la radio, le contrôle `sdd-offline-toggle` pourra être retiré au
  profit d'un vrai mode avion ; le reste du dispositif (bandeau, cache, purge) ne change pas.
- iOS n'est pas exécuté (aucune VM macOS, ADR-3004 § 6) : `AFTER_FIRST_UNLOCK` et le cas CL-6
  (trousseau inaccessible) sont couverts par les tests unitaires et par la lecture du code, pas par
  une campagne sur simulateur.
