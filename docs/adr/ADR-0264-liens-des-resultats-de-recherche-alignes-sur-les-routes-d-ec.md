# ADR-0264 — Liens des résultats de recherche alignés sur les routes d'écran

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-212, SPEC-112, SPEC-307, ADR-0046

## Contexte

SPEC-212 EF-5 donne des exemples de href (notion /formations/<fid>/notions/<nid>, chapitre /formations/<fid>/modules/<mid>/cours#<sectionId>) qui ne correspondent ni à la fonction search_user_content livrée par SPEC-112 ni aux routes d'écran de docs/product/screens.md (SCR-05 /formations/[fid]/programme, SCR-07 /formations/[fid]/modules/[mid]/cours?chapitre=[cid]). ADR-0046 n'impose que des chemins en français ; suivre EF-5 à la lettre produirait des liens morts vers des écrans inexistants.

## Décision

Les href de la recherche sont ceux que produit search_user_content, alignés sur les routes réelles de screens.md : formation /formations/<fid>/programme, notion /formations/<fid>/programme#notion-<nid>, chapitre /formations/<fid>/modules/<mid>/cours?chapitre=<chapterId>. Le service valide seulement qu'il s'agit d'un chemin interne relatif commençant par / et ne réécrit pas le lien. Les exemples de notion et de chapitre d'EF-5 sont remplacés par cette décision ; l'exemple de formation est inchangé.

## Conséquences

SPEC-307 affiche href tel quel sans transformation. Si une route d'écran change, la fonction SQL de SPEC-112, le contrat de SPEC-212 et la spécification sont mis à jour dans le même commit (hypothèse de SPEC-212 §15). Aucun lien mort n'est exposé par l'API.
