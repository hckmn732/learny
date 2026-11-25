# Chantier quickfix — rattrapage mobile des parcours web

> **Statut** : plan proposé, non démarré. Ce document n'est **pas** un artefact SDD : il ne crée ni
> spécification, ni ADR, ni preuve `evidence/`, et ne passe pas par `validate.mjs` / `complete.mjs`.
> Le choix du quickfix est assumé par le porteur du projet (2026-11-25) pour ce chantier uniquement.

## 1. Cadre et règles du jeu

**Objectif** : rendre **fonctionnels sur l'application mobile** les parcours qui renvoient encore au
web (« Continuer sur le web »), tels que proposés par `design/app-mobile-rattrapage/` (13 écrans,
commit `a2fc6208`), avec la même API et les mêmes règles métier que le web (ADR-4002).

**Ce qui est explicitement allégé**

| Élément SDD habituel | Ce chantier |
|---|---|
| Spécification + ADR par parcours | ❌ aucun ; le présent plan fait office de cadrage |
| `start.mjs` / `validate.mjs` / `complete.mjs` | ❌ non lancés |
| Campagne complète Jest / Playwright / Maestro | ❌ remplacée par un gate ciblé (§7) |
| Comparaison visuelle pixel (ADR-0034, ADR-3003) | ❌ revue humaine sur captures |
| `evidence/SPEC-xxxx/acceptance.md` | ❌ remplacé par `evidence/quickfix-mr/` (captures) |

**Ce qui reste non négociable** (garde-fous du quickfix)

1. Aucune modification du backend, de l'API, du schéma, des migrations, des contrats.
2. Aucun secret, aucune valeur d'environnement commitée.
3. Libellés issus de `@learny/i18n` ; aucun texte en dur dans un écran (sauf donnée de démo).
4. `tsc --noEmit` sur `@learny/mobile` vert à chaque commit.
5. Un test Jest par écran livré (rendu + action principale), exécuté sur le fichier du test.
6. Aucun test existant supprimé, sauf les assertions de renvoi web **du parcours remplacé** (liste
   fermée en §8), et le remplacement doit asserter la nouvelle navigation.
7. Jetons `@learny/ui` uniquement (aucune couleur en dur), cibles tactiles ≥ 44 pt.
8. Un seul écrivain par fichier : zones disjointes (§5), aucun agent ne touche un fichier partagé.

**Dette acceptée et consignée** : parité non prouvée (pas de test web↔mobile croisé), accessibilité
non auditée, états hors ligne / permission non couverts au-delà du minimum, aucune référence
visuelle versionnée, abonnement laissé au web (ADR-3006). Reprise SDD possible plus tard (§10).

## 2. Périmètre : 13 écrans, 4 zones

Correspondance maquette → route mobile → agent. Les routes sont **plates** (un fichier = une route),
pour qu'aucun agent ne partage un fichier de routage.

| # | Maquette (`design/app-mobile-rattrapage/ecrans/`) | Route cible (`apps/mobile/app/(app)/`) | Entrée actuelle remplacée | Agent |
|---|---|---|---|---|
| 1 | `Apports.dc.html` | `apports/[moduleId].tsx` | Programme › Importer / apports → web | A |
| 1b | (même écran, bloc import) | feuille `import-programme` dans le module | Programme › Importer | A |
| 7 | `Bilan.dc.html` | `bilan/[fid].tsx` | `WebHandoffSheet kind="completed"` | A |
| 11 | `Groupe.dc.html` | `groupe/[fid].tsx` | invitation / formation de groupe → web | A |
| 2a | `Cadrage.dc.html` | `formations/nouvelle.tsx` | `WebHandoffSheet kind="create"` | B |
| 2b | `Proposition.dc.html` | `proposition/[fid].tsx` | `WebHandoffSheet kind="proposal"` | B |
| 9 | `PremiersPas.dc.html` | `premiers-pas/[step].tsx` | `terminer-sur-le-web` (onboarding) | B |
| 3 | `Exercice.dc.html` | `exercice/[brickId].tsx` | briques web du cours / créneau Exercice | C |
| 6 | `ExamenBlanc.dc.html` | `examen-blanc/[activityId].tsx` | créneau « Examen blanc » → web | C |
| 10 | `ClesIA.dc.html` | `cles-ia.tsx` | Profil › Modèles « Gérer sur le web » | C |
| 4 | `Lacunes.dc.html` | `lacunes.tsx` | feuille Lacunes « Voir sur le web » | D |
| 5 | `Carte.dc.html` | `carte/[fid].tsx` | Module › « Ouvrir sur le web » | D |
| 5b | `CarteCerveau.dc.html` | `carte/[fid].tsx` (mode « cerveau ») | aucune entrée dédiée | D |
| 8 | `Recherche.dc.html` | `recherche.tsx` | aucune entrée mobile | D |

Charges indicatives (agent, écrans, complexité) :

| Agent | Zone | Écrans | Points durs |
|---|---|---|---|
| **A** | Programme : apports, import, bilan, groupe | 4 | sélecteur de fichiers + appareil photo (`expo-document-picker`, `expo-image-picker` déjà présents), téléversement, feuille d'import |
| **B** | Création : cadrage par chat, proposition, premiers pas | 3 | chat SSE du tuteur (`TutorSheet` réutilisable), ajustement du programme, wizard 5 étapes |
| **C** | Évaluation : exercice, examen blanc, clés IA | 3 | rendu natif des briques d'exercice (consigne, dialogue, minuteur, barème), épreuve chronométrée, formulaire de clé + test de clé |
| **D** | Exploration : lacunes, carte, carte cerveau, recherche | 4 | graphe SVG interactif (pan/zoom) + alternative accessible en liste, recherche globale |

**Hors périmètre** : abonnement (web, ADR-3006), remédiation de quiz, notifications, replanification
détaillée (suivent le parcours cible), pages juridiques.

## 3. Environnement d'exécution : VM `100.111.204.24`

### 3.1 Inventaire vérifié le 2026-11-25

| Élément | Valeur constatée |
|---|---|
| Système | Ubuntu 26.04.1, 6 vCPU, 11 Go RAM |
| **Disque** | **3,0 Go libres / 96 Go (97 %)** — un build Gradle échoue sous 4 Go (`e2e/build-e2e.mjs`) |
| Node / pnpm | 24.22.3 / 12.23.0 |
| Android | SDK `/opt/android-sdk` (android-35, android-37.0), AVD `learny`, adb actif |
| Maestro | `~/.maestro/bin/maestro` |
| API | `uvicorn` sur `:3001`, `/health` → 200 (lancée le 24/11 depuis un worktree supprimé) |
| Données | Supabase local (`54321/54322/54324`), Mailpit `8025` |
| Checkout | `~/projects/learny` sur `main` mais **18 commits de retard**, modifié localement |
| Worktree utile | `~/projects/learny-wt-push` déjà sur `a2fc6208` (base du chantier) |

### 3.2 Nettoyage disque (étape 0, bloquante)

Ordre de sûreté, du moins risqué au plus risqué ; **vérifier `git status` d'un worktree avant de le
retirer**. Objectif : ≥ 8 Go libres.

```bash
# 1. caches reconstructibles (~2,5 Go)
rm -rf ~/.cache/*                       # 1,9 Go
sudo journalctl --vacuum-size=100M
sudo apt-get clean
pnpm store prune                        # élague le store pnpm (3,8 Go au total)

# 2. artefacts de build et worktrees détachés (~2 Go)
rm -rf /tmp/learny-clean ~/android-tmp/build-e2e*.log ~/android-tmp/build-e2e*.out
rm -rf ~/learny-wt-env ~/learny-wt-llm       # worktrees 98a4a125 / 39129a2b — vérifier d'abord
git -C ~/projects/learny worktree prune

# 3. si insuffisant : ~/.gradle/caches (4,1 Go) peut être purgé, au prix d'un premier build plus long
```

Contrôle : `df -h /` ≥ 8 Go libres avant tout build.

### 3.3 Modèle d'exécution retenu (D1)

Le harnais d'agents n'a pas d'accès fichier distant : les 4 agents **éditent localement** (4
worktrees, `tsc`/Jest rapides, pas de pression disque), et **la VM est le poste d'exécution et de
preuve** : API, Supabase, émulateur, Maestro, build APK, captures. Tout le chantier « tourne » donc
sur la VM, mais le code source des agents vit dans des worktrees locaux synchronisés par `git`.

*Variante « tout sur la VM »* : possible seulement après nettoyage (≥ 12 Go libres) et sans APK par
agent ; à retenir si le porteur veut éditer directement sur la VM.

### 3.4 Synchronisation et exécution sur la VM

Pas de remote ajouté au clone (la règle `origin` reste intacte) : on pousse par URL vers un dépôt nu
de travail sur la VM.

```bash
# une fois, sur la VM
ssh ubuntu@100.111.204.24 'mkdir -p ~/quickfix && git init --bare ~/quickfix/learny.git'

# à chaque merge, depuis le poste local
git push ssh://ubuntu@100.111.204.24/home/ubuntu/quickfix/learny.git quickfix/mobile-rattrapage
ssh ubuntu@100.111.204.24 'cd ~/quickfix/learny 2>/dev/null || git clone ~/quickfix/learny.git ~/quickfix/learny; cd ~/quickfix/learny && git fetch origin quickfix/mobile-rattrapage && git reset --hard FETCH_HEAD && pnpm install --frozen-lockfile --offline'

# build + installation + fumée (voir §7)
ssh ubuntu@100.111.204.24 'cd ~/quickfix/learny/apps/mobile && node e2e/build-e2e.mjs'
ssh ubuntu@100.111.204.24 'cd ~/quickfix/learny/apps/mobile && node e2e/run-maestro.mjs --tags quickfix-mr --platform android'
```

L'API **n'est pas redémarrée** : le backend est hors périmètre, celle de `:3001` suffit. Si un agent a
besoin d'une route absente, c'est un **arrêt** (voir §8), pas un ajout backend.

Émulateur : un seul à la fois, uniquement pendant les fenêtres de preuve.

```bash
/opt/android-sdk/emulator/emulator -avd learny -no-window -no-audio -no-snapshot \
  -gpu swiftshader_indirect & adb wait-for-device
```

## 4. Branches et topologie Git

| Branche | Rôle | Qui écrit |
|---|---|---|
| `main` (`a2fc6208`) | base, intacte | personne |
| `quickfix/mobile-rattrapage` | **intégration** | lead uniquement |
| `quickfix/mr-a` … `quickfix/mr-d` | travail d'un agent | l'agent, dans son worktree |

- Base : `origin/main` = `a2fc6208` (vérifier `git fetch` avant de démarrer).
- Worktrees : `../learny-qf-a` … `../learny-qf-d`, créés depuis `quickfix/mobile-rattrapage` **après**
  le commit de scaffold.
- Merge : lead, `--no-ff`, ordre **A → B → C → D**, un merge = un build VM + fumée.
- Aucun force-push, `main` jamais touchée, aucun push vers `origin` sans accord du porteur.
- Commit : `quickfix(mr-a): <écran> — <ce qui marche>` ; petits commits (≤ 1 h de travail).

## 5. Phase 0 — scaffold (lead, avant fan-out)

But : rendre les 4 zones **strictement disjointes** et le dépôt vert, pour que les agents ne se
croisent jamais. Un seul commit, sur `quickfix/mobile-rattrapage`.

1. **13 routes-stubs** (`app/(app)/…`) qui rendent un écran « en construction » avec `testID`
   (`qf-<ecran>`), + les feuilles (`import-programme`).
2. **Dossiers de zone** : `apps/mobile/src/features/mr/{programme,creation,evaluation,exploration}/`
   avec un `index.ts` vide par zone.
3. **i18n** : `packages/i18n/src/fr/mr/{a,b,c,d}.ts` + enregistrement **une seule fois** dans
   `packages/i18n/src/fr/index.ts` (le lead, jamais les agents).
4. **Recâblage des points d'entrée** (le lead, une fois) : `ProgrammeScreen.tsx`,
   `TodaySheets.tsx`, `ModuleAccordion.tsx`/`ChapterRow.tsx`, `CourseScreen` (briques),
   `ResultScreen`, `OnboardingGateScreen`, `profil/modeles.tsx`, `module/[moduleId].tsx` →
   `router.push()` vers les nouvelles routes au lieu de `openWeb()`. Les stubs existant déjà, le
   dépôt compile et la navigation est testable dès le scaffold.
5. **Fumée Maestro** : 6 flux `apps/mobile/e2e/flows/quickfix-mr-*.yaml` tagués `quickfix-mr`
   (apports, cadrage, exercice, lacunes, carte, recherche) — ouvrent l'écran et vérifient un titre.
6. **Captures de référence des planches** (les « images » manquantes) : petit script Playwright
   `tools/quickfix/capture-planches.mjs` qui sert `design/app-mobile-rattrapage/` en HTTP et capture
   chaque écran en 390×844 dans `design/app-mobile-rattrapage/exports/<Ecran>.png`. Elles servent de
   référence statique pendant la revue (elles ne sont pas normatives).
7. **Gate de sortie de phase 0** : `pnpm --filter @learny/mobile typecheck` + `jest` mobile verts,
   commit `quickfix(mr-0): scaffold des 13 routes, i18n et fumée`.

## 6. Contrat d'agent (prompt type)

Chaque agent reçoit ce contrat, complété de sa zone. Il ne négocie pas le périmètre.

```
Zone : <A|B|C|D> — écrans : <liste>
Worktree : ../learny-qf-<a|b|c|d>, branche quickfix/mr-<x>, base quickfix/mobile-rattrapage.

Fichiers que tu peux créer/modifier (liste blanche stricte) :
  apps/mobile/app/(app)/<tes routes>.tsx
  apps/mobile/src/features/mr/<zone>/**
  packages/i18n/src/fr/mr/<zone>.ts
  apps/mobile/test/mr/<zone>/**
  apps/mobile/e2e/flows/quickfix-mr-<zone>-*.yaml
Interdits : tout le reste, notamment app/_layout.tsx, (app)/_layout.tsx, packages/i18n/src/fr/index.ts,
  packages/api-client, packages/ui, apps/api, apps/worker, docs/, design/.

Règles d'écran :
  - structure et hiérarchie visuelle de la planche (design/app-mobile-rattrapage/ecrans/<Ecran>.dc.html) ;
  - jetons @learny/ui uniquement ; cibles ≥ 44 pt ; safe-area respectée ; barres natives inchangées ;
  - libellés : réutilise packages/i18n existant ; sinon clés dans ton namespace ;
    registre = celui de l'espace produit (vouvoiement : apports, carte, profil ; tutoiement : mode simple, tuteur) ;
  - testID sur chaque élément clé : qf-<ecran>-<element> ; accessibilityLabel sur les actions ;
  - états minimum : chargement, vide, erreur (message + réessayer) ;
  - données réelles via @learny/api-client ; si une route manque : EXPO_PUBLIC_QUICKFIX_MOCK=1
    + TODO(quickfix) + message immédiat au lead — jamais de backend modifié.

Definition of Done (à vérifier toi-même avant de rendre) :
  1. pnpm --filter @learny/mobile typecheck                     → 0 erreur
  2. pnpm --filter @learny/mobile exec jest src/features/mr/<zone> test/mr/<zone>  → vert
  3. pnpm exec eslint <fichiers touchés>                       → 0 warning
  4. au moins 1 test par écran (rendu + action principale, sans snapshot de mise en page)
  5. captures : liste des états à capturer sur la VM (le lead les produit)
  6. commits prefixés quickfix(mr-<x>): ; un message au lead toutes les 45 min, et immédiat si bloqué > 30 min.
```

## 7. Gate de validation (volontairement mince)

| Étape | Commande | Où | Bloquant |
|---|---|---|---|
| Typecheck app | `pnpm --filter @learny/mobile typecheck` | local | oui |
| Tests de zone | `pnpm --filter @learny/mobile exec jest src/features/mr/<zone> test/mr/<zone>` | local | oui |
| Lint ciblé | `pnpm exec eslint <fichiers>` | local | oui |
| Build APK | `node apps/mobile/e2e/build-e2e.mjs` | VM | oui (1×/merge) |
| Fumée Maestro | `node apps/mobile/e2e/run-maestro.mjs --tags quickfix-mr` | VM | oui (1×/merge) |
| Captures | `adb exec-out screencap -p` ou `takeScreenshot` des flux | VM | oui (livrable) |
| Revue planche | comparaison humaine écran ↔ `design/app-mobile-rattrapage/exports/<Ecran>.png` | lead | oui |

**Non lancés** : `validate.mjs`, `pnpm test` racine, Playwright web, diff visuel pixel, campagne
Maestro complète, Prettier global, tests Python.

## 8. Risques et parades

| Risque | Impact | Parade |
|---|---|---|
| Disque VM 3 Go (97 %) | build Gradle échoue, agents bloqués | §3.2 avant tout ; contrôle `df` à chaque merge ; un seul APK à la fois |
| API `:3001` issue d'un worktree supprimé (24/11) | données inattendues en test | backend hors périmètre : on la garde ; en cas de doute, relancer depuis `~/quickfix/learny/python` (venv) |
| Tests assertant « Continuer sur le web » | 3 fichiers rouges dès le 1er écran | liste fermée : `test/shell/onboarding-gate.test.tsx`, `test/agenda/replan-sheet.test.tsx`, `test/quiz/result-screen.test.tsx` ; chaque agent ne modifie que ceux de sa zone, le lead arbitre le reste |
| Conflits sur fichiers partagés | merges bloqués | interdiction d'y toucher (§6) ; tout le partage est fait au scaffold |
| Collision de routes expo-router | écran inaccessible | routes plates, un fichier par écran ; vérification au scaffold (`expo-router` typegen) |
| Émulateur + 4 agents sur 11 Go | OOM, lenteurs | émulateur seulement pendant les fenêtres de preuve, un seul AVD, `-no-snapshot` |
| Écarts maquette (pas de variantes iOS/Android, pas d'états, « tu » sur Apports/Carte) | revue subjective | corrections : titres alignés sur `@learny/i18n` (`Carte des notions`, `Apports déposés`), registre de l'espace respecté ; états minimum imposés par le contrat |
| Maestro instable | faux négatifs | flux courts (ouverture + 1 assertion), relance unique, capture en secours |
| CRLF Windows / lint | bruit dans les diffs | `.gitattributes` déjà présent ; lint sur la VM si divergence |
| Dérive de périmètre (envie de « bien faire ») | chantier qui gonfle | §2 fermé : tout ajout passe par un message au lead et un ticket de dette |

## 9. Planning indicatif

| Jalon | Contenu | Durée |
|---|---|---|
| **M0** | Nettoyage VM, branche + bare repo, scaffold, captures des planches, départ des 4 agents | 2 h |
| **M1** | 4 agents en parallèle (3-4 écrans chacun) ; lead : revue continue, merges A puis B | 6-8 h |
| **M2** | Merges C, D + build + fumée + corrections | 2-3 h |
| **M3** | Passe de revue visuelle sur captures, corrections de libellés/registre | 2 h |
| **M4** | Passe finale VM (13 écrans ouverts, 13 captures), note de dette, remise | 1 h |

Total ≈ **13-16 h** de mur, dont ~2 h de lead par jalon.

## 10. Sortie et suite

**Livrables**

- `quickfix/mobile-rattrapage` : 13 écrans fonctionnels, entrées web supprimées pour ces parcours.
- `evidence/quickfix-mr/<agent>/<ecran>.png` : 13 captures VM + captures des états.
- `design/app-mobile-rattrapage/exports/*.png` : planches capturées (référence de revue).
- Ce plan, tenu à jour (section « journal » à la fin).

**Dette consignée** (reprise SDD possible)

1. Parité web↔mobile non prouvée ; 2. accessibilité non auditée ; 3. états hors ligne/permission
partiels ; 4. `EXPO_PUBLIC_QUICKFIX_MOCK` restant, s'il y en a ; 5. abonnement toujours web (ADR-3006) ;
6. aucune référence visuelle versionnée ni scénario `@visual` ; 7. planches non conformes au format
`design/app-mobile` (variantes iOS/Android, exports 786×1704 / 824×1830).

Si le porteur veut ensuite la version « propre » : une phase P41 (ADR de piste) reprend ces écrans,
ajoute les maquettes natives, les scénarios de capture et les critères de parité, puis une spec par
parcours selon la boucle SDD.

---

## Journal

| Date | Événement |
|---|---|
| 2026-11-25 | Plan rédigé ; branche `quickfix/mobile-rattrapage` créée depuis `a2fc6208` ; VM auditée (SSH, API, SDK, disque). Chantier non démarré. |
