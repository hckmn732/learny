# ADR-0284 — Contrats d’implémentation du tirage d’une tentative

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-405, SPEC-611, ADR-0014, ADR-0143, ADR-0170

## Contexte

SPEC-405 place le module dans src/questions/draw-attempt.ts alors que le paquet réserve src/draw/ depuis SPEC-401 ; son ET-1 abrège l’entrée sans paramètres métier alors que la section 14 exige des bornes fournies par l’appelant et interdit l’import de @learny/config. Le texte ne précise pas quels formats comptent dans la part choix, comment une brique liée à plusieurs notions remplit les quotas, ni la forme exacte du rapport d’épuisement. ADR-0143 fixe déjà les quotas, la priorité au-delà de 20 notions et l’ordre de sortie, ADR-0170 la part choix.

## Décision

1. Le module est src/draw/draw-attempt.ts, exporté par src/draw/index.ts puis src/index.ts ; src/questions/ n’est pas créé. 2. L’entrée ajoute params obligatoire (ENGINE.draw et masteryThreshold) et targetCount facultatif (défaut params.defaultSize) ; la fonction n’importe jamais @learny/config et valide les bornes. 3. Sont éligibles les briques actives, valides, possédées, à empreinte non nulle, liées à au moins une notion demandée, de format choice_question, cloze ou matching (part choix d’ADR-0170) ou open_question (part ouverte) ; les empreintes vues sont exclues et les doublons d’empreinte dédupliqués en gardant la variante couvrant le plus de notions demandées puis l’ordre canonique. 4. Une question compte pour toutes ses notionIds ; une notion est couverte si une question retenue la cite. Les quotas suivent ADR-0143 : base 1 par notion couverte, supplément au plus fort reste avec poids lacune 3, maîtrise sous seuil 2, autre 1 ; priorité lacune (nature), maîtrise croissante, ordre du programme. Au-delà de 20 notions ou de targetCount, coverageLimited et uncoveredNotionIds signalent la limite. 5. Le nombre d’ouvertes vaut max(1, arrondi(0,3 × N)) et est réparti par priorité, une par notion puis en boucle dans la limite des quotas ; la sortie place les choix puis les ouvertes, entrelacés par notion et mélangés par graine. 6. Le rapport exhausted est par notion avec reason capacity, bank_exhausted ou size_limit, requested, selected et formats ; exhaustedFormats, minimumReached et diagnostics complètent le signal. Aucune question n’est inventée. 7. Les points valent totalPoints / taille arrondis au centième, le dernier absorbant l’écart ; tout l’ordre est canonique et reproductible par createSeededRandom(seed).

## Conséquences

SPEC-611 transmet {...ENGINE.draw, masteryThreshold: ENGINE.mastery.threshold} et traite uncoveredNotionIds/exhaustedFormats ; les tests SPEC-405 vérifient les quotas, l’exclusion par empreinte, le déterminisme et les cas d’épuisement.
