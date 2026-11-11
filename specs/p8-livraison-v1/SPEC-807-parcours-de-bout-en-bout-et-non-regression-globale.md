---
id: SPEC-807
title: Parcours de bout en bout et non-régression globale
phase: P8
priority: V1
depends_on: [SPEC-803, SPEC-804, SPEC-805, SPEC-806, SPEC-801]
business_rules: []
screens: [SCR-01, SCR-03, SCR-07, SCR-09, SCR-10]
adrs: []
visual: mockup
---

# SPEC-807 — Parcours de bout en bout et non-régression globale

## 1. Objectif

Prouver que les capacités V1 fonctionnent ensemble sur des parcours complets, dans Chromium, Firefox et WebKit, avec données et horloge déterministes. Rejouer les comparaisons visuelles des écrans, l'accessibilité, la sécurité et les performances déjà spécifiées ; corriger les régressions réelles avant de préparer la production.

## 2. Contexte

Les spécifications P0–P8 ont validé leurs composants isolément. Cette spécification relie inscription, onboarding, formation, apports, cours, quiz, remédiation, révisions, automatismes, groupe, examen blanc, export et suppression. Lire `docs/product/vision.md` §5–§7, `docs/product/screens.md` §1–§4, `docs/engineering/testing.md` §1–§7, `specs/checkpoints.md` CP-8, les preuves des spécifications précédentes et les maquettes SCR-01, 03, 07, 09, 10. Le jeu SPEC-115 fournit Alex Perrin et les données visuelles ; les parcours fonctionnels créent aussi leurs propres utilisateurs isolés.

## 3. Dépendances

- **SPEC-803** : grille WCAG, tests axe et parcours clavier.
- **SPEC-804** : budgets et commande de performance, à rejouer sur les parcours représentatifs.
- **SPEC-805** : protections de sécurité, notamment CSP et RLS.
- **SPEC-806** : pages légales et consentement, nécessaires au premier parcours.
- **SPEC-801** : PWA et synchronisation des révisions hors ligne.
- **Autres capacités V1** : les parcours utilisent les APIs et écrans livrés en P1–P7 ; leur réussite ne remplace pas les validations propres de chaque spécification.

## 4. Règles métier couvertes

Aucune règle `BR-*` nouvelle. Les parcours rejouent les règles normatives des spécifications concernées, notamment BR-ACC-01–04, BR-FOR-01–15, BR-APP-01–10, BR-COU-01–11, BR-QUI-*, BR-MEM-*, BR-AUT-*, BR-GRP-*, BR-PLA-05 et BR-PLA-08. La traçabilité détaillée reste dans chaque spécification et dans la matrice de parcours de cette spécification.

## 5. Exigences fonctionnelles

- **EF-1 — Première formation** : un nouvel utilisateur accepte les versions légales, s'inscrit, vérifie son e-mail via le transport de test, termine Profil → Rythme → IA → Rappels → Départ, crée une formation, répond au cadrage, valide un programme et voit le premier module ouvert et les autres verrouillés.
- **EF-2 — Apprentissage et remédiation** : il ajoute une note et un PDF de test, attend leur traitement, génère un cours sourcé, lit un chapitre, pose une question au tuteur simulé, rend un résumé, échoue au quiz sous le seuil, voit les lacunes et la remédiation, repasse après la condition de délai, réussit et ouvre le module suivant. Les citations pointent vers les passages des ressources réellement déposées ; aucune source inventée n'est acceptée.
- **EF-3 — Révisions** : avec l'horloge avancée par la fixture, les notions dues apparaissent dans le quiz global, une réponse met à jour FSRS, la maîtrise, la série et l'agenda ; une réponse hors ligne est stockée puis synchronisée une seule fois à la reconnexion. Les automatismes configurés produisent des actions et un journal, sans dépasser les garde-fous de consentement, de notification ou de durée.
- **EF-4 — Groupe** : un propriétaire crée une formation à plusieurs et invite un second compte par code ; celui-ci rejoint, voit le programme partagé et sa progression propre. Chacun apporte une ressource privée et l'autre ne peut ni la lire ni la télécharger. Quitter le groupe conserve une copie individuelle conformément à SPEC-724.
- **EF-5 — Examen blanc** : l'utilisateur confirme le format, démarre une épreuve sans aide, répond, interrompt/reprend, soumet et voit un résultat diagnostique relié aux lacunes et au planning. La minuterie est calculée côté serveur avec l'horloge figée, sans gain de temps à la reconnexion.
- **EF-6 — Données personnelles** : l'utilisateur demande un export, reçoit l'e-mail du transport mémoire, télécharge l'archive et retrouve cours/apports/résultats/réglages ; il demande ensuite la suppression, l'annule avant J+30, puis une autre demande mène à l'effacement après avancement contrôlé de l'horloge. Aucune donnée d'un autre compte n'est incluse.
- **EF-7 — Qualité globale** : tous les tests `@visual` V1 sont rejoués aux viewports prescrits ; les écrans SCR-01, 03, 07, 09, 10 passent une comparaison maquette pleine page ou par régions selon leurs ADR et leur état final. Les tests axe n'ont aucune violation serious/critical, les parcours clavier sont verts, les budgets de SPEC-804 et les contrôles de SPEC-805 restent satisfaits.
- **EF-8 — Matrice** : `docs/quality/v1-journeys.md` relie chaque étape de ces six parcours à la route, la spécification propriétaire, la règle métier, la fixture et le test ; un lien manquant ou une route inexistante fait échouer la validation documentaire.

## 6. Exigences techniques

- **ET-1** — Les parcours Playwright vivent dans `apps/web/e2e/journeys/`, portent `@SPEC-807` et des tags de spécifications propriétaires, utilisent les fabriques SPEC-115 et `LLM_MODE=mock`, `EMAIL_MODE=memory`, `STRIPE_MODE=mock`, `PUSH_MODE=mock`. Le navigateur et le serveur démarrent à `2026-11-11T12:20:00Z`; les sauts temporels passent par l'horloge injectable et ne changent pas l'heure système de la machine.
- **ET-2** — Chaque parcours crée son propre espace de données : utilisateur(s), formation(s), ressources et identifiants uniques ; les suites peuvent être rejouées sans se contaminer. Les fixtures IA sont versionnées et choisies par scénario, pas par ordre d'exécution des tests.
- **ET-3** — Les tests ne contournent pas l'API ou les gardes produit pour faire avancer l'état, sauf la création initiale de fixtures déclarée. Les actions utilisateur sont effectuées par rôle/label ; les attentes portent sur un état observable ou une réponse de contrat, pas sur un `sleep` fixe.
- **ET-4** — La suite `cross-browser` comporte les trois moteurs aux viewports desktop et mobile pertinents. Une limitation documentée d'un moteur n'est pas transformée en `skip` sans preuve et ADR ; le test garde la même intention fonctionnelle.
- **ET-5** — Une comparaison visuelle utilise les références du manifeste SPEC-005, `expectTokens`, structure et diff ≤ 12 % ; la non-régression `toHaveScreenshot` garde ≤ 1 %. Un écran sans maquette utilise jetons/structure/non-régression. Les rapports conservent les diffs réels et les captures originales.
- **ET-6** — `tools/quality/check-v1-journeys.mjs` valide la matrice contre `specs/catalog.json`, `docs/product/business-rules.md` et les fichiers de tests ; les champs de preuve restent des liens vers des rapports réels, pas des cases remplies à l'avance.
- **ET-7** — La commande `pnpm test:v1:journeys` lance les six parcours et génère JSON/JUnit/vidéos ; elle est intégrée au checkpoint CP-8 sans remplacer `pnpm test:e2e` global.

## 7. Comportements attendus et cas limites

- **CL-1** — Un test dépend d'une réponse IA non couverte par une fixture : échec explicite de fixture, jamais appel live.
- **CL-2** — Une donnée créée dans un parcours apparaît dans un autre : échec d'isolation, nettoyage de la fixture et nouveau test de fuite.
- **CL-3** — Synchronisation hors ligne répétée : la réponse est comptée une fois, FSRS et série ne doublent pas.
- **CL-4** — Utilisateur du groupe tente un lien direct privé : 403/404 selon le contrat, jamais contenu ou URL signée du propriétaire.
- **CL-5** — E-mail mémoire non reçu ou archive incomplète : parcours d'export en échec ; aucun délai fictif n'est enregistré.
- **CL-6** — Moteur navigateur ou référence visuelle indisponible : le sous-contrôle est non exécuté/en échec, sans déclaration de non-régression verte.
- **CL-7** — Correction d'une régression de P1–P7 : test propriétaire rejoué et diff de la correction lié à la spécification d'origine.

## 8. Instructions d'implémentation

1. Écrire la matrice des six parcours avec routes, BR, propriétaires et données de test, puis vérifier automatiquement ses références. Commit `docs(SPEC-807): trace les parcours V1 de bout en bout`.
2. Ajouter les fixtures isolées et les scénarios inscription→module et révisions/automatismes ; contrôler les états intermédiaires et les événements persistés. Commit `test(SPEC-807): couvre apprentissage et révisions`.
3. Ajouter les scénarios groupe, examen et export/suppression ; vérifier RLS et horloge. Commit `test(SPEC-807): couvre groupe examen et données personnelles`.
4. Configurer `test:v1:journeys` cross-browser, relancer tous les tests visuels, axe, sécurité et performance ; corriger les régressions dans leurs composants propriétaires. Commit `test(SPEC-807): rejoue la qualité globale sur trois navigateurs`.
5. Valider avec vidéo et diffs réels, compléter `acceptance.md` et les preuves CP-8 ; aucune étape du parcours ne peut être marquée réussie par simple présence du test.

## 9. Fichiers et composants concernés

- **Créés** : `docs/quality/v1-journeys.md`, `tools/quality/check-v1-journeys.mjs`, `apps/web/e2e/journeys/first-formation.spec.ts`, `apps/web/e2e/journeys/review-automations.spec.ts`, `apps/web/e2e/journeys/group.spec.ts`, `apps/web/e2e/journeys/mock-exam.spec.ts`, `apps/web/e2e/journeys/data-rights.spec.ts`, `apps/web/e2e/journeys/visual-regression.spec.ts`, `apps/web/e2e/specs/p8/spec-807.spec.ts`.
- **Modifiés** : `package.json` (`test:v1:journeys`), `apps/web/playwright.config.ts` (projet cross-browser si nécessaire), fixtures `packages/testing`, code propriétaire uniquement si une régression est prouvée.
- **Lus / réutilisés** : `specs/catalog.json`, `design/references/manifest.json`, `evidence/SPEC-*/`, tests P0–P8, `packages/llm/fixtures`, fabrique SPEC-115.

## 10. Interface et conformité visuelle

Mode `mockup` pour SCR-01, 03, 07, 09, 10. Les états capturés sont : inscription avec consentement ; accueil final après automatismes ; cours avec source ouverte ; résultat de quiz échoué puis réussi ; quiz global avec carte de rappel et raison du choix. Chaque état utilise le seed et l'heure de référence, les régions et textes des maquettes correspondantes. L'écran final SCR-03 est comparé en pleine page après SPEC-722 ; les états partiels gardent les régions définies par ADR-0161. Tous les écrans sont également contrôlés en mobile, avec jetons, ordre des régions et axe.

Le scénario de démonstration `/_dev/sdd/SPEC-807` présente uniquement la matrice et les résultats de la dernière exécution, avec statuts « Réussi », « Échec », « Non exécuté ». Il n'affiche jamais « Réussi » en l'absence de rapport. Un test `@SPEC-807 @visual` filme cette page et contrôle ses jetons, tandis que les comparaisons métier sont attachées aux parcours.

## 11. Critères d'acceptation

- **CA-1** — Le parcours inscription→module traverse chaque étape EF-1/2, un quiz échoué puis réussi, et vérifie citations et déblocage dans les trois moteurs.
- **CA-2** — Les parcours révisions/hors ligne/automatismes, groupe et examen confirment une seule synchronisation, l'isolation des données et la reprise sans gain de temps.
- **CA-3** — L'export contient toutes les catégories prescrites et aucun autre utilisateur ; l'annulation puis suppression à J+30 sont observées dans le test.
- **CA-4** — Toutes les références visuelles V1 sont rejouées, les cinq écrans SCR prescrits passent leur seuil, et les suites axe, sécurité et performance demeurent vertes.
- **CA-5** — La matrice relie toutes les étapes aux routes, BR, propriétaires et tests existants ; chaque parcours `@SPEC-807` produit une vidéo et JSON/JUnit.

## 12. Plan de tests

- **Unitaires** — `tools/quality/test/unit/v1-journeys.test.ts`, `describe('[SPEC-807] journey matrix')` : vérifier ID SPEC, BR et chemin de test, absence de doublon ou étape sans propriétaire (CA-5).
- **Intégration** — `tools/quality/test/integration/v1-journeys.test.ts`, `describe('[SPEC-807] journey fixtures')` : créer deux utilisateurs, réinitialiser seed, charger fixtures IA/mock, vérifier isolation et horloge, exécuter le validateur documentaire (CA-2, CA-5).
- **End-to-end** — Les six fichiers `apps/web/e2e/journeys/*.spec.ts` portent `@SPEC-807` ; scénarios pas à pas EF-1–EF-6, chacun avec vidéo dans Chromium, Firefox, WebKit (CA-1, CA-2, CA-3, CA-5).
- **Visuel** — `apps/web/e2e/journeys/visual-regression.spec.ts`, `test('régression des écrans V1 @SPEC-807 @visual')` : SCR-01/03/07/09/10, jetons, structure, diff ≤ 12 %, ligne de base ≤ 1 %, axe (CA-4). Test visuel de la matrice SDD pour garantir une vidéo propre à SPEC-807.
- **Non-régression** — `pnpm test:unit`, `pnpm test:int`, `pnpm test:e2e`, `pnpm test:visual`, `pnpm test:perf`, suites SPEC-803/805.

| Critère | Tests |
|---|---|
| CA-1 | `first-formation.spec.ts` |
| CA-2 | `review-automations.spec.ts`, `group.spec.ts`, `mock-exam.spec.ts` |
| CA-3 | `data-rights.spec.ts` |
| CA-4 | `visual-regression.spec.ts`, suites SPEC-803/804/805 |
| CA-5 | `v1-journeys.test.ts`, rapports cross-browser |

## 13. Preuves attendues

`evidence/SPEC-807/` contient les rapports JSON/JUnit par moteur, vidéos des six parcours, captures des états clés, diffs et ratios des cinq écrans, rapport axe, sécurité et performance, matrice validée, `checks.json` et `acceptance.md`. Les comptes de test et secrets sont masqués ; chaque preuve cite le commit et la fixture.

## 14. Définition de terminé

Toutes les exigences de `docs/engineering/testing.md` §7 passent, ainsi que les cinq CA ci-dessus dans les trois moteurs. Une régression de spécification antérieure est corrigée et ses tests propres rejoués avant la clôture. La présence d'une vidéo ou d'une matrice ne remplace pas la vérification de chaque résultat.

## 15. Décisions et hypothèses

Les formats de tests, seuils visuels et horloge suivent `docs/engineering/testing.md`, ADR-0034, ADR-0047, ADR-0048 et ADR-0161. Les six parcours couvrent les chaînes critiques V1 ; les validations individuelles et le checkpoint CP-8 assurent le reste du catalogue. Aucun accès à un service de production n'est nécessaire : tous les fournisseurs sont simulés dans ces tests.
