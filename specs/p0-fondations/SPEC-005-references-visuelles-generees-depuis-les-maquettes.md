---
id: SPEC-005
title: Références visuelles générées depuis les maquettes
phase: P0
priority: V1
depends_on: [SPEC-004]
business_rules: [BR-NAV-06]
screens: []
adrs: [ADR-0034, ADR-0047, ADR-0225]
visual: demo
---

# SPEC-005 — Références visuelles générées depuis les maquettes

## 1. Objectif

Produire des captures de référence stables pour les 14 maquettes HTML et leurs états significatifs, aux tailles desktop et mobile, sans modifier les fichiers de maquette. Publier un manifeste reliant chaque écran, état et capture, ainsi qu'un inventaire des jetons observés, afin que les spécifications d'interface puissent vérifier leur conformité.

## 2. Contexte

`design/maquettes/index.html` donne accès aux 14 fichiers `*.dc.html` ; `support.js` fournit les interactions et applique le zoom de 90 %. `docs/product/screens.md` §1 associe les maquettes aux écrans SCR-01 à SCR-15 ; certains écrans partagent un fichier, et les écrans SCR-16 à SCR-20 n'ont pas de maquette. Lire `docs/engineering/testing.md` §3, §4 et §6, ADR-0034 et ADR-0047. SPEC-004 livre le comparateur `compareWithReference`. Les captures représentent le 11 novembre 2026 à 13:20 à Paris, comme les maquettes, et ne prétendent pas être des captures de l'application.

## 3. Dépendances

- **SPEC-004** : Playwright, horloge figée, reporters et helper de comparaison d'images.
- **Sources** : `design/maquettes/index.html`, 14 `*.dc.html`, `support.js`, éventuels fichiers locaux de police ou d'image. Les sources sont en lecture seule.
- **Polices** : Space Grotesk et Inter doivent être chargées ou leur absence doit faire échouer la capture avec une erreur explicite ; aucune capture avec police de repli n'est enregistrée comme référence.
- **Serveur local** : servir le répertoire de maquettes en HTTP statique sans proxy externe, sous une origine de test dédiée. Le script arrête ce serveur même si une capture échoue.

## 4. Règles métier couvertes

- **BR-NAV-06** : les références conservent le zoom à 90 % défini par les maquettes ; l'application appliquera `html { font-size: 90% }` et des jetons en rem (ADR-0034). Le manifeste enregistre la taille de viewport et l'échelle utilisée pour rendre la comparaison reproductible.

## 5. Exigences fonctionnelles

- **EF-1** — `pnpm design:references` démarre le serveur statique, ouvre chaque maquette recensée dans `screens.md`, fixe `2026-11-11T12:20:00Z`, `fr-FR`, `Europe/Paris`, attend les polices et les images, puis capture le viewport 1440×900 et 390×844. Les fichiers sont écrits dans `design/references/<SCR>-<etat>-<viewport>.png` où `viewport` vaut `desktop` ou `mobile`.
- **EF-2** — La capture de base de chaque maquette est obligatoire. Les états significatifs accessibles depuis l'interface sont décrits dans une table de scénarios versionnée : onglets, panneaux ouverts, menus, étapes de l'inscription, proposition/programme en cours, questions/résultats du quiz et états de navigation. Chaque scénario nomme son SCR, son fichier source, ses actions et les assertions de visibilité avant capture.
- **EF-3** — Une maquette commune à plusieurs écrans ou états produit des entrées distinctes dans le manifeste ; la capture n'est pas écrasée. Pour SCR-01/02, les étapes de `Inscription.dc.html` ont des noms d'état différents ; pour SCR-05, `Programme.dc.html?proposition` est distinct du programme en cours.
- **EF-4** — `design/references/manifest.json` liste pour chaque capture `{ screenId, state, viewport, source, file, width, height, fixedAt, locale, timeZone, zoom, sha256 }`. Les chemins sont relatifs au dépôt et triés par `screenId`, `state`, `viewport`. Une seconde génération à sources inchangées produit les mêmes PNG et les mêmes empreintes.
- **EF-5** — `design/references/tokens.json` décrit les couleurs, familles et tailles de police, rayons et espacements observés sur les éléments clés des maquettes. Chaque entrée garde le sélecteur source, la propriété CSS, la valeur calculée et l'écran d'origine. Les jetons ne sont pas devinés à partir des PNG.
- **EF-6** — `pnpm design:references:check` vérifie que le manifeste correspond aux captures, que chaque entrée source existe et que chaque PNG porte les dimensions déclarées ; il n'écrit rien. Une référence absente ou modifiée fait échouer la commande.
- **EF-7** — La page `/_dev/sdd/SPEC-005` affiche le nombre réel de maquettes, d'états, de captures et un aperçu de deux références (desktop et mobile) avec leurs métadonnées ; elle ne charge que des fichiers inscrits au manifeste.

## 6. Exigences techniques

- **ET-1** — `tools/design/capture-references.mjs` utilise `@playwright/test`/Chromium et un serveur statique Node local. L'horloge Playwright est fixée avant navigation ; les animations et transitions sont désactivées seulement pour la capture, sans éditer les sources.
- **ET-2** — `tools/design/scenarios.mjs` exporte une liste explicite de scénarios. Un scénario possède `screenId`, `source`, `state`, `setup(page)` et `expect(page)` ; les sélecteurs préfèrent rôle/texte et utilisent les sélecteurs de la maquette si nécessaire. Aucun clic aveugle ni temporisation fixe n'est acceptable ; attendre une condition observable.
- **ET-3** — Avant chaque capture, vider le stockage local et les cookies, puis appliquer uniquement les données du scénario ; laisser `document.fonts.ready` se résoudre et vérifier par `document.fonts.check` les deux familles. Vérifier qu'aucune image visible n'a `naturalWidth=0`.
- **ET-4** — Les références sont écrites dans un répertoire temporaire, contrôlées, puis déplacées vers `design/references/` en une opération de publication ; un échec ne laisse pas de nouveau manifeste décrivant des fichiers absents.
- **ET-5** — `manifest.json` et `tokens.json` sont du JSON UTF-8 avec fin de ligne LF. Les empreintes SHA-256 sont calculées sur les octets des PNG finaux. La commande de vérification recalcule ces empreintes.
- **ET-6** — La génération ne modifie jamais `design/maquettes/` ni `docs/legacy/`. La vérification de cette invariance compare les empreintes des fichiers sources avant/après dans le test d'intégration.

## 7. Comportements attendus et cas limites

- **CL-1** — Police distante inaccessible : génération en échec, liste des familles non chargées, aucun nouveau manifeste publié.
- **CL-2** — État attendu non atteint : scénario en échec avec nom SCR/état et capture de diagnostic hors `design/references/` ; ne pas accepter l'état de base à sa place.
- **CL-3** — Deux scénarios aboutissent au même nom de fichier : erreur de configuration avant lancement du navigateur.
- **CL-4** — PNG manquant ou changé après génération : `design:references:check` échoue avec le chemin, la dimension ou l'empreinte discordante.
- **CL-5** — Écran sans maquette (SCR-16 à SCR-20) : aucune référence PNG n'est inventée ; son test visuel futur porte sur jetons, structure et non-régression.
- **CL-6** — Viewport mobile plus petit que le contenu : capturer toute la page pour les vues défilantes tout en enregistrant le viewport 390×844 ; le manifeste distingue `width`/`height` du PNG de la taille de viewport.
- **CL-7** — État persistant du menu latéral : chaque scénario repart d'un contexte neuf, pour que l'état précédent n'influence pas la capture suivante.

## 8. Instructions d'implémentation

1. Relever les 14 maquettes de `index.html` et les états actionnables sans changer les fichiers ; écrire `scenarios.mjs` avec au moins un état de base par maquette et les états SCR supplémentaires de `screens.md`. Commit `docs(SPEC-005): inventorie les états des maquettes`.
2. Écrire le serveur statique et `capture-references.mjs` ; fixer heure, locale, fuseau, viewport, polices et nettoyage de contexte ; générer les deux tailles. Commit `feat(SPEC-005): capture les maquettes de manière déterministe`.
3. Écrire le manifeste, l'extraction des jetons et `check-references.mjs`, puis ajouter les scripts pnpm. Commit `feat(SPEC-005): publie le manifeste et les jetons`.
4. Générer les fichiers dans `design/references/`, comparer un échantillon des états base/proposition/panneau ouvert en ouvrant les images, puis corriger tout état mal capturé. Commit `docs(SPEC-005): enregistre les références visuelles`.
5. Ajouter la page de démonstration et les tests section 12 ; exécuter l'audit, les validations et les contrôles d'invariance. Commit `test(SPEC-005): vérifie les références et leur reproductibilité`.

## 9. Fichiers et composants concernés

- **Créés** : `tools/design/scenarios.mjs`, `tools/design/capture-references.mjs`, `tools/design/check-references.mjs`, `tools/design/test/integration/references.test.ts`, `design/references/manifest.json`, `design/references/tokens.json`, `design/references/<SCR>-<etat>-<viewport>.png`, `apps/web/components/sdd-demos/spec-005.tsx`, `apps/web/e2e/specs/p0/spec-005.spec.ts`.
- **Modifiés** : `package.json` (scripts `design:references` et `design:references:check`), `apps/web/app/%5Fdev/sdd/registry.ts`, `apps/web/messages/fr.ts`.
- **Lus uniquement** : `design/maquettes/index.html`, `design/maquettes/*.dc.html`, `design/maquettes/support.js`, `docs/product/screens.md`, `packages/testing/src/visual.ts`.

## 10. Interface et conformité visuelle

Mode `demo`. La page `/_dev/sdd/SPEC-005` présente `h1` « Références visuelles », quatre compteurs (« Maquettes », « États », « Captures », « Jetons »), puis deux figures avec légende « Référence desktop » et « Référence mobile », SCR/état et empreinte courte. Les images ont un texte alternatif descriptif ; le choix de l'état se fait par une liste accessible. `data-testid` : `spec-005-summary`, `spec-005-desktop`, `spec-005-mobile`, `spec-005-manifest`. En absence de manifeste, l'état d'erreur dit « Références non générées » sans nombre fictif.

Tester l'ordre, les jetons de la page, les images chargées, puis `toHaveScreenshot('spec-005-demo.png', { maxDiffPixelRatio: 0.01 })` à 1440×900 et 390×844. Les références de maquettes ne sont pas soumises au seuil d'écart 12 % contre l'application avant que les écrans correspondants existent.

## 11. Critères d'acceptation

- **CA-1** — Les 14 fichiers `*.dc.html` ont chacun un état de base et une capture desktop/mobile ; les états supplémentaires déclarés ont aussi deux captures et des assertions de visibilité.
- **CA-2** — Deux générations successives à sources et environnement identiques produisent le même manifeste et les mêmes SHA-256 ; aucun fichier de `design/maquettes/` n'est modifié.
- **CA-3** — `design:references:check` détecte une référence absente, une mauvaise dimension et une empreinte discordante ; aucune de ces anomalies n'est corrigée silencieusement.
- **CA-4** — `tokens.json` contient pour les éléments clés couleurs, polices, tailles, rayons et espacements avec sélecteurs et provenance ; BR-NAV-06 et le zoom 90 % sont consignés.
- **CA-5** — La page de démonstration affiche les vrais compteurs et deux images du manifeste, puis passe axe et le test visuel desktop/mobile.

## 12. Plan de tests

- **Unitaires** — `tools/design/test/unit/manifest.test.ts`, `describe('[SPEC-005] manifest')` : noms uniques, tri, chemins relatifs, SHA-256, rejet de doublons et valeurs de zoom ; extraction de jetons avec provenance (CA-3, CA-4).
- **Intégration** — `tools/design/test/integration/references.test.ts`, `describe('[SPEC-005] references')` : lancer deux générations dans des dossiers temporaires et comparer les fichiers ; contrôler 14 bases × 2 viewports, états déclarés, invariance des maquettes ; altérer une copie de PNG pour les trois erreurs de vérification (CA-1, CA-2, CA-3).
- **End-to-end** — `apps/web/e2e/specs/p0/spec-005.spec.ts`, `test('inspecte les références @SPEC-005')` : ouvrir la démonstration, confronter les compteurs au manifeste, afficher desktop/mobile, vérifier les images et garder la vidéo (CA-5).
- **Visuel** — `test('démonstration des références conforme @SPEC-005 @visual')` : `expectTokens`, structure, axe, captures desktop/mobile à 1 % (CA-5).
- **Non-régression** — `[SPEC-001]`, `[SPEC-004]`, `@SPEC-001`, `@SPEC-004`.

| Critère | Tests |
|---|---|
| CA-1 | intégration references |
| CA-2 | intégration references |
| CA-3 | unitaires manifest ; intégration references |
| CA-4 | unitaires manifest |
| CA-5 | e2e et `@visual` |

## 13. Preuves attendues

`evidence/SPEC-005/` contient les rapports, la vidéo de la galerie, les captures desktop/mobile et `acceptance.md`. Le manifeste publié sert de liste de fichiers vérifiable ; les empreintes de la seconde génération sont consignées dans le rapport d'intégration. Une absence de police ou d'image est une erreur de génération, jamais un succès avec avertissement.

## 14. Définition de terminé

Les exigences de `docs/engineering/testing.md` §7 passent. Chaque maquette possède ses deux références de base, tous les états déclarés sont capturés, la commande de vérification passe, et le répertoire source reste inchangé. Les futurs tests des écrans peuvent résoudre une référence par SCR, état et viewport à partir du manifeste.

## 15. Décisions et hypothèses

ADR-0034 définit l'échelle 90 % et les seuils de comparaison ; ADR-0047 définit l'instant de capture ; ADR-0225 fixe les conditions de reproductibilité octet pour octet des captures (polices rejouées localement, premier rendu après chargement des polices, profil de rendu Chromium déterministe). La table de scénarios est une déclaration vérifiable des états observés dans les maquettes, sans introduire de nouvel état produit. Les polices externes doivent être disponibles pendant la génération ; aucune substitution n'est acceptée comme référence officielle.
