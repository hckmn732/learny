# ADR-0275 — Panneau des notifications : instantané groupé côté service et lecture avant navigation

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-306

## Contexte

SPEC-306 demande un panneau groupé Aujourd'hui/Hier/Plus tôt dans le fuseau du profil, un filtre Toutes/Non lues et un marquage lu avant navigation. La spécification ne fixe ni la forme exacte du DTO ni le moment où le groupement est calculé ; le navigateur ne peut pas deviner l'horloge serveur figée des tests (ADR-0047).

## Décision

Le service authentifié renvoie une page de notifications déjà triée avec, pour chaque ligne, son groupe civil calculé avec l'horloge injectée et le fuseau IANA du profil, plus le total et le compteur non lus indépendants du filtre. Le panneau charge une page unique (50 lignes) et applique le filtre localement pour garder des compteurs stables ; les mutations de lecture passent par l'API, seules les lignes non lues écrivent, et la navigation vers la cible n'a lieu qu'après une lecture réussie. Une notification étrangère répond NOT_FOUND sans révéler son contenu.

## Conséquences

Les tests unitaires couvrent le groupement et le filtrage sans réseau ; l'intégration couvre RLS et idempotence ; le panneau peut afficher 50 notifications au plus, la pagination suivante restant disponible par le contrat GET.
