---
id: SPEC-207
title: Horloge, fuseaux et heures calmes
phase: P2
priority: V1
depends_on: [SPEC-101]
business_rules: [BR-ACC-07]
screens: []
adrs: [ADR-0030, ADR-0047]
visual: demo
---

# SPEC-207 — Horloge, fuseaux et heures calmes

## 1. Objectif

Fournir les opérations de temps utilisées par planification, notifications, budget IA et série : horloge injectable, jour local, conversion de fuseau et calcul des heures calmes, y compris au passage à l'heure d'été/hiver. Aucun service métier ne doit lire directement l'horloge système.

## 2. Contexte

SPEC-001 crée `packages/core/src/clock.ts` ; cette spécification complète le paquet avec `time.ts`. ADR-0030 impose stockage UTC, fuseau IANA par utilisateur et `Intl`/`@date-fns/tz` ; ADR-0047 fixe l'horloge de test. Lire BR-ACC-07, BR-NOT-04/06, `docs/engineering/conventions.md` §5–§6, `docs/architecture/data-model.md` §1, `docs/architecture/overview.md` §5. SPEC-203 sélectionnera les utilisateurs à l'heure locale et SPEC-209 reportera les livraisons hors heures calmes.

## 3. Dépendances

- **SPEC-101** : base et harnais permettant de lire `profiles.timezone` et `notification_settings.quiet_start/quiet_end` dans les tests d'intégration.
- **SPEC-001** : interface `Clock`, `clock.now()` et `CLOCK_FIXED_AT`.
- **Bibliothèque** : `@date-fns/tz` verrouillée dans le lockfile ; pas d'appel externe.

## 4. Règles métier couvertes

- **BR-ACC-07** : chaque utilisateur a un fuseau IANA ; le navigateur le détecte à l'inscription, avec repli `Europe/Paris`. Toute date affichée, planifiée ou envoyée doit utiliser ce fuseau. Les utilitaires reçoivent explicitement le fuseau au lieu du fuseau du serveur.

## 5. Exigences fonctionnelles

- **EF-1** — `clock.now()` renvoie l'instant courant injecté ; `createFixedClock(iso)` et `CLOCK_FIXED_AT` donnent le même instant à tous les appels de test. Hors test, l'adaptateur système est le seul endroit autorisé à lire l'heure réelle.
- **EF-2** — `toUserZone(instant,timeZone)` fournit date/heure locales, décalage et nom de fuseau ; `formatUserDate` utilise `Intl.DateTimeFormat('fr-FR',{timeZone})`. Un fuseau IANA invalide produit une erreur de validation, pas un repli silencieux.
- **EF-3** — `startOfUserDay(day,timeZone)` et `endOfUserDay` produisent les bornes UTC correspondant au jour civil local. Un jour peut durer 23, 24 ou 25 heures ; la borne supérieure est exclusive pour les requêtes.
- **EF-4** — `userLocalHour` et `userWeekday` calculent l'heure et le jour ISO 1=lundi..7=dimanche à partir de l'instant et du fuseau, utilisables par les crons. Une notification du lundi local n'est pas déclenchée le dimanche local sous prétexte qu'il est déjà lundi UTC.
- **EF-5** — `isQuietHours(instant, {start,end,timeZone})` prend en charge une plage qui traverse minuit (défaut 21:00–08:00), une plage qui ne le traverse pas et `start=end` traité comme aucune heure calme. La borne de début est incluse, la borne de fin exclue.
- **EF-6** — `nextOutsideQuietHours` renvoie l'instant courant s'il est déjà autorisé, sinon la première borne de fin valide du fuseau ; au passage DST, il renvoie un instant réel valide et ne boucle pas.
- **EF-7** — `detectUserTimeZone(value?)` accepte un nom IANA du navigateur, sinon `Europe/Paris`. Le fuseau est stocké sur le profil par SPEC-602 ; un changement ultérieur n'altère pas les timestamps UTC existants.
- **EF-8** — La page SDD montre l'instant fixe UTC, son affichage Paris, deux exemples d'heures calmes et la durée des jours de transition DST calculés par les fonctions.

## 6. Exigences techniques

- **ET-1** — `packages/core/src/time.ts` exporte les signatures typées des EF-2 à EF-7 ; toutes les fonctions pures prennent `Date`/ISO et `timeZone` explicite. Aucune variable globale de fuseau ne gouverne le résultat.
- **ET-2** — Utiliser `Intl` et `@date-fns/tz` pour résoudre les décalages, jamais ajouter un nombre fixe d'heures à UTC ; `Europe/Paris` varie selon la saison.
- **ET-3** — Les heures `HH:mm` sont validées (00:00..23:59) et les dates civiles `YYYY-MM-DD` sont vérifiées strictement. Les instants en sortie sont UTC et sérialisables ISO.
- **ET-4** — Les fonctions de borne travaillent en intervalles semi-ouverts `[start,end)` ; un événement exactement à minuit de fin appartient au nouveau jour.
- **ET-5** — L'horloge de SPEC-001 n'est pas remplacée par une deuxième instance ; `@learny/testing` réutilise cette interface et fixe `2026-11-11T12:20:00Z`.
- **ET-6** — ESLint continue d'interdire `Date.now()`/`new Date()` sans argument hors `packages/core/src/clock.ts`. Les tests contrôlent les usages dans `time.ts` et les services modifiés.

## 7. Comportements attendus et cas limites

- **CL-1** — Fuseau inconnu ou chaîne vide : erreur sûre, sauf détection navigateur manquante qui retourne explicitement `Europe/Paris`.
- **CL-2** — Jour de passage à l'heure d'été à Paris : durée 23 h, borne locale 02:30 inexistante n'est pas fabriquée.
- **CL-3** — Jour de passage à l'heure d'hiver : durée 25 h, deux instants distincts à 02:30 restent distincts.
- **CL-4** — À 21:00 exactement : heure calme ; à 08:00 exactement : envoi permis.
- **CL-5** — Plage 08:00–12:00 : midi permis, 08:00 inclus.
- **CL-6** — `start=end` : aucune heure calme, `nextOutsideQuietHours(now)=now`.
- **CL-7** — Fuseau extrême UTC+14/UTC−12 : jour local calculé indépendamment du jour UTC.
- **CL-8** — Deux appels avec même instant/fuseau : sortie identique malgré fuseau du processus ou locale système différents.

## 8. Instructions d'implémentation

1. Compléter le `Clock` de SPEC-001 sans casser ses exports et écrire `time.ts` basé sur `Intl`/`@date-fns/tz`. Commit `feat(SPEC-207): calcule les jours et heures locales`.
2. Implémenter heures calmes et prochain instant autorisé, avec bornes semi-ouvertes et cas DST. Commit `feat(SPEC-207): reporte hors heures calmes`.
3. Ajouter tests unitaires par fuseau/date, intégration avec profil/réglages, page SDD et e2e/visuel. Commit `test(SPEC-207): vérifie fuseaux et changements d'heure`.
4. Valider la spécification et lier les preuves aux critères.

## 9. Fichiers et composants concernés

- **Créés** : `packages/core/src/time.ts`, `packages/core/src/time.test.ts`, `packages/core/test/integration/user-time.test.ts`, `apps/web/components/sdd-demos/spec-207.tsx`, `apps/web/e2e/specs/p2/spec-207.spec.ts`.
- **Modifiés** : `packages/core/src/clock.ts` seulement pour compléter l'interface si nécessaire, `packages/core/src/index.ts`, `packages/core/package.json` (`@date-fns/tz`), registre SDD et `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `profiles.timezone`, `notification_settings`, `@learny/testing` et `@learny/config/product`.

## 10. Interface et conformité visuelle

Mode `demo` : `/_dev/sdd/SPEC-207` affiche « Temps et fuseaux », instant UTC `2026-11-11T12:20:00Z`, heure Paris « 13:20 », carte « Heures calmes 21:00–08:00 » avec état courant et prochaine sortie, puis deux cartes de transition « 23 h »/« 25 h ». `data-testid` : `spec-207-now`, `spec-207-local`, `spec-207-quiet`, `spec-207-dst`. Les dates sont fournies par les fonctions, sans chaîne de résultat codée dans le composant. Vérifier jetons, ordre, axe et captures desktop/mobile ≤ 1 %.

## 11. Critères d'acceptation

- **CA-1** — À l'horloge fixe, Paris affiche 13:20 et les bornes de jour local sont correctes.
- **CA-2** — Les jours DST 23 h/25 h et deux 02:30 d'automne sont traités sans collision.
- **CA-3** — Les heures calmes incluent 21:00 et excluent 08:00 ; `nextOutsideQuietHours` rend un instant valide.
- **CA-4** — Fuseau invalide refusé, détection absente retombe sur Paris ; aucune fonction hors clock n'appelle l'heure système.
- **CA-5** — La page SDD affiche les calculs, passe axe, vidéo et captures desktop/mobile.

## 12. Plan de tests

- **Unitaires** — `packages/core/src/time.test.ts`, `describe('[SPEC-207] local time')` : Paris à date fixe, UTC+14/−12, bornes DST, heures calmes et fuseau invalide (CA-1 à CA-4).
- **Intégration** — `packages/core/test/integration/user-time.test.ts`, `describe('[SPEC-207] user timezone')` : profil/réglages en base, requête du jour local et prochain envoi, deux utilisateurs de fuseaux différents (CA-1 à CA-3).
- **End-to-end** — `apps/web/e2e/specs/p2/spec-207.spec.ts`, `test('inspecte le fuseau et les heures calmes @SPEC-207')` : lire heure Paris, état calme et transitions, vidéo (CA-5).
- **Visuel** — `test('temps local conforme @SPEC-207 @visual')` : jetons, structure, axe, captures ≤ 1 % (CA-5).
- **Non-régression** — `[SPEC-001]` (clock) et `[SPEC-102]` (fuseau profil).

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; intégration |
| CA-2 | unitaires DST |
| CA-3 | unitaires ; intégration |
| CA-4 | unitaires ; lint |
| CA-5 | e2e et `@visual` |

## 13. Preuves attendues

`evidence/SPEC-207/` contient sorties des cas DST et bornes, rapports, vidéo/captures, `checks.json` et `acceptance.md`. Les résultats utilisent la date ADR-0047, pas l'heure réelle du poste.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent ; heures calmes et jours locaux fonctionnent dans des fuseaux variés, y compris DST, et l'horloge reste injectable partout.

## 15. Décisions et hypothèses

ADR-0030 fixe UTC, IANA, `Intl`/`@date-fns/tz` ; ADR-0047 fixe la date de test. La préférence de fuseau est saisie par SPEC-602/707, ces fonctions la consomment sans modifier le profil.

- **ADR-0252** — résolution des heures locales aux changements d'heure : `instantsAtLocalTime` renvoie toutes les occurrences réelles (aucune au printemps, deux en automne) ; le début de jour est la première occurrence de minuit (ou l'instant du saut) ; la fin des heures calmes est la première occurrence postérieure à l'instant, une borne sautée se résolvant à l'instant du saut.
- **ADR-0253** — validation des fuseaux : `parseTimeZone` accepte les alias que le moteur normalise (`Asia/Kolkata`, `Europe/Kyiv`) et refuse décalages fixes, variantes de casse et noms inconnus ; seul `detectUserTimeZone` se replie sur `Europe/Paris`. `isValidIanaZone` (SPEC-202) est conservée inchangée.
- Les fonctions de calcul acceptent `Date` ou une chaîne ISO 8601 portant son décalage (`Z`, `+02:00`) ; une chaîne sans désignateur de fuseau est refusée car son sens dépendrait du processus (CL-8).
- La page SDD parcourt les jours de l'année locale avec `userDayBounds` pour repérer les jours de 23 h et 25 h : aucune durée n'est codée dans le composant.
