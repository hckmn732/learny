# Registre des traitements

Ce registre décrit les traitements de données personnelles de Learny (BR-PLA-05, ADR-0045). Il est mis à jour avec la liste des sous-traitants et les capacités réellement livrées. Les durées et les droits renvoient aux règles BR-ACC-10 et BR-ACC-11.

| Traitement | Finalité | Données | Base de traitement | Durée | Accès | Suppression |
|---|---|---|---|---|---|---|
| Compte | Créer, authentifier et sécuriser le compte ; vérifier l’adresse e-mail | Nom, prénom, e-mail, identifiant, méthode de connexion, jetons de session, fuseau horaire | Exécution du contrat ; intérêt légitime pour la sécurité | Vie du compte, puis J+30 après la demande | Apprenant, personnels habilités, Supabase Auth | Suppression en cascade avec le compte à J+30 |
| Profil et préférences | Personnaliser le ton, la langue, le rythme et les rappels | Nom, prénom, langue, ton, fuseau, rythme, préférences de notification | Exécution du contrat | Vie du compte | Apprenant, services applicatifs | Effacement avec le compte ; export disponible avant |
| Apports et ressources | Extraire et indexer les documents, notes, pages et vidéos fournis | Fichiers importés, contenu extrait, métadonnées, empreintes, passages indexés | Exécution du contrat | Vie de la formation ou du compte | Apprenant, service d’ingestion, fournisseur d’embeddings | Suppression à la demande ou avec le compte ; objets privés effacés |
| Formations, cours et progression | Produire le programme, les cours, les révisions, les quiz et mesurer l’apprentissage | Titres, objectifs, modules, notions, tentatives, résultats, maîtrise, lacunes, série, agenda | Exécution du contrat | Vie du compte | Apprenant, moteur d’apprentissage, membres d’une formation partagée pour les seules données prévues | Effacement avec le compte ; export ZIP avant suppression |
| Tuteur IA et automatismes | Répondre aux questions, proposer des actions et exécuter les automatismes demandés | Messages, contexte de formation, briques produites, actions acceptées ou refusées, consommation | Exécution du contrat ; intérêt légitime pour la sécurité et la maîtrise des coûts | Vie du compte ; journal d’appels purgé selon la politique de sécurité | Apprenant, services IA, fournisseur choisi | Effacement avec le compte ; aucune clé personnelle dans les journaux |
| Notifications | Envoyer les rappels et messages choisis par les canaux activés | E-mail, préférences, abonnement navigateur, statut d’envoi, dates | Exécution du contrat ; consentement pour le canal navigateur | Durée nécessaire à l’envoi, puis purge | Apprenant, service de notifications, fournisseur d’e-mail | Désinscription, suppression des abonnements et avec le compte |
| Facturation | Gérer l’abonnement (droit d’usage de l’application) et les obligations comptables | Identifiant client, statut d’abonnement, identifiants de transaction, montants, dates | Exécution du contrat ; obligations légales | Durée légale de conservation comptable | Apprenant, service de facturation, prestataire de paiement | Anonymisation ou effacement à l’issue de la durée légale |
| Sécurité et journaux | Détecter les abus, limiter le débit et diagnostiquer les erreurs | Identifiant de requête, route, statut, code d’erreur, adresse réseau hachée ou tronquée, identifiant utilisateur | Intérêt légitime à sécuriser le service | Durée limitée au nécessaire, purge planifiée | Personnels habilités, prestataires d’observabilité | Purge automatique ; pas de contenu personnel dans les traces d’erreur |

## Principes

- **Minimisation** : seules les données nécessaires à la finalité sont collectées ; les journaux ne conservent ni secret ni clé personnelle.
- **Isolation** : chaque apprenant n’accède qu’à ses propres lignes via les politiques RLS ; une formation partagée n’expose que les faits prévus (prénom, module en cours, modules validés, série).
- **Sous-traitance** : tout fournisseur traitant des données personnelles figure dans `docs/legal/sous-traitants.md` avec sa région connue ou la mention « à vérifier ».
- **Droits** : l’export est préparé en moins de quinze minutes en cible et reste téléchargeable sept jours ; la suppression prend effet à J+30 et reste annulable jusque-là.
- **Cookies** : seuls les cookies et stockages strictement nécessaires sont utilisés ; aucun bandeau de consentement n’est affiché.

## Tenue du registre

Toute nouvelle capacité ou nouveau fournisseur met à jour ce registre dans la même livraison. Une région inconnue pour un fournisseur recevant des données personnelles est marquée « à vérifier » et bloque la publication tant qu’elle n’est pas documentée.
