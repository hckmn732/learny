# ADR-0336 — État de référence exact du jeu de démonstration

- **Statut** : Acceptée
- **Origine** : Déduite (session de recette du 18 novembre 2026 sur la pile de QA, rapport
  `qa-bugs-2026-11-18-analyse-et-plan.md`)
- **Date** : 2026-11-18
- **Liens** : SPEC-115, SPEC-712, SPEC-715, SPEC-504, SPEC-208, SPEC-012, ADR-0250, ADR-0322,
  ADR-0330, ADR-0047

## Contexte

La recette du 18 novembre 2026 sur la pile de QA a montré quatre familles d'anomalies dont la
racine est le même écart : la promesse « chaque déploiement remet les données de démonstration
dans leur état de référence » (docs/operations/coolify-qa.md §7) n'était pas tenue.

1. La seed n'écrivait qu'en `on conflict do nothing` ou `do update` : l'état **créé par
   l'application** (sessions du quiz global jouées, tentatives, réponses, créneaux déplacés) et les
   **payloads d'une version antérieure** de la seed survivaient indéfiniment. Le quiz global en
   mode micro affichait alors « Rien à revoir aujourd'hui » alors que 14 notions restaient dues,
   parce que les cinq briques de révision du référentiel portaient toutes une empreinte déjà vue.
2. La proposition « Le tuteur propose » référençait une séance manquée (`slot/m0`) et une marge
   (`slot/m0-buffer`) **jamais insérées par la seed** : ADR-0322 §14 décision 5 les déléguait au
   test e2e, que la pile de QA n'exécute pas. « Accepter » et « Autre créneau » échouaient donc
   systématiquement (404 « Séance manquée introuvable »), et les créneaux proposés chevauchaient
   par ailleurs des créneaux seedés.
3. Les comptes de démonstration n'avaient **aucun accès à l'IA** (`subscriptions.status='none'`,
   aucune clé, aucun modèle par tâche) : `resolveModel` refuse chaque tâche
   (`AI_UNAVAILABLE/no_subscription_no_key`) avant même de sélectionner le modèle simulé, si bien
   que la génération de cours, le chat du tuteur et la banque de questions restaient inertes en
   recette alors que `LLM_MODE=mock` les rend déterministes. Les suites e2e s'auto-provisionnent
   un abonnement actif, la seed ne le faisait pas.
4. Le délai de reprise seedé (24 h) plaçait la tentative 2 du module 3 à 16:30, après l'instant
   figé de l'horloge de recette (13:20 Paris) que celle-ci n'atteint jamais : le quiz de validation
   restait inpassable alors que l'agenda y invite en bouton principal.

## Décision

1) La seed **purge l'état personnel des trois comptes fictifs** avant chaque chargement (tables
personnelles, formations et groupes créés hors référentiel) : l'état de référence redevient exact,
y compris sur une base qui a dérivé ; les comptes créés à la main ne sont jamais touchés. Les
journaux de l'application ne « conservent plus leur première écriture » que pour les comptes réels.
2) La séance manquée `slot/m0` et la marge `slot/m0-buffer` vivent **dans la seed** (la marge
remplace le créneau « déjà accepté » de l'état antérieur) ; la proposition expire à l'heure de son
créneau proposé, et ses alternatives occupent des fenêtres réellement libres. La décision 5
d'ADR-0322 est caduque sur ce point.
3) Les trois comptes de démonstration sont **abonnés à l'IA fournie** (`active`, fin de période au
delà de l'horloge figée, plafond journalier confortable) pour que les parcours IA de la recette
soient exerçables en mode simulé.
4) Le délai de remédiation du jeu passe à **12 h** appliquées à la tentative ratée du mardi
16:30 : la tentative 2 est jouable à l'instant figé, avant le créneau « Tentative 2 » de 14:00.
5) La pile de QA désactive le limiteur de débit (`RATE_LIMIT_MODE=off`, interdit en production) :
avec une horloge figée, les seaux ne se rechargent jamais et la purge périodique ne traitait que le
symptôme (fenêtres de refus, `Retry-After` mensonger).

## Conséquences

Les contrôles de la seed redeviennent significatifs sur une base qui a dérivé (le mode tolérant
ne masque plus la dérive, il ne reste qu'une garde). Les tests d'intégration de la seed couvrent
la purge (dérive simulée puis rechargement) et les invariants de jouabilité (créneaux référencés
présents, alternatives libres, expiration, abonnement actif, délai atteignable, aucune réponse
résiduelle sur les briques de révision). Les baselines visuelles de l'agenda changent d'un créneau
(la marge du jeudi matin remplace le cours déjà accepté) et sont régénérées avec les e2e.
