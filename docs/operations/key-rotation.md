# Rotation des clés maîtresses des clés IA personnelles

Normatif pour l'exploitation (SPEC-505 ET-4, ADR-0154). Les clés personnelles des apprenants sont
chiffrées au repos avec AES-256-GCM ; le chiffré stocké est `iv(12) ‖ tag(16) ‖ texte chiffré` et
les données associées (AAD) le lient à sa ligne : `learny:ai_credentials:<id>:<userId>`.

Deux variables portent les clés maîtresses :

| Variable | Rôle |
|---|---|
| `APP_ENCRYPTION_KEY` | clé courante, 32 octets encodés en base64 (obligatoire en production) |
| `APP_ENCRYPTION_KEY_PREVIOUS` | ancienne clé, seulement pendant une rotation (facultative) |

## Procédure

1. Générer une nouvelle clé : `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
2. Dans le gestionnaire de secrets de l'environnement, placer l'ancienne valeur dans
   `APP_ENCRYPTION_KEY_PREVIOUS` et la nouvelle dans `APP_ENCRYPTION_KEY`.
3. Déployer : les lectures continuent de fonctionner avec l'une ou l'autre clé. Une ligne lue avec
   l'ancienne clé est immédiatement rechiffrée avec la nouvelle (rotation paresseuse).
4. Lancer `pnpm ai:rotate-keys` avec le rôle service. Le script traite les lignes par lots de 100,
   chaque lot dans sa transaction, et affiche uniquement des compteurs et des identifiants.
5. Vérifier `Rechiffrées + Déjà à jour = Lignes examinées` et `En échec : 0`.
6. Retirer `APP_ENCRYPTION_KEY_PREVIOUS`, redéployer, puis archiver l'ancienne clé selon la
   procédure de gestion des secrets.

## Reprise et idempotence

- Une interruption (déploiement, coupure, arrêt du script) ne perd aucune ligne : les lots déjà
  commités sont à jour, les autres restent lisibles avec la clé précédente. Relancer la commande
  termine le travail.
- Une seconde exécution ne rechiffre pas les lignes déjà à jour.
- Une ligne en échec est signalée par son identifiant uniquement. Elle n'est pas modifiée : vérifier
  que `APP_ENCRYPTION_KEY_PREVIOUS` correspond bien à l'ancienne clé, puis relancer. Si l'échec
  persiste, la ligne est illisible (`CREDENTIAL_DECRYPT_FAILED` à l'appel) et l'apprenant doit
  supprimer puis réenregistrer sa clé depuis Paramètres › Modèles d'IA.

## Contrôles

- Aucun journal, message d'erreur ou sortie du script ne contient une clé en clair ou un chiffré.
- `APP_ENCRYPTION_KEY` absente ou de longueur différente de 32 octets : le démarrage et le script
  échouent avec `INVALID_ENVIRONMENT`, en nommant la variable sans sa valeur.
- Après la rotation, toutes les lignes doivent se déchiffrer avec la seule nouvelle clé (test
  d'intégration `[SPEC-505]`).
