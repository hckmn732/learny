# ADR-0266 — Canal push : paquet notifications partagé, refus neutre d'un endpoint étranger et mock déterministe

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-205, ADR-0055, ADR-0244

## Contexte

SPEC-205 doit créer packages/notifications (nommé aussi par SPEC-204 et SPEC-209), refuser l'endpoint d'un autre compte sans révéler son existence (CL-3), simuler le service push sans réseau (EF-6) et écrire le journal de livraison de SPEC-109 pour le canal push (EF-5, ET-5). La spécification ne fixe ni le code HTTP du refus, ni la forme du mode mock, ni l'état du journal sans abonnement.

## Décision

Le paquet @learny/notifications est créé avec une entrée par canal (./push ici, ./email par SPEC-204) ; il dépend de core, config, contracts et db seulement et déclare ses contextes d'exécution de façon structurelle pour que @learny/services puisse en dépendre sans cycle. Un endpoint déjà enregistré par un autre compte est refusé par la contrainte unique(endpoint) et renvoyé comme FORBIDDEN 403 avec un libellé neutre (« Cet abonnement ne peut pas être enregistré sur ce compte. ») ; la lecture et le retrait passent sous RLS, un retrait étranger répond 204 sans rien supprimer. PUSH_MODE=mock utilise un transport en mémoire dont le résultat est choisi par le dernier segment du chemin de l'endpoint (success → 201, missing → 404, gone → 410, transient → 503) sur l'hôte réservé push.mock.learny.test ; PUSH_MODE=live construit le transport web-push avec les clés VAPID du serveur, refuse de démarrer sans elles et est refusé quand CI est défini. sendPush appelle le service hors transaction puis applique en une transaction les compteurs, les suppressions (404/410 immédiat, cinquième échec) et une seule ligne notification_deliveries par (notification, push) : sent, failed/gone quand tous les abonnements ont disparu, failed/transient (retryable) sinon, skipped_pref/no_subscription quand l'apprenant n'a aucun abonnement ; une ligne sent n'est jamais rouverte (ADR-0244). La vérification d'endpoint est syntaxique (HTTPS, hôte public sans IP, localhost ni suffixe local, 2 048 caractères) ; aucune résolution DNS, et web-push ne suit aucune redirection.

## Conséquences

SPEC-204 complète le même package.json (export ./email) ; SPEC-209 réutilise sendPush et ses codes d'erreur sûrs. La page SDD exécute le vrai flux client (lib/push.ts) contre un navigateur simulé : aucune permission réelle n'est demandée pendant les tests.
