# ADR-0340 — La plateforme ne fournit aucun modèle d'IA ; l'abonnement est le droit d'usage, gratuit par défaut

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-19
- **Liens** : SPEC-504, SPEC-507, SPEC-602, SPEC-709, SPEC-725, SPEC-210, ADR-0011, ADR-0012, ADR-0013, ADR-0018

## Contexte

Les ADR-0011, ADR-0012, ADR-0013 et ADR-0018 faisaient d'un modèle Claude fourni par la plateforme le repli par défaut de chaque tâche d'IA, financé par un abonnement mensuel et borné par un plafond quotidien de 1,50 USD. Pour le moment la plateforme ne fournit aucun modèle : cette IA fournie, ses modèles par défaut, son plafond et la bascule automatique vers elle n'ont plus d'objet. L'onglet Modèles d'IA mêlait en outre l'abonnement et le choix des modèles.

## Décision

Aucun modèle par défaut : chaque tâche (programme, cours, lacunes, tuteur, léger) n'a de modèle que celui que l'utilisateur choisit parmi les modèles qualifiés de ses propres clés, sans repli ni bascule automatique ; sans choix valide, la tâche est indisponible avec un message renvoyant vers Paramètres, et tout ce qui ne demande pas d'IA reste utilisable. Les ADR-0011 (partie IA fournie payante), ADR-0012 (plafond de l'IA fournie), ADR-0018 (modèles Claude par tâche) sont remplacés et ADR-0013 est amendé (le choix après échec d'un modèle personnel est un autre modèle de ses clés, jamais l'IA fournie). Les règles BR-IA-01, 05, 06 et 07 sont réécrites ou retirées. L'abonnement devient un onglet Abonnement de Paramètres, séparé de Modèles d'IA : il ne porte que le droit d'utiliser l'application, gratuit par défaut, sans lien avec l'IA, sans plafond ni consommation ; le portail Stripe reste ouvert depuis cet onglet, sans bouton de souscription tant qu'aucune offre payante n'existe. Dans l'onglet Modèles d'IA, la section Mes fournisseurs vient avant Modèle par tâche, avec un état vide explicite tant qu'aucune clé n'est configurée ; l'étape IA de l'onboarding exige une clé personnelle qualifiée. Cet ordre et l'absence de carte fournie s'écartent volontairement de la maquette SCR-15.

## Conséquences

Une tâche sans modèle choisi est indisponible : il n'existe plus de chemin d'IA sans clé personnelle. Les écrans, tests et démonstrations qui supposaient un modèle Claude par défaut, un plafond ou une souscription sont adaptés ou supprimés (la démonstration SPEC-507 est retirée). Le garde-fou de coût et ses tables de consommation n'ont plus d'usage produit. La comparaison visuelle de SCR-15 ne porte plus que sur le bandeau d'introduction.
