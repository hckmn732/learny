# SPEC-3401 — Profil, réglages, pause et confidentialité : preuves d'acceptation

- **Spécification** : `specs/p34-mobile-compte/SPEC-3401-profil-reglages-et-confidentialite.md`
- **Branche** : `spec/SPEC-3401-profil-reglages-et-confidentialite` (worktree `/root/wt/SPEC-3401`)
- **Date** : 2026-11-24
- **Environnement** : VM `learny-dev`, API locale 3001 (`LLM_MODE=mock`, `RATE_LIMIT_MODE=off`,
  horloge figée `2026-11-11T12:20:00Z`), Supabase local 54321, émulateur Android local (ADR-3018).
- **Décisions** : ADR-3003 § 4, ADR-3006, ADR-3022, **ADR-3024** (ligne de base versionnée,
  sélecteur de date borné, suppression bloquée côté serveur).

## 1. Ce qui est livré

| Zone | Fichiers |
|---|---|
| Données (ET-1) | `src/data/profile.ts`, `notification-settings.ts`, `task-models.ts`, `subscription.ts`, `pause.ts`, `src/data/keys.ts` |
| Garde des stores (ET-3) | `src/api/billing-guard.ts`, `billing-guard.test.ts` |
| Écrans (EF-1 à EF-6) | `src/features/profil/` : `ProfileScreen`, `IdentityScreen`, `RhythmScreen`, `NotificationsScreen`, `ModelsScreen`, `SubscriptionScreen`, `SecurityScreen`, `PrivacyScreen`, `PauseSheet`, `DeletionNotice`, `SettingsScaffold`, `rhythm-summary.ts` |
| Routes de la pile | `app/(app)/profil/{index,identite,rythme,notifications,securite,modeles,abonnement,confidentialite}.tsx` |
| Intégrations | `src/features/shell/AccountSheet.tsx` (pause d'EF-5), `src/features/aujourdhui/TodayScreen.tsx` (bandeau de suppression d'EF-6) |
| Libellés | `packages/i18n/src/fr/mobile.ts` (espace `mobile.profile`, ~150 libellés) |
| Tests | `test/profil/{profile-screen,identity-form,notifications-settings,task-models,pause,deletion}.test.tsx`, `test/integration/profile.int.test.ts`, `src/api/billing-guard.test.ts`, `src/features/profil/rhythm-summary.test.ts`, `test/shell/account-sheet.test.tsx` (mis à jour) |
| Campagne | `e2e/flows/SPEC-3401-{profil,pause,suppression}.yaml`, `e2e/visual/masks/spec-3401-profil.json`, `e2e/visual/baselines/SPEC-3401-profil.png` |
| Docs | `docs/adr/ADR-3024-*.md`, ligne au `docs/adr/README.md` |

## 2. Critères d'acceptation

| Critère | Résultat | Preuve |
|---|---|---|
| **CA-1** — racine avec les valeurs de démonstration et tous les groupes d'EF-2 | ✅ | Jest `test/profil/profile-screen.test.tsx` (11 cas : identité « Alex Perrin »/« Apprenant · 3 formations en cours »/« Membre depuis septembre », indicateurs 12 j · 86 % · 4 lacunes, 4 groupes, 10 lignes, déconnexion, version) ; Maestro `SPEC-3401-profil.yaml` (`profile-identity`, `profile-stat-1..3`, toutes les `profile-row-*`, `profile-sign-out`) |
| **CA-2** — le ton et le rythme s'enregistrent ; un conflit recharge les valeurs | ✅ | Jest `identity-form.test.tsx` (patch avec `expectedUpdatedAt`, message de CL-1 sur 409) ; intégration `profile.int.test.ts` (PATCH 200 + relecture, 409 sur version périmée, valeurs inchangées après refus) ; Maestro `SPEC-3401-profil.yaml` (ton `tu` puis retour `vous`, rythme 3 h puis retour 5 h, toasts) |
| **CA-3** — notifications et modèle par tâche enregistrés | ✅ | Jest `notifications-settings.test.tsx` (compteur 6/6 → 5/6, canal application verrouillé, patch avec `expectedUpdatedAt`) et `task-models.test.tsx` (`assign` avec `credentialId`, état vide de CL-2, raison d'indisponibilité) ; intégration (`PATCH /me/notification-settings` 200, compteur décrémenté puis restauré) |
| **CA-4** — pause et reprise, demande et annulation de suppression, export | ✅ | Jest `pause.test.tsx` (dates bornées, `endDate` civil, reprise, erreur du serveur) et `deletion.test.tsx` (« SUPPRIMER » obligatoire, export en cours sans second envoi, bannière + annulation, taille de l'archive) ; intégration `profile.int.test.ts` (pause `active` → `ended`, export 202 + relecture, annulation 204) ; Maestro `SPEC-3401-pause.yaml` et `SPEC-3401-suppression.yaml`. **Limite documentée** : `POST /me/deletion` répond 500 sur la pile (voir § 5) |
| **CA-5** — aucun bouton ni appel d'achat ou de portail | ✅ | Vitest `src/api/billing-guard.test.ts` (garde qui refuse les deux routes ; analyse du code de `app/` et `src/` : zéro occurrence de `billingCheckout`, `billingPortal`, `/billing/checkout`, `/billing/portal` hors commentaires) ; Jest `profile-screen.test.tsx` (aucun libellé d'achat) |
| **CA-6** — racine conforme à la maquette (écart ≤ 12 %) | ✅ | Maestro `SPEC-3401-profil.yaml` (`@visual`) comparé à `e2e/visual/baselines/SPEC-3401-profil.png` |

## 3. Conformité visuelle (ADR-3003 § 4, ADR-3024)

- **Flux** : `e2e/flows/SPEC-3401-profil.yaml`, étiquettes `SPEC-3401 @visual`, capture
  `takeScreenshot: SPEC-3401-profil` prise sur la racine **avant toute écriture** (les mutations de
  ton et de rythme viennent après), donc reproductible d'une campagne à l'autre.
- **Ligne de base versionnée** : `apps/mobile/e2e/visual/baselines/SPEC-3401-profil.png`.
- **Masque** : `e2e/visual/masks/spec-3401-profil.json` — barre d'onglets native uniquement
  (`y 0.93 → 1`, ADR-3003 § 3). La barre d'état est couverte par les zones natives par défaut
  (haut 5 %). **Aucune zone de contenu n'est masquée.**
- **Écart mesuré** : voir `e2e-mobile.json` (`visual[].diffRatio`) et le diff
  `artifacts/spec-3401-profil/SPEC-3401-profil.diff.png`.
- **Écarts structurels assumés à l'export `android-08-profil.png`** (ADR-3024 § 1) :
  1. EF-2 sépare « Abonnement » de « Apprentissage » (l'export le place dans le même groupe) ;
  2. EF-2 ajoute « Conditions d'utilisation » et « Données et confidentialité » au groupe d'aide ;
  3. EF-4 interdit le changement de mot de passe, donc le sous-titre « Mot de passe, appareils »
     devient « E-mail, méthode et appareils » ;
  4. les valeurs viennent du serveur : 2 formations actives (export : 3), aucune notification non
     lue (export : 3), indicateurs 12 j · 86 % · 4 lues sur `/streak`, `/home` et les lacunes.

## 4. Couverture des niveaux de test (ADR-3004 § 6)

| Niveau | Résultat |
|---|---|
| Vitest `[SPEC-3401]` (logique) | `rhythm-summary.test.ts` (6 cas) + `billing-guard.test.ts` (4 cas) : **10/10** |
| Jest `[SPEC-3401]` (rendu, accessibilité, erreurs) | `test/profil/**` : **36/36** (5 fichiers de la spec + fixtures) ; `test/shell/account-sheet.test.tsx` : **6/6** avec la pause d'EF-5 |
| Intégration (pile locale) | `test/integration/profile.int.test.ts` : **7/7** (compte éphémère créé puis supprimé, jeu de démonstration intact) |
| Maestro `@SPEC-3401` + vidéo | 3 flux : `SPEC-3401-profil.yaml`, `SPEC-3401-pause.yaml`, `SPEC-3401-suppression.yaml` |
| Visuel `@visual` | 1 flux, comparaison versionnée (ADR-3024) |

## 5. Écarts et limites connus

1. **`POST /me/deletion` est cassé côté serveur** — la route répond
   `500 INTERNAL_ERROR` (`err.error = ReferenceError`) dans le journal de l'API, pour tout compte
   (le compte de démonstration compris). Le défaut est dans
   `packages/services/src/personal-data/deletion.ts` (`formatLongDate` ré-exporté par
   `./zip-layout`). La piste mobile n'écrit pas dans le backend avant P35 (ADR-3001 § 4) : le défaut
   est signalé au porteur. Le mobile prouve la confirmation, le délai et l'annulation
   (`DELETE /me/deletion` → 204), et `export-request` fonctionne (202). Le flux Maestro
   `SPEC-3401-suppression.yaml` s'arrête volontairement avant l'envoi.
2. **Pas de sélecteur de date natif** — ET-2 mentionne des sélecteurs natifs ; le socle mobile
   n'embarque aucun module de date (ADR-3004 § 5, ADR-3005). La feuille de pause propose des
   échéances bornées (`pause-date-1` … `pause-date-30`, demain au plus tôt) et les heures des
   notifications des propositions `HH:mm` bornées. Dette d'ADR-3024 § 2.
3. **Fuseau horaire en lecture seule** — la modification reste sur le web (ADR-3002 § 3,
   ADR-3024 § 3).
4. **iOS** — aucune campagne iOS (pas de macOS, ADR-3018) : les écrans n'ont aucun fichier
   `.ios.tsx`/`.android.tsx` hors composants partagés, ils utilisent les mêmes composants, les
   `ListRow`/`Switch` de plateforme et les insets natifs.
5. **Un seul flux `@visual`** par spécification (leçon 6 du BRIEF, ADR-3015 § 5) : la racine Profil
   est le seul écran maquetté ; les écrans empilés sont vérifiés par les jetons, la structure
   (`ListRow`, `Switch`, `Segmented`) et les tests d'écran (ADR-3024).
6. **Tests déjà rouges hors périmètre** (décision du porteur, `BRIEF.md`) : `packages/config/src/commit-rules.test.ts`,
   `apps/web/test/unit/bundle-split.test.ts`, `tools/migration/test/unit/report.test.ts` — non
   touchés, non affaiblis.

## 6. Reproductibilité

```sh
cd /root/wt/SPEC-3401
export PATH=/root/.local/bin:$PATH
set -a; . ./.env.local; set +a; export NODE_ENV=test
bash tools/dev/mobile-check.sh SPEC-3401
flock /tmp/learny-emulator.lock flock /tmp/learny-gradle.lock \
  env ORG_GRADLE_PROJECT_reactNativeArchitectures=x86_64 pnpm -s build:mobile:e2e
flock /tmp/learny-emulator.lock pnpm -s test:e2e:mobile --tags SPEC-3401
node tools/sdd/validate.mjs SPEC-3401 --skip-build
node tools/sdd/complete.mjs SPEC-3401 --no-merge --no-push
rm -rf apps/mobile/android
```
