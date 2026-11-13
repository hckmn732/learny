# ADR-0293 — Compléments d'implémentation des clés personnelles chiffrées

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-13
- **Liens** : SPEC-505, ADR-0154, ADR-0159

## Contexte

SPEC-505 impose `422 VALIDATION_FAILED` pour les validations de `POST /me/ai/credentials`, alors que la convention générale d'`api.md` et le catalogue d'erreurs répondent `400` pour une validation de schéma. La spécification ne précise pas non plus comment l'empreinte de doublon survit à une rotation, ni comment isoler la preuve de reprise de la rotation sur 250 lignes sans toucher aux autres comptes de la base de test.

## Décision

1. Une route peut déclarer `validationStatus: 422` dans son contrat ; le wrapper transmet ce statut à `validateInput`. Les autres routes conservent le `400` par défaut.
2. L'empreinte HMAC de doublon est recalculée avec la clé maîtresse courante lors d'une rotation et lors d'un déchiffrement paresseux, afin que la détection d'EF-6 reste exacte après changement de clé.
3. `rotateCredentialKeys` accepte une option `userId` facultative pour une rotation ciblée (test et exploitation) ; le script `pnpm ai:rotate-keys` reste global.
4. Le masquage est dérivé du préfixe alphabétique conservé dans `qualification.keyPrefix` et des quatre derniers caractères de `key_last4` ; aucune autre partie de la clé n'est stockée en clair.
5. Les régions et notes des six fournisseurs sont exposées par `providerRegion` du catalogue, source unique du DTO et de l'écran.

## Conséquences

Les routes de SPEC-505 respectent le statut exigé sans modifier le comportement des routes existantes. La détection de doublon reste fiable pendant et après une rotation, et la preuve de reprise peut être exécutée sur un compte isolé.
