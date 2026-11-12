# ADR-0282 — Compléments d’implémentation de la détection des lacunes

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-404, ADR-0024

## Contexte

SPEC-404 fixe les règles BR-LAC-02 à BR-LAC-06 mais son contrat ET-1 abrège detectGap sans état de lacune existant, sa règle d’application ne nomme pas le format d’une question de définition, la nature résiduelle d’une maîtrise basse sans signal n’est pas définie, et la levée ne précise ni l’origine des réussites ni le traitement des lacunes déjà levées. Les valeurs de temps (7 jours, 1 jour) peuvent aussi se lire en jours civils ou en durées écoulées.

## Décision

1. Les tentatives qualifiantes sont `validation_quiz`, `exercise` et `mock_exam`. La détection par
   tentative n’a lieu que si la dernière tentative comptée de la notion est qualifiante, contient un
   échec et si la maîtrise est sous le seuil : une maîtrise basse seule (CL-1) ou une réussite
   qualifiante postérieure ne crée pas de lacune.
2. Les durées sont absolues : 7 × 24 h pour l’oubli et 24 h pour l’écart de levée, donc 23 h 59 ne
   lève pas (CL-4) ; aucun calcul de jour civil ni de fuseau n’intervient, l’instant injecté suffit.
3. Une réponse notée sans verdict est un échec si `score / maxScore < failureRatio` et une réussite
   sinon ; les réussites de toute source (échauffement, quiz global, quiz de validation) comptent
   pour la levée.
4. La nature résiduelle d’une détection sans signal est `misunderstanding` ; une lacune active ne
   change de nature que vers une nature de priorité supérieure (confusion > application >
   incompréhension > oubli) et émet `nature_changed`, jamais une seconde lacune.
5. `clearGap` ne retient que les réussites de la notion (filtre optionnel), datées au moins à la
   détection et au plus à `now`, et fixe `clearedAt` à `now` ; `detectGap` renvoie le prochain état
   stocké, y compris une lacune déjà levée quand aucun nouveau signal n’apparaît.

## Conséquences

SPEC-411 persiste gap et event sans recalcul ; les tests d’intégration vérifient que DEFAULT_GAP_PARAMS reflète ENGINE.gaps et ENGINE.mastery.threshold.
