# ADR-0154 — Chiffrement des clés personnelles et régions des fournisseurs

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-505, SPEC-506, SPEC-709

## Contexte

BR-IA-03 impose AES-256-GCM et le masquage ; `data-model.md` fixe le format `iv‖tag‖ciphertext` sans préciser la clé maîtresse, la rotation ni la liaison du chiffré à sa ligne. BR-IA-04 impose un avertissement hors UE sans liste des fournisseurs.

## Décision

1. Clé maîtresse `APP_ENCRYPTION_KEY` : 32 octets encodés en base64 (44 caractères) ; `APP_ENCRYPTION_KEY_PREVIOUS` facultative pendant une rotation. Chiffré stocké : IV aléatoire 12 octets ‖ étiquette 16 octets ‖ texte chiffré. Données associées (AAD) : `learny:ai_credentials:<credentialId>:<userId>` (UTF-8), ce qui interdit de déplacer un chiffré vers une autre ligne. Déchiffrement : clé courante, puis clé précédente ; échec des deux → `CREDENTIAL_DECRYPT_FAILED`.
2. Rotation : `pnpm ai:rotate-keys` (script `packages/llm/scripts/rotate-keys.ts`, rôle service) rechiffre chaque ligne avec la clé courante par lots de 100 dans des transactions, de façon idempotente ; procédure documentée dans `docs/operations/key-rotation.md` : (1) placer l'ancienne clé dans `APP_ENCRYPTION_KEY_PREVIOUS` et la nouvelle dans `APP_ENCRYPTION_KEY`, (2) déployer, (3) lancer le script, (4) retirer `APP_ENCRYPTION_KEY_PREVIOUS`.
3. Masquage : préfixe alphabétique suivi d'un tiret s'il existe (`sk-`), puis `••••••••`, puis les 4 derniers caractères ; seuls ces 4 caractères (`key_last4`) sont conservés en clair.
4. Régions (`packages/llm/src/providers/catalog.ts`, à revérifier dans la checklist de mise en production SPEC-808) : `openai`, `deepseek`, `anthropic` (clé personnelle) → `outside_eu = true`, note « Ce fournisseur traite les données hors de l’Union européenne. » ; `mistral` → `false`, « Vérifiez la région de traitement proposée par votre offre. » ; `openai_compatible` → `false`, « Vérifiez où ce service traite les données avant de l’utiliser. » ; `local` → `false`, « Les données restent sur votre machine. ». L'IA fournie n'affiche pas de pastille (maquette Paramètres) ; son traitement est déclaré dans la liste des sous-traitants (SPEC-806).
5. Modèles locaux : acceptés seulement si `ALLOW_LOCAL_MODELS=true` (auto-hébergement, ADR-0053) ; adresse `http(s)` vers un hôte privé autorisée dans ce seul cas. Service compatible OpenAI : `https` obligatoire et hôte résolu vers une adresse publique (contrôle anti-SSRF commun, ADR-0159).

## Conséquences

Une fuite de la base sans la clé maîtresse ne révèle aucune clé ; la rotation se fait sans interruption.
