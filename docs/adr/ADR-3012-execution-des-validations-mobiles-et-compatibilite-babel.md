# ADR-3012 — Exécution des validations mobiles sur une VM séparée (agent appareil) et compatibilité Babel/React Native

- **Statut** : Acceptée — précise ADR-3004 § 6 et ADR-3005 § 3
- **Origine** : Déduite (pendant l'implémentation de SPEC-3001, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-22
- **Liens** : ADR-1007, ADR-3004, ADR-3005, SPEC-3001

## Contexte

SPEC-3001 rend la boucle SDD capable de valider une spécification mobile : `pnpm test:e2e:mobile`
doit installer le build `e2e`, lancer Maestro, produire une vidéo et une comparaison visuelle, et
`tools/sdd/validate.mjs` doit pouvoir compter ces preuves. Or l'environnement de développement de
la piste mobile sépare deux machines : le dépôt, l'API locale et la boucle SDD vivent sur la VM
`learny-dev`, tandis que l'émulateur Android et Maestro vivent sur la VM `learny-android` (BRIEF
§ Les deux VM). Aucun tunnel TCP brut n'existe entre les deux machines : seuls des ports HTTPS
publiés sont joignables.

Trois autres points ont été tranchés pendant l'implémentation :

1. Expo SDK 58 est la version stable la plus récente (relevée à l'installation) ; React Native 0.88
   n'a plus d'option d'architecture ni de moteur JS : la nouvelle architecture et Hermes sont les
   seuls modes, et les clés `newArchEnabled` / `jsEngine` d'`app.config.ts` sont refusées par les
   types d'Expo.
2. `app.config.ts` est évalué par le CLI Expo dans un contexte Node qui ne sait pas résoudre les
   sources TypeScript de `@learny/ui/tokens` (imports relatifs sans extension) : la couleur crème
   de la maquette y est donc répétée en constante, `src/theme` restant la source de vérité à
   l'exécution.
3. `babel-preset-expo` (SDK 58) retire les types **Flow avant** les types TypeScript : tout champ
   de classe `declare` d'un paquet partagé fait échouer le bundle Android. Un seul fichier de la
   piste cliente était concerné (`packages/api-client/src/client.ts`, `ApiError`).

## Décision

1. **Transport appareil** : `apps/mobile/e2e/run-maestro.mjs` connaît deux transports de même
   contrat. En local, il pilote `adb` et `maestro`. En mode distant (`MOBILE_DEVICE_AGENT_URL`), il
   délègue les mêmes étapes à `apps/mobile/e2e/device-agent.mjs`, un agent HTTP lancé sur la machine
   qui possède l'émulateur ; l'agent télécharge l'APK par une URL signée (`MOBILE_APK_URL`),
   l'installe, fige la barre d'état, lance Maestro et renvoie le rapport JUnit, la vidéo et les
   captures. Le rapport `test-results/sdd/<SPEC>/e2e-mobile.json` est ainsi produit par une
   exécution réelle, que `validate.mjs` lit sans jamais faire confiance à un fichier préexistant.
   L'agent exige `DEVICE_AGENT_TOKEN` quand la variable est définie et n'écrit que dans son
   répertoire temporaire ; il n'est pas nécessaire en CI, où l'émulateur est sur le runner.
2. **Expo** : la version exacte (`expo ~58.0.26`, React Native 0.88.1, React 19.3, Expo Router
   58.0.32, Jest 30 et `jest-expo ~58.0.15`) est consignée dans `docs/architecture/mobile/README.md`
   et dans `apps/mobile/package.json`. `expo-system-ui` est ajouté pour que `userInterfaceStyle`
   soit honoré ; `babel-preset-expo` est déclaré explicitement (le layout pnpm n'expose pas les
   dépendances transitives).
3. **Configuration** : `app.config.ts` valide les six variables `EXPO_PUBLIC_*` avec le schéma Zod de
   `src/config.ts` et refuse de construire une application mal configurée ; il importe ce module
   avec l'extension `.ts` explicite (le CLI transpile le fichier en CommonJS puis le `require`).
4. **Compatibilité React Native des paquets partagés** : le champ `declare` d'`ApiError` est
   remplacé par une fusion de déclaration (même type public, aucun champ émis), avec une
   dérogation ESLint ciblée et justifiée. Tout nouveau paquet client doit rester transformable par
   la chaîne Flow-puis-TypeScript de `babel-preset-expo` (ADR-3005 § 3).

## Conséquences

- `pnpm test:e2e:mobile --tags SPEC-xxx` fonctionne sur un poste avec émulateur et, sur cette
  plateforme, depuis la VM de développement via `apps/mobile/e2e/e2e.env` (non versionné).
- La CI Android (`mobile.yml`) reste en transport local : l'émulateur est sur le runner.
- Une future montée de version d'Expo devra vérifier ces trois points (clés d'architecture, imports
  d'`app.config.ts`, champs `declare`) ; un écart se consigne dans un nouvel ADR.
