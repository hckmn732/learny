# ADR-0276 — Recherche globale : panneau non modal et page rendue côté serveur

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-307, SPEC-305, SPEC-212, SPEC-303, ADR-0034, ADR-0270, ADR-0274

## Contexte

SPEC-307 branche le champ de recherche de l'en-tête et la page `/recherche?q=` sur le service et l'API de SPEC-212. La maquette du panneau de notifications fixe la largeur (400 px), le rayon (20), l'ombre et la superposition du panneau, mais SCR-18 n'a pas de maquette propre. Le composant `Popover` de `@learny/ui` (Radix) déplace le focus dans son contenu, ce qui entre en conflit avec le motif ARIA combobox : le focus doit rester dans le champ et `aria-activedescendant` désigner l'option active. Il faut aussi garantir qu'une réponse lente d'une ancienne requête ne remplace jamais la plus récente.

## Décision

Le champ de l'en-tête est un combobox ARIA rendu dans le formulaire existant (`action="/recherche"`) : sans JavaScript il soumet la requête, avec JavaScript il interroge `GET /api/v1/search` après 150 ms de pause et à partir de deux caractères normalisés (NFKC, espaces réduits). Chaque changement annule la requête précédente par `AbortController` et incrémente une séquence qui ignore toute réponse tardive. L'état de chargement est dérivé de la requête et de la tentative, jamais posé depuis un effet, ce qui évite les rendus en cascade. Le panneau est un popup non modal ancré sous le champ, qui reprend exactement les jetons du panneau de notifications (largeur 400 px, `max-width: calc(100vw - 32px)`, rayon 20, `shadow-popover`, `z-popover`) au lieu de réutiliser `Popover` : le focus reste dans l'entrée, les flèches déplacent l'option active, Entrée ouvre son lien, Échap ferme le panneau sans effacer la saisie et Tab suit l'ordre normal.

La page SCR-18 est rendue côté serveur : le composant lit `?q=`, appelle le même service `searchUserContent` sous la session de l'apprenant et la RLS, avec la limite maximale du contrat (20 par catégorie). Moins de deux caractères, une requête hors bornes, un résultat vide et une erreur ont des états distincts et des textes français de `apps/web/messages/fr.ts`. Les extraits et titres sont toujours du texte : les positions de surlignage du contrat sont rendues dans des `<mark>`, jamais en HTML brut ; les liens profonds sont les URL validées du service.

## Conséquences

SPEC-306 peut réutiliser les mêmes jetons pour son panneau et SPEC-307 ne dépend pas de son implémentation. Toute évolution future du combobox doit conserver le focus dans l'entrée et l'annulation des requêtes. La page `/recherche` reste une route serveur protégée par le proxy ; une session expirée est redirigée vers `/connexion`. Les captures de non-régression de l'en-tête (SPEC-305) ne changent pas : le panneau est absent du DOM visuel tant qu'il est fermé.
