# ADR-0183 — Règles d'affichage de l'agenda

- **Statut** : Acceptée
- **Origine** : Déduite (préparation du référentiel, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-704, SPEC-705

## Contexte

La maquette `Agenda.dc.html` code en dur une seule formation (2 nov. – 11 déc.), une plage 09:00–18:00, une semaine de cinq jours et six couleurs, alors que BR-AGE-01/02 couvrent plusieurs formations, douze types de créneaux et des semaines avec week-end.

## Décision

1. Bornes de navigation = [plus petite date de début, plus grande date de fin] des formations visibles dans le filtre ; la légende « Formation : début – fin » du mini-calendrier affiche la période de la formation filtrée, ou de la formation en cours du menu (ADR-0075) quand le filtre est « Toutes les formations ».
2. Plage horaire de la grille : de min(09:00, premier début) à max(18:00, dernière fin), par heures entières.
3. La vue Semaine montre lundi-vendredi, plus samedi et dimanche s'ils sont des jours d'étude ou portent un créneau ; en vue Jour, précédent/suivant sautent les jours sans étude ni créneau.
4. Couleurs : les six couleurs de la maquette, les types complémentaires héritent de la couleur la plus proche (examen blanc = quiz de validation ; sprint, échauffement, micro-séance, révision = quiz global ; bilan de la semaine = neutre `#F4F4F1`/`#3F3F46`) ; la légende ajoute un libellé pour un type complémentaire seulement s'il est présent dans la période.
5. Vue Mois : pastille d'un créneau d'une autre formation que la formation en cours = `{sigle} · {HH:MM}`.
6. Statuts `moved` et `cancelled` non affichés ; `missed` affiché avec la mention « Manquée ».
7. Sélection par défaut : premier créneau de la période dont la fin est future, sinon le premier de la période.

## Conséquences

Légère différence textuelle possible avec la maquette sur les pastilles du mois (« AG · 17:30 » au lieu de « Agile · 17:30 »), tolérée par le seuil visuel.
