# ADR-3010 — Adaptations tactiles des interactions du web

- **Statut** : Acceptée
- **Origine** : Déduite (préparation de la piste mobile)
- **Date** : 2026-11-22
- **Liens** : ADR-3003, ADR-3009, BR-TUT-01, BR-TUT-02, BR-TUT-06, SPEC-3302, SPEC-3303

## Contexte

Plusieurs règles décrivent des interactions de bureau : sélection d'un texte d'au moins 12
caractères pour interroger le tuteur (BR-TUT-01), Entrée / Maj+Entrée / Échap dans le panneau du
tuteur (BR-TUT-06), panneau de contexte avec éléments retirables (BR-TUT-02). Le mobile n'a ni
clavier physique garanti, ni sélection exploitable dans un rendu Markdown natif, ni place pour un
panneau latéral.

## Décision

1. **Interroger sur un passage** : appui long sur une section du cours → menu « Demander au
   tuteur sur ce passage » ; le passage transmis est la section entière (borne de longueur du
   contrat appliquée).
2. **Envoi et fermeture** : bouton d'envoi citron ; le retour à la ligne est la touche Entrée du
   clavier virtuel ; un clavier physique connecté suit BR-TUT-06 (Entrée envoie, Maj+Entrée va à
   la ligne). Fermeture par la croix, le geste de la feuille, le fond ou le retour Android ; le
   focus revient au bouton d'ouverture.
3. **Contexte transmis** : la feuille affiche une ligne « Contexte · N éléments » qui ouvre une
   fiche listant les éléments (formation, cours et chapitre avec % lu, passage, apports, lacune
   suivie, profil) avec un interrupteur par élément ; seuls les éléments inclus sont envoyés.
4. « Nouvelle discussion » est une action du menu de la feuille.

## Conséquences

- Les règles BR-TUT-01, BR-TUT-02 et BR-TUT-06 sont couvertes par ces équivalents tactiles sur
  mobile ; le web n'est pas modifié.
