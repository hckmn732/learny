---
id: SPEC-3201
title: Écran Aujourd'hui
phase: P32
priority: mobile
depends_on: [SPEC-3102]
business_rules: [BR-PRO-02, BR-AUT-01, BR-AUT-12, BR-AUT-13, BR-GAM-01, BR-GAM-02, BR-MEM-06]
screens: [SCR-03]
adrs: [ADR-3002, ADR-3003, ADR-3005, ADR-0190]
visual: mockup
---

# SPEC-3201 — Écran Aujourd'hui

## 1. Objectif

Livrer l'onglet Aujourd'hui : la séance du jour mise en avant, les indicateurs série, rétention
et lacunes, les actions du tuteur à accepter ou annuler et la suite de la journée, avec les
fiches de détail et le report de séance.

## 2. Contexte

Maquette : écran 02 « Aujourd'hui » (`view.html#screen=today`, fonction `today` de
`design/app-mobile/assets/screens.js`, exports `{ios,android}-02-aujourdhui.png`), feuilles
série, rétention, lacunes, séance et reprise décrites dans `design/app-mobile/README.md`
§ Interactions du prototype « Aujourd'hui ». Équivalent web : SCR-03 (`Main.dc.html`), SPEC-603,
SPEC-712, SPEC-714, SPEC-720, SPEC-722, SPEC-723. Contrats : `packages/contracts/src/home.ts`
(`GET /home`, `HomeDto`), `accueil-le-tuteur-a-agi-pour-vous.ts` et `automations.ts`
(`/me/automation-actions`), `serie-regularite-et-jalons-interface.ts` (`GET /streak`),
`agenda-deplacer-et-reajuster-le-planning.ts` (alternatives et déplacement de créneau).
Dérivations : `@learny/domain` `home/derive.ts` (`highlightedSlot`, `slotState`,
`minutesUntil`, `formatDuration`, `primaryActionFor`, `slotLabel`) — à réutiliser, jamais à
réécrire (ADR-3005).

## 3. Dépendances

- **SPEC-3102** (coquille, en-tête, feuilles, états communs).
- Données de démonstration SPEC-115 : quiz de validation à 14:00 (tentative 2, seuil 80 %),
  série de 12 jours, rétention 86 %, 4 lacunes, quiz global à 17:00.

## 4. Règles métier couvertes

- BR-PRO-02 — Carte « Votre séance » (activité mise en avant par `highlightedSlot` : type,
  titre, détail, heure, barre heures faites / prévues, « Commencer · N min », « Plus tard ») et
  section « À suivre » (activités restantes du jour avec statut Fait / Dans N min / À venir).
- BR-AUT-01 — Proposition de reprise d'une séance manquée : « Accepter » / « Autre créneau »
  (créneaux proposés par l'API).
- BR-AUT-12 — « Tout voir » ouvre le journal des actions de la semaine (feuille) avec « Annuler ».
- BR-AUT-13 — Section « Le tuteur a agi » : actions en attente (accepter, autre créneau, annuler)
  et actions récentes (annuler/confirmer), avec les libellés du web.
- BR-GAM-01 — La série affichée est celle calculée par le serveur (`GET /streak`).
- BR-GAM-02 — Fiche « Série » : nombre de jours et régularité des 14 derniers jours.
- BR-MEM-06 — Carte et fiche « Rétention » : valeur à 1 mois (et à 2 mois dans la fiche).

## 5. Exigences fonctionnelles

- **EF-1** — En-tête : sur-titre date longue (« Mercredi 11 novembre »), titre « Aujourd'hui »,
  cloche et compte (SPEC-3102).
- **EF-2** — Carte encre « Votre séance » : étiquette citron « VOTRE SÉANCE », heure, titre,
  détail (« Comptabilité générale · tentative 2 · seuil 80 % »), barre de progression citron,
  « 3 h faites » / « 5 h prévues », bouton citron « Commencer · 40 min » (navigation donnée par
  `primaryActionFor` : quiz → SPEC-3304, cours → SPEC-3302, quiz global → SPEC-3305, autre →
  web), bouton contour « Plus tard ».
- **EF-3** — « Plus tard » ouvre la fiche « Reporter la séance » : trois créneaux
  (`GET /slots/:id/alternatives`), choix → `POST /slots/:id/move` ; toast « Séance déplacée à … ».
- **EF-4** — Trois `StatCard` : « Série » (citron, « 12 jours »), « Rétention » (« 86 % »),
  « Lacunes » (« 4 notions ») ; chacune ouvre sa fiche ; la fiche Lacunes liste les notions et
  propose « Voir mes lacunes sur le web ».
- **EF-5** — Section « Le tuteur a agi » + « Tout voir » : cartes d'action (pastille de type
  « SÉANCE REPLACÉE », « CARTE CRÉÉE »…, texte, actions « Accepter » / « Autre créneau » /
  « Voir la carte » / « Annuler ») ; `POST /me/automation-actions/:id/(accept|decline|undo)` avec
  mise à jour optimiste et retour arrière en cas d'échec.
- **EF-6** — Section « À suivre » : activités suivantes du jour ; appui → même navigation qu'EF-2.
- **EF-7** — Échauffement du jour présent (`GET /warmups/today`) : carte « Échauffement ·
  N questions · 2 min » avant « À suivre », qui ouvre le jeu d'échauffement (SPEC-3305).
- **EF-8** — Tirer pour rafraîchir ; rafraîchissement au premier plan.
- **EF-9** — Journée sans activité : carte « Rien de prévu aujourd'hui » et prochaine activité.

## 6. Exigences techniques

- **ET-1** — Hooks `useHome()`, `useStreak()`, `useAutomationActions()`, `useWarmupsToday()`
  (clés `['home']`, `['streak']`, `['automation-actions']`, `['warmups','today']`).
- **ET-2** — « Dans N min » recalculé chaque minute depuis `clock.now()` tant que l'écran est
  visible (`minutesUntil`).
- **ET-3** — Les mutations invalident `['home']` et `['agenda']`.
- **ET-4** — Libellés repris du web depuis `@learny/i18n` (accueil, automatismes, série).

## 7. Comportements attendus et cas limites

- **CL-1** — Plusieurs formations : la séance mise en avant est la plus proche, toutes formations
  confondues ; la formation est indiquée dans le détail.
- **CL-2** — Séance en cours (`ongoing`) : bouton « Reprendre ».
- **CL-3** — Action déjà traitée sur le web (`409`) : toast « Cette action a déjà été traitée » et
  rafraîchissement.
- **CL-4** — Aucun créneau alternatif : fiche « Aucun créneau libre cette semaine » et lien vers
  l'agenda.
- **CL-5** — Hors ligne : contenu du cache, boutons de mutation désactivés, « Commencer » actif
  seulement pour le quiz global disponible hors ligne.

## 8. Instructions d'implémentation

1. Écrire les hooks de données et les composants `SessionHeroCard`, `StatsRow`,
   `TutorActionsSection`, `UpNextSection`, `WarmupCard`.
2. Écrire les fiches série, rétention, lacunes, reporter, journal.
3. Brancher la navigation par `primaryActionFor` et `openOnWeb`.
4. Tests Jest avec `HomeDto` de démonstration, intégration, Maestro, visuel.

## 9. Fichiers et composants concernés

- **Créés** — `apps/mobile/src/features/aujourdhui/**`, `apps/mobile/src/data/{home,streak,automations,warmups}.ts`,
  tests, `apps/mobile/e2e/flows/SPEC-3201-*.yaml`.
- **Modifiés** — `apps/mobile/app/(app)/aujourdhui/index.tsx` (remplace l'écran provisoire),
  `packages/i18n/src/fr/mobile.ts`.
- **Lus** — `packages/contracts/src/{home,automations,accueil-le-tuteur-a-agi-pour-vous,serie-regularite-et-jalons-interface,warmup}.ts`,
  `packages/domain/src/home/derive.ts`.

## 10. Interface et conformité visuelle

Mode `mockup` : `ios-02-aujourdhui.png` et `android-02-aujourdhui.png` (état initial,
horloge 13:20). Masques : barre d'état, barre d'onglets. `testID` : `today-hero`,
`today-hero-start`, `today-hero-later`, `stat-streak`, `stat-retention`, `stat-gaps`,
`tutor-actions`, `tutor-action-<id>`, `up-next`, `warmup-card`. États (fiches, vide, hors
ligne) contrôlés par les jetons. Accessibilité : la carte séance est un groupe annoncé
(« Votre séance, Quiz de validation, 14:00 »), les cartes de stats ont rôle bouton.

## 11. Critères d'acceptation

- **CA-1** — Avec les données de démonstration, l'écran affiche exactement : séance « Quiz de
  validation » 14:00, « 3 h faites », « 5 h prévues », série 12 jours, rétention 86 %, 4 notions.
- **CA-2** — « Commencer · 40 min » ouvre le quiz de validation du module 3 (ou l'écran provisoire
  tant que SPEC-3304 n'est pas livrée, vérifié par la route).
- **CA-3** — « Plus tard » déplace la séance sur un créneau proposé et l'agenda le reflète.
- **CA-4** — Accepter la reprise proposée la retire des actions en attente ; « Annuler » une
  action récente la marque annulée.
- **CA-5** — L'écran est conforme à la maquette (écart ≤ 12 % hors zones masquées) sur iOS et
  Android.

## 12. Plan de tests

- **Unitaires** — Vitest `[SPEC-3201]` `features/aujourdhui/view-model.test.ts` (mise en
  avant, « Dans N min » à 13:20, statuts). Jest `[SPEC-3201]` : `today-screen.test.tsx`,
  `tutor-actions.test.tsx` (optimiste et retour arrière), `later-sheet.test.tsx`,
  `stat-sheets.test.tsx`. Couvre CA-1, CA-4.
- **Intégration** — Vitest `[SPEC-3201]` `test/integration/home.int.test.ts` : `/home`,
  `/streak`, accepter une action, déplacer un créneau sur l'API seedée. Couvre CA-3, CA-4.
- **End-to-end** — Maestro `@SPEC-3201` (vidéo) : `SPEC-3201-aujourdhui.yaml` (valeurs,
  fiches, commencer), `SPEC-3201-actions.yaml` (accepter, annuler, reporter). Couvre CA-1, CA-2,
  CA-3, CA-4.
- **Visuel** — `@SPEC-3201 @visual` : écran initial iOS et Android vs exports 02. Couvre CA-5.
- **Non-régression** — `[SPEC-3102]`.

| Critère | Tests |
|---|---|
| CA-1 | view-model.test, today-screen.test, SPEC-3201-aujourdhui.yaml |
| CA-2 | SPEC-3201-aujourdhui.yaml |
| CA-3 | home.int, SPEC-3201-actions.yaml |
| CA-4 | tutor-actions.test, home.int, SPEC-3201-actions.yaml |
| CA-5 | flux visuel |

## 13. Preuves attendues

`evidence/SPEC-3201/` : `acceptance.md`, rapports, vidéos, captures et comparaisons iOS/Android.

## 14. Définition de terminé

Définition commune adaptée par ADR-3004 ; `validate.mjs SPEC-3201` vert.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0190 (contrat des automatismes), ADR-3002, ADR-3003, ADR-3005.
- Le tableau des formations de l'accueil web n'est pas repris : la formation en cours est
  consultée dans Programme (SPEC-3202).
