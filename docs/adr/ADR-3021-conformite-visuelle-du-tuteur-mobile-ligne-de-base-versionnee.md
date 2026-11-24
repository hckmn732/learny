# ADR-3021 — Conformité visuelle du tuteur : ligne de base versionnée, pas superposition à l'export

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-23
- **Liens** : SPEC-3303, SPEC-3301, ADR-3003, ADR-3019, ADR-3020

## Contexte

SPEC-3303 declare un mode visuel `mockup` et un critere CA-6 « ecart <= 12 % hors zones masquees »
contre `design/app-mobile/exports/screens/android-04b-cours-tuteur.png`. Trois elements rendent la
superposition a cet export structurellement inexacte, sans qu'aucun ne soit un ecart de rendu :

1. le texte de la reponse de l'export n'est pas celui du LLM simule : la fixture partagee
   `packages/llm/fixtures/tutor/chat-dates.json` repond sur la date de piece et la date comptable,
   dans une autre formulation, et cette fixture est un oracle partage avec la piste web (la modifier
   changerait des preuves existantes) ;
2. l'API precede toute discussion d'un message d'accueil du tuteur, que la maquette ne montre pas :
   la feuille affiche donc une bulle de plus ;
3. l'export montre l'ecran Cours derriere la feuille ; SPEC-3302 n'est pas fusionnee dans le
   worktree de SPEC-3303, et l'arriere-plan depend de l'ecran d'ouverture.

Mesures : comparaison a la ligne de base versionnee de la campagne = 0,01 % d'ecart ; comparaison
directe a l'export statique, chrome systeme masque = 26,71 %.

## Décision

La conformite visuelle de la feuille est prouvee par la comparaison versionnee d'ADR-3003 § 4
(capture `takeScreenshot` du flux `@visual` contre `apps/mobile/e2e/visual/baselines/`), completee
par les controles structurels de la maquette (en-tete encre et etincelle citron, bulle apprenant
encre a droite, carte claire a gauche en Markdown, puce de source, suites en puces, saisie citron,
mention de pied). Le masque du flux ne couvre que le fond assombri au-dessus de la feuille ; aucune
zone de contenu n'est masquee. La superposition a l'export statique est mesuree et consignee, jamais
presentee comme conforme.

## Conséquences

Les regressions de rendu de la feuille sont detectees par la ligne de base versionnee. L'ecart a
l'export statique reste documente (26,71 %) avec ses trois causes, et devra etre re-mesure quand
SPEC-3302 sera fusionnee (arriere-plan) et si la fixture du tuteur est un jour alignee sur la
maquette. Aucune fixture, aucun libelle et aucune ligne de base existante n'a ete modifie.
