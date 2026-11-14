# ADR-0318 — Nom accessible des créneaux et cases de l'agenda

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-14
- **Liens** : SPEC-704

## Contexte

SPEC-704 ET-9 impose un nom accessible compose ({titre}, {type}, {jour} {horaire}, {statut}) sur des boutons dont le contenu visible (titre, horaire, meta, pastilles) est plus riche. La regle axe label-content-name-mismatch (WCAG 2.2 SC 2.5.3) exige que le texte visible soit inclus dans le nom accessible : l'ordre impose par la specification ne peut pas etre conserve tel quel sans violation serious.

## Décision

Le nom accessible commence par le texte visible du bouton (titre, horaire, meta, puis mention « Manquee ») et se poursuit par le type, le jour et le statut ; la case du mois est un bouton vide superpose au contenu (numéro et pastilles), son nom restant {jour}, {n} activites. L'en-tete de colonne de la semaine affiche le nom complet du jour (Lundi) pour que le nom « Afficher le Lundi 9 nov. » contienne le texte visible. Toutes les informations de la specification restent presentes dans le nom accessible.

## Conséquences

Les tests unitaires et e2e assertent le nouveau nom (ordre visible d'abord). L'ecart visuel avec la maquette reste sous le seuil de 12 % (mesures 11,30 %, 10,18 %, 10,29 %).
