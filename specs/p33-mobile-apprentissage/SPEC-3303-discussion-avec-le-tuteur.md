---
id: SPEC-3303
title: Discussion avec le tuteur
phase: P33
priority: mobile
depends_on: [SPEC-3302]
business_rules: [BR-TUT-01, BR-TUT-02, BR-TUT-03, BR-TUT-04, BR-TUT-06, BR-TUT-07, BR-AUT-06, BR-ACC-05]
screens: [SCR-07]
adrs: [ADR-0040, ADR-3003, ADR-3004, ADR-3008, ADR-3010]
visual: mockup
---

# SPEC-3303 — Discussion avec le tuteur

## 1. Objectif

Livrer la feuille du tuteur ouverte depuis le cours : envoi d'une question, réponse diffusée en
flux avec ses sources, suites proposées, « Teste-moi », création d'une carte de rappel, historique
de la discussion et contexte transmis.

## 2. Contexte

Maquette : écran 05 « Cours · tuteur » (`view.html#screen=cours&sheet=1`, exports
`{ios,android}-04b-cours-tuteur.png`, état `design/app-mobile/exports/states/android-tuteur.png`),
§ Interactions « Cours » du README (suggestions, saisie libre, indicateur de frappe, réponse
avec source). Équivalent web : panneau tuteur de SCR-07 (SPEC-610, SPEC-717). Contrats :
`packages/contracts/src/tutor-chat.ts` (`POST/GET /courses/:cid/conversations`,
`GET /conversations/:id`, `POST /conversations/:id/messages` en SSE,
`POST /conversations/:id/self-test/answer`), `tutor.ts` (`POST /tutor/cards`, contexte).
Flux : `@learny/api-client` `sse.ts` via `expo/fetch` (SPEC-3003 EF-8). Adaptations tactiles :
ADR-3010. Historique : ADR-0040.

## 3. Dépendances

- **SPEC-3302** (cours, passage, bouton d'ouverture), SPEC-3003 (flux), SPEC-3301 (Markdown).
- API locale en `LLM_MODE=mock` : réponses simulées déterministes.

## 4. Règles métier couvertes

- BR-TUT-01 — Ouverture depuis « Demander au tuteur » (questions suggérées) ou depuis un passage
  (appui long, ADR-3010 §1).
- BR-TUT-02 — Ligne « Contexte · N éléments » et fiche d'interrupteurs ; seuls les éléments
  inclus sont envoyés (ADR-3010 §3).
- BR-TUT-03 — Sources citées (puce « Chapitre 2 · L'en-tête de pièce ») et suites proposées en
  puces (« Un exemple concret », « Plus court », « Créer une carte »… selon les suites renvoyées).
- BR-TUT-04 — « Teste-moi » : question du tuteur, réponse saisie, correction affichée
  (`self-test/answer`).
- BR-TUT-06 — Envoi, nouvelle ligne, fermeture et « Nouvelle discussion » selon ADR-3010 §2 et §4.
- BR-TUT-07 — L'historique de la discussion du cours est rechargé à l'ouverture
  (`GET /courses/:cid/conversations`, dernière discussion).
- BR-AUT-06 — « Créer une carte » : `POST /tutor/cards` ; en mode « avec ma confirmation »,
  fiche de confirmation avant création ; toast « Carte créée · elle reviendra dans le quiz
  global ».
- BR-ACC-05 — Vouvoiement ou tutoiement selon le profil pour les libellés du tuteur.

## 5. Exigences fonctionnelles

- **EF-1** — Route modale `tuteur?courseId=&chapterId=&sectionId=` en feuille native (hauteurs
  moyenne et grande, poignée, fond assombri, fermeture par geste ou croix).
- **EF-2** — En-tête : tuile encre avec étincelle citron, « Tuteur », sous-titre « Comptabilité
  générale · chapitre 2 », croix ; menu « Nouvelle discussion ».
- **EF-3** — Fil : bulles utilisateur encre à droite, réponses sur carte claire à gauche en
  Markdown ; indicateur de frappe (trois points) jusqu'au premier fragment ; texte affiché au fil
  des fragments `text-delta` ; sources (`data-sources`) en puces cliquables (fiche source) ;
  suites (`data-follow-ups`) en puces sous la réponse.
- **EF-4** — Questions suggérées à l'ouverture d'une discussion vide (libellés renvoyés par
  l'API).
- **EF-5** — Zone de saisie « Posez votre question… » multiligne (5 lignes visibles au plus),
  bouton d'envoi citron désactivé si vide ou flux en cours ; bouton « Arrêter » pendant le flux.
- **EF-6** — Mention de pied : « Le tuteur cite ses sources. Vérifiez l'applicabilité à votre
  société. »
- **EF-7** — Erreurs : `AI_UNAVAILABLE` → « Le tuteur est momentanément indisponible. » avec
  « Réessayer » ; modèle non configuré (code du contrat) → message web et « Configurer sur le
  web » ; `429` → délai.

## 6. Exigences techniques

- **ET-1** — `useConversation(courseId)` : création à la première question
  (`Idempotency-Key`), puis messages ; état du flux local au composant (aucun état global).
- **ET-2** — Le flux est annulé à la fermeture de la feuille, au passage en arrière-plan et sur
  « Arrêter » (`AbortController`) ; le texte partiel reste affiché avec la mention « Réponse
  interrompue ».
- **ET-3** — Défilement automatique vers le bas pendant le flux sauf si l'utilisateur a remonté
  le fil ; bouton « Aller en bas ».
- **ET-4** — `KeyboardAvoidingView` / `keyboardShouldPersistTaps` : la saisie reste visible au-
  dessus du clavier sur les deux plateformes.
- **ET-5** — Accessibilité : nouvelle réponse annoncée une fois complète (pas à chaque
  fragment) ; puces de suite en boutons.

## 7. Comportements attendus et cas limites

- **CL-1** — Réseau coupé pendant le flux : `StreamInterruptedError`, texte partiel conservé,
  « Réessayer » renvoie la même question.
- **CL-2** — Double appui sur envoyer : une seule question.
- **CL-3** — Feuille fermée puis rouverte : historique rechargé, aucune requête en double.
- **CL-4** — Hors ligne : historique en cache lisible, saisie désactivée avec « Le tuteur est
  disponible une fois en ligne ».
- **CL-5** — Réponse très longue : rendu fluide (pas de re-rendu complet par fragment, mise à
  jour regroupée par trame).

## 8. Instructions d'implémentation

1. Hook `useConversation` et adaptation de `streamTutorReply`.
2. Feuille, en-tête, fil, bulles, indicateur de frappe, puces de sources et de suites.
3. Saisie, envoi, arrêt, erreurs, fiche de contexte, « Teste-moi », « Créer une carte ».
4. Tests (flux simulé), intégration (API en mode mock), Maestro, visuel.

## 9. Fichiers et composants concernés

- **Créés** — `apps/mobile/app/tuteur.tsx`, `apps/mobile/src/features/tuteur/**`,
  `apps/mobile/src/data/conversation.ts`, tests, `apps/mobile/e2e/flows/SPEC-3303-*.yaml`.
- **Modifiés** — `apps/mobile/src/features/cours/*` (ouverture), `packages/i18n/src/fr/mobile.ts`.
- **Lus** — `packages/contracts/src/{tutor-chat,tutor}.ts`, `packages/api-client/src/sse.ts`,
  `packages/i18n/src/fr/*` (libellés du tuteur).

## 10. Interface et conformité visuelle

Mode `mockup` : `ios-04b-cours-tuteur.png`, `android-04b-cours-tuteur.png` (question « Pourquoi
deux dates sur une pièce ? » et réponse sourcée, reproduites par le LLM simulé) et
`states/android-tuteur.png`. Masques : barre d'état, zone floutée du cours en arrière-plan.
`testID` : `tutor-sheet`, `tutor-input`, `tutor-send`, `tutor-stop`, `tutor-message-<n>`,
`tutor-source-<n>`, `tutor-follow-up-<n>`, `tutor-context`, `tutor-typing`.

## 11. Critères d'acceptation

- **CA-1** — Une question envoyée produit une réponse diffusée fragment par fragment, avec sa
  source et ses suites.
- **CA-2** — L'historique est conservé : fermer et rouvrir la feuille affiche la discussion.
- **CA-3** — « Créer une carte » crée une carte de rappel (confirmée) visible dans le prochain
  quiz global.
- **CA-4** — Réseau coupé pendant le flux : texte partiel conservé et « Réessayer » fonctionne.
- **CA-5** — Retirer un élément du contexte l'exclut de la requête envoyée.
- **CA-6** — Feuille conforme à la maquette (écart ≤ 12 % hors zones masquées).

## 12. Plan de tests

- **Unitaires** — Vitest `[SPEC-3303]` `features/tuteur/stream-state.test.ts` (fragments,
  sources, suites, interruption, arrêt). Jest `[SPEC-3303]` : `tutor-sheet.test.tsx`,
  `composer.test.tsx`, `context-sheet.test.tsx`, `self-test.test.tsx`. Couvre CA-1, CA-4, CA-5.
- **Intégration** — Vitest `[SPEC-3303]` `test/integration/tutor.int.test.ts` : conversation,
  message SSE simulé, historique, carte créée, contexte filtré. Couvre CA-1, CA-2, CA-3, CA-5.
- **End-to-end** — Maestro `@SPEC-3303` (vidéo) : `SPEC-3303-question.yaml` (ouvrir, suggérée,
  réponse, source), `SPEC-3303-carte.yaml`, `SPEC-3303-interruption.yaml` (mode avion pendant le
  flux). Couvre CA-1, CA-2, CA-3, CA-4.
- **Visuel** — `@SPEC-3303 @visual` : feuille avec réponse iOS et Android. Couvre CA-6.
- **Non-régression** — `[SPEC-3302]`, `[SPEC-3003]`.

| Critère | Tests |
|---|---|
| CA-1 | stream-state.test, tutor.int, SPEC-3303-question.yaml |
| CA-2 | tutor.int, SPEC-3303-question.yaml |
| CA-3 | tutor.int, SPEC-3303-carte.yaml |
| CA-4 | stream-state.test, SPEC-3303-interruption.yaml |
| CA-5 | context-sheet.test, tutor.int |
| CA-6 | flux visuel |

## 13. Preuves attendues

`evidence/SPEC-3303/` : `acceptance.md`, rapports, vidéos (dont l'interruption), captures et
comparaisons, corps de requête (contexte) extrait du journal de l'API locale.

## 14. Définition de terminé

Définition commune adaptée par ADR-3004 ; `validate.mjs SPEC-3303` vert.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0040, ADR-3003, ADR-3004, ADR-3008, ADR-3010.
- La sélection de texte est remplacée par l'appui long (ADR-3010) ; les raccourcis clavier ne
  valent qu'avec un clavier physique.
