---
id: SPEC-907
title: Détection fine de la baisse d'engagement
phase: P9
priority: V2
depends_on: [SPEC-711]
business_rules: [BR-AUT-14]
screens: []
adrs: [ADR-0212]
visual: tokens
---

# SPEC-907 — Détection fine de la baisse d'engagement

## 1. Objectif

Détecter de façon déterministe une baisse d'engagement à partir de trois signaux (justesse qui chute, réponses trop rapides et fausses, séances écourtées), puis proposer à l'apprenant une pause ou un allègement par le moteur d'automatismes. Rien ne change dans le planning sans son accord, et aucun appel IA n'est fait pour la détection.

## 2. Contexte

C'est la V2 de la détection de décrochage : la V1 (SPEC-712, ADR-0192) ne regarde que les séances manquées et les jours sans activité ; cette spécification regarde la qualité de l'activité réelle. Lire `docs/product/business-rules.md` BR-AUT-14, BR-AUT-10, BR-AUT-11 et BR-AUT-12 ; `docs/architecture/data-model.md` §5 (`attempts`, `answers`, `review_logs`) et §7 (`automation_settings`, `automation_actions`, créneaux) ; ADR-0212 (signaux, seuils, fenêtres, garde-fous), ADR-0190 (contrat `defineAutomation`), ADR-0016 (pause d'une formation et pause globale), ADR-0074 (fonctions V2 livrées en P9 uniquement), ADR-0123 (jours locaux) ; SPEC-711 (moteur), SPEC-712 (dialogue d'allègement), SPEC-721 (mode pause), SPEC-722 (bandeau « Le tuteur propose »).

## 3. Dépendances

- **SPEC-711** : `defineAutomation`, registre, `automation_settings`, `automation_actions` (statuts `pending_consent|applied|declined|expired|undone|consumed`), routes `/me/automations` et `/me/automation-actions/:id/(accept|decline|undo)`, idempotence par `dedupeKey`, suspension pendant une pause globale, appel à `notify` (SPEC-209).
- **Réutilisés via le moteur** (déjà `done` en V1) : service de pause de SPEC-721 (`pause_started`), options de replanification `lighten` de SPEC-705 (dialogue `ReplanOptionsDialog`), carte d'accueil de SPEC-722, réglages de SPEC-710, fonctions de temps de SPEC-207.
- **Externe** : aucune. Pas d'appel IA (BR-IA-09) ; les tests utilisent l'horloge figée au 2026-11-11T12:20:00Z (ADR-0047) et le jeu de démonstration (SPEC-115).

## 4. Règles métier couvertes

- **BR-AUT-14** : la définition `engagement` calcule chaque jour les trois signaux d'ADR-0212 sur les 14 derniers jours locaux ; deux signaux distincts produisent une proposition de pause ou d'allègement soumise à l'accord de l'apprenant ; un seul signal produit une indication privée sans action ; au plus une proposition tous les 7 jours locaux.
- Garde-fous communs de BR-AUT-11 et journal de BR-AUT-12 appliqués par le moteur de SPEC-711 : explication d'une ligne, heures calmes, plafond, annulation possible tant que l'action n'est pas consommée.

## 5. Exigences fonctionnelles

- **EF-1** — Éligibilité (ADR-0212) : le calcul ne s'exécute que si l'utilisateur a, dans les 14 derniers jours locaux, au moins 5 réponses notées (`answers` avec `is_correct` non nul ou `review_logs`) et au moins 3 séances terminées. Sinon, aucun signal n'est calculé et rien n'est enregistré.
- **EF-2** — Signal `accuracy_drop` : la justesse des 5 dernières réponses est inférieure d'au moins 20 points de pourcentage à celle des 10 réponses précédentes (exemple : 50 % contre 80 % → signal ; 62 % contre 80 % → pas de signal). Moins de 15 réponses dans la fenêtre : le signal ne peut pas être levé.
- **EF-3** — Signal `rushed_answers` : au moins 3 des 5 dernières réponses sont à la fois fausses et plus rapides que la moitié de la médiane personnelle de `time_ms` pour leur format de brique, médiane calculée sur les 14 jours (au moins 5 réponses du format, sinon la réponse ne compte pas).
- **EF-4** — Signal `short_sessions` : au moins 3 des 5 dernières séances terminées ont duré moins de la moitié de leur durée prévue (durée du créneau ou `activities.config.durationSec`).
- **EF-5** — Deux signaux distincts ou plus : une action `kind = 'engagement_drop_proposed'`, `requiresConsent = true`, avec deux choix : « Faire une pause » (ouvre le dialogue de pause de SPEC-721, date de fin proposée à +3 jours locaux, modifiable) et « Alléger mon programme » (ouvre les options `lighten` de SPEC-705). Le refus ou l'expiration (7 jours) ne modifie rien.
- **EF-6** — Un seul signal : action `kind = 'engagement_hint'`, `requiresConsent = false`, sans effet ni notification hors application ; elle apparaît dans le journal de la semaine (« Vos réponses récentes sont plus rapides que d'habitude ») et peut être masquée.
- **EF-7** — Fréquence : au plus une action `engagement_drop_proposed` par utilisateur tous les 7 jours locaux ; aucune pendant une pause globale ou de la formation concernée ; aucune dans les 7 jours qui suivent un refus.
- **EF-8** — Explication (`explain`, ≤ 160 caractères, ton `vous`/`tu`) : « Vos dernières séances sont plus courtes et vos réponses moins justes : une pause ou un programme allégé ? » ; variante tu : « Tes dernières séances sont plus courtes et tes réponses moins justes : une pause ou un programme allégé ? ». Le texte cite les deux signaux réellement levés (6 combinaisons, gabarits fixes).
- **EF-9** — Réglage : la carte « Baisse d'engagement » de l'onglet Automatismes (SPEC-710) propose un interrupteur « Détecter une baisse d'engagement » (activé par défaut) ; désactivé, aucun calcul n'est lancé.

## 6. Exigences techniques

- **ET-1** — `packages/learning-engine/src/engagement.ts` exporte la fonction pure `detectEngagementSignals(input: { answers: { isCorrect: boolean; timeMs: number; format: string; at: string }[]; sessions: { plannedSec: number; actualSec: number; endedAt: string }[]; now: string; timeZone: string }): { eligible: boolean; signals: ('accuracy_drop'|'rushed_answers'|'short_sessions')[]; metrics: { recentAccuracy: number|null; previousAccuracy: number|null; rushedCount: number; shortCount: number } }`. Aucune lecture d'horloge, de base ou d'IA.
- **ET-2** — `packages/automations/src/definitions/engagement.ts` : `defineAutomation({ key: 'engagement', triggers: [{ type: 'hourly', localHour: 20 }], params: EngagementParams, run, apply, explain, undo })` ; `run` lit les données des 14 jours via `userDb`, appelle `detectEngagementSignals`, renvoie au plus un brouillon avec `dedupeKey = 'engagement:<date locale>'`. `apply` (à l'accord) délègue au service de pause de SPEC-721 ou à la replanification de SPEC-705 selon `choice = { option: 'pause', endDate } | { option: 'lighten' }` ; `undo` renvoie `AUTOMATION_ACTION_CONSUMED` après application (les annulations passent par la reprise de pause ou une nouvelle replanification).
- **ET-3** — Migration additive : valeur `engagement` ajoutée à l'énumération `automation_key`, ligne `automation_settings` par défaut (`enabled = true`, `params = {}`) créée pour les comptes existants et par le déclencheur d'initialisation (ADR-0114) ; kinds `engagement_drop_proposed` et `engagement_hint` ajoutés à `AUTOMATION_ACTION_KINDS`.
- **ET-4** — `payload` stocke uniquement les codes de signaux et les métriques agrégées (`metrics`) ; jamais le texte, les réponses ni les identifiants de briques (ADR-0212). Une revue de sécurité de test recherche ces champs dans `automation_actions`.
- **ET-5** — Fenêtre de 7 jours vérifiée par une requête sur `automation_actions` (`automation = 'engagement'`, `kind = 'engagement_drop_proposed'`, `created_at` ≥ début du jour local J−6) ; refus dans ce délai bloque aussi ; jours locaux calculés par `startOfUserDay` (SPEC-207).
- **ET-6** — Notification de la proposition : type `relaunch` via le moteur (donc `notify`, heures calmes et plafond), titre « Un rythme plus doux ? », lien `/accueil`. L'indication à un seul signal ne crée aucune notification.
- **ET-7** — Performance : `run` lit au plus 14 jours d'activité par index `(user_id, answered_at)` ; < 50 ms par utilisateur sur le jeu de démonstration, mesure consignée.

## 7. Comportements attendus et cas limites

- **CL-1** — 14 réponses dans la fenêtre : `accuracy_drop` impossible ; seuls les deux autres signaux sont évalués.
- **CL-2** — Écart d'exactement 20 points (60 % contre 80 %) : signal levé (seuil inclusif « au moins »).
- **CL-3** — Un seul signal levé trois jours de suite : une indication par jour au plus (`dedupeKey` journalière), aucune proposition, aucune notification externe.
- **CL-4** — Proposition refusée lundi : aucune nouvelle proposition jusqu'au dimanche suivant inclus (7 jours locaux), même si trois signaux sont levés.
- **CL-5** — Pause globale active : la définition est suspendue par le moteur ; à la reprise, la fenêtre de 14 jours exclut les jours de pause.
- **CL-6** — Utilisateur à `Pacific/Auckland` : la fenêtre et le délai de 7 jours suivent ses jours locaux, pas l'UTC.
- **CL-7** — Accord concurrent depuis deux onglets : un seul effet (contrat SPEC-711).
- **CL-8** — Réponses de l'examen blanc (minuté) : exclues de `rushed_answers`, car la vitesse y est contrainte ; incluses dans `accuracy_drop`.
- **CL-9** — Réglage désactivé pendant qu'une proposition est en attente : la proposition expire normalement, aucune nouvelle n'est créée.

## 8. Instructions d'implémentation

1. Écrire `detectEngagementSignals` et ses tests de seuils (inclusifs, minima, médiane par format). Commit `feat(SPEC-907): calcule les signaux d'engagement`.
2. Migration additive (`automation_key`, réglages par défaut, kinds), schéma `EngagementParams`. Commit `feat(SPEC-907): déclare l'automatisme engagement`.
3. Définition `engagement` (`run`, `apply`, `explain`, `undo`), fenêtre de 7 jours, notification. Commit `feat(SPEC-907): propose pause ou allègement`.
4. Carte de réglage (SPEC-710), libellés du bandeau d'accueil (SPEC-722) et du journal. Commit `feat(SPEC-907): affiche la proposition`.
5. Tests d'intégration, e2e filmé, visuel ; validation SDD.

## 9. Fichiers et composants concernés

- **Créés** : `packages/learning-engine/src/engagement.ts`, `packages/learning-engine/src/engagement.test.ts`, `packages/automations/src/definitions/engagement.ts`, `packages/services/test/integration/engagement.test.ts`, migration `packages/db/migrations/<n>_engagement_automation.sql` et copie Supabase, `apps/web/e2e/specs/p9/spec-907.spec.ts`.
- **Modifiés** : `packages/automations/src/registry.ts`, `packages/contracts/src/automations.ts`, `packages/db/src/schema/automations.ts`, composants de l'onglet Automatismes (SPEC-710) et du bandeau d'accueil (SPEC-722), `apps/web/messages/fr.ts`, `docs/architecture/data-model.md` §7.
- **Lus / réutilisés** : moteur SPEC-711, pause SPEC-721, replanification SPEC-705, `notify` SPEC-209, temps SPEC-207.

## 10. Interface et conformité visuelle

Mode `tokens` (pas de maquette dédiée) : composer selon `docs/product/screens.md` §3 avec les composants existants.
- **Accueil** : la proposition apparaît dans le bandeau « Le tuteur propose · votre accord est demandé » (SPEC-722) avec deux boutons « Faire une pause » et « Alléger mon programme » et le lien « Pas maintenant » (refus). `data-testid` : `engagement-proposal`, `engagement-pause`, `engagement-lighten`, `engagement-decline`.
- **Journal de la semaine** : ligne datée avec l'explication ; l'indication à un signal porte le badge « Information ».
- **Paramètres › Automatismes** : carte « Baisse d'engagement » avec interrupteur (`engagement-setting`) et texte « Le tuteur vous propose une pause ou un programme allégé si vos réponses et vos séances montrent des signes de fatigue. Rien ne change sans votre accord. »
- Accessibilité : boutons au clavier, `aria-live="polite"` pour l'apparition, contraste AA ; à 390 px, boutons empilés pleine largeur.
- Contrôles : `expectTokens`, structure, axe, `toHaveScreenshot('engagement-proposition.png', { maxDiffPixelRatio: 0.01 })` desktop 1440 et mobile 390.

## 11. Critères d'acceptation

- **CA-1** — Les trois signaux respectent exactement les seuils, fenêtres et minima d'ADR-0212 (inclusivité, 5 réponses et 3 séances minimum, médiane par format).
- **CA-2** — Deux signaux produisent une proposition à accord obligatoire ; un seul produit une indication sans notification ni effet ; aucune modification du planning sans accord.
- **CA-3** — Au plus une proposition tous les 7 jours locaux, aucune pendant une pause ni dans les 7 jours suivant un refus, y compris dans un fuseau éloigné.
- **CA-4** — L'accord « Faire une pause » ou « Alléger » produit exactement l'effet de SPEC-721 ou SPEC-705, une seule fois ; le payload ne contient que codes et métriques agrégées.
- **CA-5** — Bandeau, journal et réglage passent jetons, structure, axe, captures desktop/mobile ≤ 1 % et vidéo e2e.

## 12. Plan de tests

- **Unitaires** — `packages/learning-engine/src/engagement.test.ts`, `describe('[SPEC-907] signaux d'engagement')` : seuils inclusifs, minima, médiane par format, exclusion de l'examen blanc, fuseaux, six combinaisons d'explication `vous`/`tu` (CA-1, CA-2).
- **Intégration** — `packages/services/test/integration/engagement.test.ts`, `describe('[SPEC-907] automatisme engagement')` : base locale, horloge figée ; deux signaux → `pending_consent` + notification ; un signal → `engagement_hint` sans livraison ; délai de 7 jours, refus, pause globale, `Pacific/Auckland` ; accord pause/allègement concurrent ; inspection du payload (CA-2 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p9/spec-907.spec.ts`, `test('propose une pause après une baisse d'engagement @SPEC-907')` : jeu de démonstration avec réponses rapides et séances courtes, tick de 20 h, bandeau visible, « Faire une pause » jusqu'au 14/11, planning gelé ; second scénario « Pas maintenant » puis aucune proposition le lendemain ; vidéo (CA-2 à CA-5).
- **Visuel** — `test('proposition d'engagement conforme @SPEC-907 @visual')` : bandeau, journal, carte de réglage, jetons, axe, captures ≤ 1 % (CA-5).
- **Non-régression** — `[SPEC-711]` / `@SPEC-711`, `[SPEC-712]`, `[SPEC-721]` / `@SPEC-721`, `@SPEC-722`, `@SPEC-710`.

| Critère | Tests |
|---|---|
| CA-1 | unitaires signaux |
| CA-2 | unitaires combinaisons ; intégration proposition/indication ; e2e |
| CA-3 | intégration fréquence, refus, pause, fuseau ; e2e second scénario |
| CA-4 | intégration accord et payload ; e2e pause |
| CA-5 | e2e et `@visual` |

## 13. Preuves attendues

`evidence/SPEC-907/` : rapports Vitest/Playwright, table des seuils testés avec résultats, extrait anonymisé de `automation_actions` (codes et métriques seulement), planning avant/après pause, vidéo des deux scénarios, captures desktop/mobile, `checks.json`, `acceptance.md`.

## 14. Définition de terminé

Validations communes de `docs/engineering/testing.md` §7. En plus : la détection ne fait aucun appel IA (vérifié par l'absence de ligne `ai_calls` pendant les tests), aucune action n'est appliquée sans accord, et les suites V1 des automatismes restent vertes.

## 15. Décisions et hypothèses

- ADR-0212 : signaux, seuils, fenêtres de 14 jours et 7 jours, consentement obligatoire, contenu du journal. ADR-0190 : contrat de l'automatisme ; l'ajout de la clé `engagement` suit son point 5 (ajout d'un élément manquant sans changer le comportement existant). ADR-0016 : pause de formation distincte de la pause globale. ADR-0074 : livrée en P9 seulement.
- ADR-0218 (créé pour cette spécification) : tick quotidien à 20 h locale (après le moment « soir » le plus fréquent), date de fin de pause proposée à +3 jours, réponses d'examen blanc exclues du signal de rapidité.
- Hypothèse : les séances sans durée prévue (quiz global libre) ne comptent pas pour `short_sessions`.
