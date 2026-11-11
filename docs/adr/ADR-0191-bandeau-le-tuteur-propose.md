# ADR-0191 — Bandeau « Le tuteur propose » : variantes, refus et annulation

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-712, SPEC-722

## Contexte

BR-AUT-13 demande, pour les actions en attente, « accepter, autre créneau, annuler ». La maquette `Main.dc.html` ne montre que l'état « proposition de créneau » : « Accepter » et « Autre créneau » (qui déplie trois créneaux), puis, une fois le choix fait, un seul bouton « Annuler » qui ramène à la proposition. Rien n'indique comment refuser, ni comment afficher une proposition qui n'est pas un créneau (alléger le programme, décaler la fin), ni plusieurs propositions simultanées.

## Décision

1. Le bandeau n'affiche que les actions `pending_consent` de l'automatisme `reprise` (`reprise_proposed`, `reprise_short_proposed`, `plan_change_proposed`) et l'action qui vient d'être acceptée pendant la session de l'écran. Les cartes proposées par l'automatisme 6 restent dans la carte « Le tuteur a agi pour vous » (comme la maquette).
2. Une seule proposition est affichée : la plus ancienne non expirée. S'il en existe d'autres, un lien « N autre(s) proposition(s) » mène à `/parametres#automatismes` (journal).
3. Variante « créneau » : « Accepter », « Autre créneau » (déplie les 3 créneaux de rechange puis une pastille « Ne pas replacer » qui refuse) ; après accord ou choix d'un créneau : texte de confirmation et bouton « Annuler » qui annule l'action appliquée (statut `undone`, créneau retiré) puis fait réapparaître immédiatement une nouvelle proposition identique (comportement de la maquette).
4. Variante « grand changement » (`plan_change_proposed`) : « Voir les options » (ouvre le dialogue des options de réajustement de SPEC-705 limité à « Décaler la fin » et « Alléger le programme ») et « Pas maintenant » (refus, statut `declined`).
5. Le refus d'une proposition de créneau laisse la séance manquée au statut `missed` ; aucune nouvelle proposition n'est faite pour ce créneau.

## Conséquences

La capture par défaut reste identique à la maquette ; les contrôles de structure portent sur l'état par défaut et sur les états dépliés décrits par SPEC-712.
