# ADR-0170 — Formats et barème du quiz de validation

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-611, SPEC-612, SPEC-405

## Contexte

BR-QUI-01 et ADR-0014 parlent de « questions à choix et questions ouvertes » (environ 70 % / 30 %), mais la maquette `Quiz.dc.html` montre aussi un texte à trous (question 5) et une association (question 6). La correction immédiate (BR-QUI-04) ne peut pas s'appliquer aux questions ouvertes, corrigées par le tuteur à la soumission.

## Décision

1. La part « questions à choix » d'ADR-0014 regroupe les formats **corrigés par le code** : `choice_question` (choix unique ou multiple), `cloze` (texte à trous) et `matching` (association). Au moins la moitié de ces questions sont des `choice_question`. La part « ouvertes » (`open_question`) vaut `round(0,3 × N)`, au minimum 1.
2. Barème : 100 points répartis à parts égales entre les N questions (`100 / N`, sans arrondi intermédiaire). Une `choice_question` rapporte 0 ou la totalité de ses points ; `cloze` et `matching` rapportent la proportion de trous ou de paires justes ; une ouverte rapporte la note du tuteur ramenée à [0, 1]. Le score est stocké en `numeric(5,2)` et affiché arrondi à l'entier.
3. « Vérifier » sur une question ouverte enregistre et verrouille la réponse et affiche « Réponse enregistrée. Le tuteur la corrigera à la fin de la tentative. »
4. Une question `cloze` ou `matching` est « juste » pour la lacune et FSRS si sa proportion est 1 ; partielle sinon (réussite = proportion pour la maîtrise, ADR-0024).
5. La tentative est réussie si le score non arrondi ≥ seuil du module.

## Conséquences

Le tirage (SPEC-405) reçoit la répartition par format ; les banques (SPEC-513) doivent contenir des variantes `cloze` et `matching` pour les notions du module.
