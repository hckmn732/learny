# ADR-0319 — Session du jour : groupement des briques, donnees de demonstration et estimation

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-14
- **Liens** : SPEC-701

## Contexte

SPEC-701 suppose que SPEC-115 contient deja la session de demonstration du 11 novembre (5 items, 14 notions, 18 dues dont 4 reportees) et que SPEC-411/SPEC-513 exposent applyReviewResult et pickVariant : aucun des deux n'existe. La maquette QuizGlobal.dc.html montre en outre des echeances FSRS (Demain/Dans 2 jours/Dans 6 jours/Dans 2 semaines) et un plafonnement que le moteur reel ne produit pas, et la note EF-4 (demain si J+1) contredit le texte de demonstration (jeudi).

## Décision

1) La session du jour est construite par le service : le tirage pur buildDailySession produit un item par notion, puis le service regroupe les notions consecutives couvertes par une meme brique en un item de jeu (ordre = premiere rencontre, rendu deterministe par les due_at etales du seed). 2) Le recensement des dues pour la note et la puce Charge lissee compte toutes les notions dues du jour (in_review ou non, comme l'apercu de l'accueil SPEC-603) ; seules les notions in_review alimentent les items (BR-MEM-03). 3) Le seed de demonstration est complete : 14 in_review dont les modules 1 et 2 seulement, 4 reportees (s4, ledger, cle, ledgers) sans brique, briques de revision matching/ordering/categorization/cloze, carte de rappel de la variante conforme a la maquette (origine resource). 4) estimatedSec = somme par item de REVIEW_FORMAT_SECONDS[format] + 30 s par notion supplementaire (REVIEW_EXTRA_NOTION_SECONDS), soit 585 s pour la demonstration, arrondi a 10 min. 5) Les echeances affichees sous les boutons d'auto-evaluation sont les valeurs FSRS reelles (ADR-0025) : les libelles de la maquette sont illustratifs. 6) applyReviewResult est implemente dans services/learning (une notion par transaction, planNotionReviews + persistStep reexportes) ; pickVariant/requestRefill dans services/question-bank (adaptateur de SPEC-513). 7) daily_activity et la serie sont ecrits a la cloture seulement (regle incrementale : jour qualifiant non encore compte -> serie + 1 si la veille qualifie, streak_computed_on = jour) ; evenements review/answered emis par notion avec le contrat existant de packages/contracts/src/events.ts. 8) La note du selecteur affiche toujours le nom du jour (jeudi) et non demain, pour respecter les textes de demonstration de la section 10 et le critere CA-7. 9) Les etats `empty` et `paused` n'ont ni activite ni tentative : `sessionId` et `attemptId` sont nullables dans `GlobalQuizSessionDto`, et les champs d'en-tete valent la chaine vide (aucun en-tete rendu). 10) Le tirage ne lit que les briques de revision (`bricks.purpose in ('review','bank')`) : une brique de quiz de validation, d'examen ou d'exercice ne peut jamais devenir un jeu du quiz global.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
