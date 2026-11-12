# ADR-0274 — En-tête figé : DTO dédié, cloche sans panneau et déclencheur du menu dans l'en-tête

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-305, SPEC-304, SPEC-306, SPEC-307, SPEC-618, SPEC-707, ADR-0075, ADR-0271, ADR-0265

## Contexte

SPEC-305 doit livrer l'en-tête alors que le panneau des notifications (SPEC-306), la recherche globale (SPEC-307), la page Paramètres (SPEC-707+) et le flux de pause (SPEC-618) ne sont pas encore livrés. SPEC-304 avait laissé le déclencheur Afficher le menu dans la barre latérale (ADR-0271) et la maquette Main.dc.html le place dans l'en-tête. L'identité (prénom, initiales, repli sur l'adresse abrégée) et les compteurs (formations actives, notifications non lues) ne figurent dans aucun DTO existant.

## Décision

L'en-tête lit un DTO HeaderDto par GET /api/v1/me/header sous le client RLS de l'apprenant : firstName, lastName, emailLabel déjà abrégée côté serveur, activeFormationCount (statut active uniquement) et unreadNotificationCount (read_at nul). L'adresse complète ne quitte jamais le serveur. La cloche est un bouton nommé avec son compteur mais sans panneau : SPEC-306 remplacera ce bouton par le déclencheur du panneau. Paramètres et Mettre en pause naviguent vers /parametres et /parametres#automatismes (cible de la maquette) jusqu'à SPEC-707/SPEC-618. Le déclencheur Afficher le menu est rendu par l'en-tête ; la barre latérale expose son action show au shell et lui rend la main pour le focus après la surimpression mobile. Se déconnecter appelle la route SPEC-202, vide le cache TanStack Query puis remplace l'entrée d'historique par /connexion ; en cas d'échec le menu reste ouvert avec une alerte et n'annonce jamais une session fermée.

## Conséquences

SPEC-306 réutilise le compteur non lu et remplace le bouton par le panneau. SPEC-307 branche la soumission du champ vers /recherche. SPEC-618/707 remplacent les cibles provisoires. Le DTO HeaderDto reste la source de l'identité de la coquille et ne duplique ni la recherche ni les listes de notifications.
