# ADR-0208 — Contrat des dialogues pedagogiques V2

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-904, SPEC-905

## Contexte

Les mises en situation et le jeu Explique a un debutant ajoutent des dialogues avec le tuteur, alors que les contrats V1 ne fixent ni nombre de tours, ni cloture, ni notation comparable.

## Décision

Une activite de dialogue V2 porte role, contexte, objectif, condition de fin, criteres de bareme et version du scenario. Une tentative a au plus douze tours apprenant/tuteur; elle se termine par condition de fin validee, choix explicite Terminer ou plafond. Le serveur stocke chaque tour et son ordre, reprend sans doubler un message, puis le tuteur propose une correction structuree que le code borne au bareme sur 10. Une mise en situation met a jour la maitrise via le service d'apprentissage; Explique a un debutant ajoute aussi une note FSRS uniquement apres evaluation finale, jamais apres chaque tour. Les tests IA utilisent des fixtures mock; un fournisseur indisponible conserve la tentative reprenable sans score invente.

## Conséquences

SPEC-905 cree le moteur de dialogue et SPEC-904 le reutilise pour le jeu novice; les tests couvrent reprise, plafond, correction et absence de double mise a jour.
