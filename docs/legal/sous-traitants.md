# Sous-traitants et fournisseurs

Liste des fournisseurs configurés par Learny qui peuvent traiter des données personnelles (BR-PLA-05, ADR-0045). Une région inconnue est marquée « à vérifier » et bloque la publication publique tant qu’elle n’est pas confirmée.

| Fournisseur | Rôle | Données traitées | Région connue | Statut |
|---|---|---|---|---|
| Supabase | Base Postgres, authentification, stockage privé, liens signés | Compte, profil, formations, cours, progression, fichiers | Union européenne (Francfort, projet de production) | Connue |
| Vercel | Hébergement de l’application web Next.js et exécution serveur | Requêtes HTTP, journaux techniques, secrets d’environnement | Union européenne (`fra1`) | Connue |
| Inngest Cloud | Orchestration des jobs et crons (événements, reprises) | Identifiants et données d’événements nécessaires aux tâches | à vérifier | Bloquant si des données personnelles y transitent |
| Anthropic | Modèle d’IA fourni par défaut (cours, tuteur, correction) | Passages de ressources, consignes et sorties nécessaires à la tâche | États-Unis (région exacte à vérifier) | Connue, garanties de transfert à vérifier |
| OpenAI | Fournisseur BYOK optionnel choisi par l’apprenant | Passages et consignes envoyés avec la clé personnelle | à vérifier | À vérifier |
| Mistral AI | Fournisseur BYOK optionnel choisi par l’apprenant | Passages et consignes envoyés avec la clé personnelle | Union européenne | Connue |
| DeepSeek | Fournisseur BYOK optionnel choisi par l’apprenant | Passages et consignes envoyés avec la clé personnelle | à vérifier | À vérifier |
| Voyage AI | Calcul des embeddings de recherche sémantique | Passages de ressources découpés en texte | à vérifier | Bloquant si des données personnelles y transitent |
| API de recherche web | Recherche de compléments en ligne (repli) | Requêtes de recherche dérivées du sujet | à vérifier | À vérifier |
| Resend | Envoi des e-mails transactionnels et de notification | Adresse e-mail, prénom, contenu du message | à vérifier | Bloquant si des données personnelles y transitent |
| Stripe | Paiement et gestion de l’abonnement | Identifiant client, statut d’abonnement, données de paiement traitées par Stripe | Irlande / États-Unis selon l’entité | Connue, garanties de transfert à vérifier |
| Sentry | Collecte des erreurs applicatives et diagnostics | Identifiant de requête, route, code d’erreur, identifiant utilisateur pseudonymisé | Union européenne si configuré ainsi | À vérifier selon le projet |
| Service de notifications navigateur (Web Push) | Remise des notifications au navigateur de l’apprenant | Endpoint d’abonnement, clés publiques, contenu de la notification | Dépend du navigateur et de son fournisseur | À vérifier |

## Règles

- Chaque fournisseur n’accède qu’aux données nécessaires à sa mission et selon le contrat applicable.
- Les clés personnelles d’IA sont chiffrées côté serveur ; elles ne sont jamais transmises à un autre fournisseur que celui choisi pour la tâche.
- Les transferts hors de l’Espace économique européen s’appuient sur les garanties appropriées prévues par la réglementation.
- Une région « à vérifier » qui concerne un traitement de données personnelles empêche d’annoncer la publication prête : la valeur est complétée ou le fournisseur est retiré.
- Cette liste est mise à jour avec le registre des traitements ; elle ne contient aucun secret ni valeur de configuration.
