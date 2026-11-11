# ADR-0212 — Signaux et garde-fous de baisse d'engagement V2

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-907

## Contexte

BR-AUT-14 prevoit de detecter une baisse d'engagement a partir de justesse, rapidite et sessions ecourtees, puis de proposer une pause ou un allegement, sans seuils ni frequence fixes.

## Décision

Le calcul est deterministe sur activites des quatorze derniers jours locaux avec au moins cinq reponses et trois seances terminees. Trois signaux existent : justesse des cinq dernieres reponses inferieure d'au moins vingt points de pourcentage aux dix precedentes; au moins trois des cinq dernieres reponses plus rapides que la moitie de la mediane personnelle de leur format et fausses; au moins trois des cinq dernieres seances terminees avant la moitie de leur duree prevue. Deux signaux distincts declenchent une proposition; un seul donne une indication privee sans action. L'automatisme propose pause ou allegement, requiresConsent=true; aucune modification du planning sans accord. Au plus une proposition tous les sept jours locaux par utilisateur, et aucune pendant une pause ou apres refus dans ce delai. Le journal enregistre les codes et metriques agregees, jamais le texte des reponses.

## Conséquences

SPEC-907 teste seuils, fenetres, fuseaux, refus, consentement et absence de notification excessive sans appel IA pour la detection.
