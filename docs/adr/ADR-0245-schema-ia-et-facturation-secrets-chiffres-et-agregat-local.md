# ADR-0245 — Schéma IA et facturation : secrets chiffrés, RLS et agrégat local

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-110, ADR-0011, ADR-0012, ADR-0112, ADR-0215

## Contexte

SPEC-110 crée `ai_credentials`, `ai_task_models`, `ai_calls` et `subscriptions`, puis la vue
`ai_spend_today` (data-model §9). Le schéma doit empêcher toute clé brute, garantir qu'une clé
supprimée ou non qualifiée n'est jamais choisie, calculer le jour civil dans le fuseau de
l'apprenant et laisser l'écriture du journal et de l'abonnement aux services. Deux points ne sont
pas tranchés par le modèle : le mode de sécurité de la vue (le profil `profiles` n'a encore aucune
politique `authenticated`, SPEC-102) et le traitement des identifiants Stripe d'un compte gratuit.
L'horloge du jour doit être injectable dans les tests (ADR-0047), ce qu'une vue fondée sur `now()`
seule ne permet pas.

## Décision

`ai_credentials.encrypted_key` est un `bytea` unique porteur du secret, au format AES-256-GCM
`iv‖tag‖ciphertext` (au moins 29 octets). Une contrainte exige une clé pour tout fournisseur autre
que `local`, et `key_last4` n'accompagne qu'une clé présente (exactement quatre caractères). Le
repository refuse les champs textuels de clé brute (`apiKey`, `key`, `rawKey`, `secret`, `token`) et
ne retourne jamais le chiffré : `createCredential` rend l'identifiant, `listCredentials` projette
les cinq champs publics (`provider`, `label`, `keyLast4`, `status`, `outsideEu`). Le seul accès au
chiffré est `getCredentialSecret`, réservé au service de qualification (SPEC-505).

La RLS est propriétaire (`for all`) sur les clés et les choix de modèle, en lecture seule sur le
journal et l'abonnement, dont l'écriture reste au rôle service (ADR-0112 §4, ADR-0215). Un
déclencheur vérifie qu'une tâche ne référence que la clé de son propriétaire ; la FK
`ai_task_models.credential_id` est `on delete set null`, ce qui libère la tâche sans référence
pendante. `resolveTaskModel` retombe sur l'IA fournie si la clé est absente, supprimée ou non
qualifiée, et conserve l'identifiant fautif pour l'explication de SPEC-506.

`ai_spend_today` est une fonction `security definer` avec `search_path` vide et un garde explicite
sur `request.jwt.claims` : un compte `authenticated` ne peut lire que sa propre dépense, le rôle
service voit toutes les lignes. La vue du même nom s'exécute avec les droits de son propriétaire et
applique le même filtre de revendications ; elle ne dépend donc pas d'une politique sur `profiles`.
La fonction accepte un instant injecté (`p_now`, défaut `now()`), calcule le début du jour local et
le début du jour suivant dans `profiles.timezone`, puis les convertit en instants UTC. Le calcul
absorbe les jours de 23 et 25 heures et exclut les appels BYOK (`managed = false`) ainsi que les
coûts nuls. Le repository appelle la fonction avec l'horloge du service.

`subscriptions` accepte des identifiants Stripe nuls mais uniques (un compte gratuit a le statut
`none` sans client Stripe), impose un plafond strictement positif et un défaut de 1,50 USD. Les
identifiants Stripe et `current_period_end` restent renseignés par les webhooks de SPEC-210.

## Conséquences

Aucune clé brute n'a de colonne ni de chemin d'insertion ; un second compte ne lit ni chiffré, ni
appel, ni abonnement, et la vue ne rend que sa propre dépense. Le jour local est testable à minuit,
au changement d'heure et après un changement de fuseau, sans dépendre de l'horloge serveur. Le
plafond de SPEC-507 pourra réserver atomiquement sur cette base ; SPEC-505 lira le chiffré par
`getCredentialSecret`, SPEC-506 consommera `resolveTaskModel`, et SPEC-210 ajoutera ses colonnes
Stripe. Lorsque SPEC-113 ouvrira `profiles` à son propriétaire, la vue pourra redevenir
`security_invoker` sans changer son contrat.
