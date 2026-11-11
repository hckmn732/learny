# ADR-0210 — Selection d'une revision pour la retention a un et deux mois

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-408

## Contexte

BR-MEM-06 mesure la part des notions reussies parmi celles revues dans les fenetres J+30 et J+60 +/-3 jours, sans preciser comment compter plusieurs revisions d'une meme notion dans la meme fenetre.

## Décision

Chaque notion contribue au plus une fois par horizon. Parmi ses revisions dans la fenetre inclusive J+27..33 ou J+57..63 apres validation du module, retenir la premiere revision chronologique; en cas de meme timestamp, departager par identifiant de journal croissant. Cette premiere tentative mesure le rappel avant les nouvelles repetitions de la fenetre. Le denominateur compte les notions ayant cette revision; aucune revision donne rate=null plutot que zero. Les calculs utilisent les instants UTC du journal et les bornes de jours calendaires du fuseau utilisateur passe en entree.

## Conséquences

SPEC-408 et ses tests mesurent un resultat stable independant de l'ordre des lignes SQL et n'ameliorent pas artificiellement la retention par repetitions dans la meme fenetre.
