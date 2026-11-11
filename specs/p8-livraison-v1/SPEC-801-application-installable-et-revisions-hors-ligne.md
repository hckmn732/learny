---
id: SPEC-801
title: Application installable et révisions hors ligne
phase: P8
priority: V1
depends_on: [SPEC-701, SPEC-702]
business_rules: [BR-PLA-01]
screens: [SCR-10, SCR-20]
adrs: [ADR-0037, ADR-0200]
visual: tokens   # mockup (écran maquetté) | tokens (écran sans maquette) | demo (page de démonstration SDD)
---

# SPEC-801 — Application installable et révisions hors ligne

## 1. Objectif

Rendre Learny installable (manifest, icônes, service worker Serwist) et permettre de jouer **hors ligne** la session de quiz global du jour et les cartes de rappel, préchargées chaque jour dans IndexedDB ; les réponses données hors ligne sont mises en file puis synchronisées de façon idempotente au retour du réseau, le serveur recalculant FSRS et faisant foi en cas de conflit. Les autres écrans affichent la page `/hors-ligne`.

## 2. Contexte

- Décision de principe : ADR-0037 (Serwist, IndexedDB via `idb`, `/api/v1/sync/offline-answers`, serveur qui fait foi). Les détails normatifs (stratégies de cache, schéma IndexedDB, règles de conflit, durées) sont fixés par **ADR-0200**, créé par cette spécification.
- Le quiz global (écran SCR-10, `design/maquettes/QuizGlobal.dc.html`) est livré par SPEC-701 (session du jour, carte de rappel, écran de fin) et SPEC-702 (association, remise en ordre, classement, texte à trous). Cette spécification **réutilise** ses composants : elle ne redessine pas l'écran ; elle ajoute un mode de données « hors ligne ».
- La page `/hors-ligne` est l'écran système SCR-20 (`docs/product/screens.md` §1 et §3 : composé avec le design system, sans maquette).
- Documents à lire : `docs/architecture/api.md` (routes `GET /formations/:fid/global-quiz/today`, `POST /review-sessions/:sid/answers`, `POST /review-sessions/:sid/complete`, `POST /sync/offline-answers`), `docs/architecture/data-model.md` §5 et §6 (`activities`, `attempts`, `answers`, `notion_states`, `review_logs.source = 'offline'`), `docs/engineering/conventions.md` §4 à §6, `docs/engineering/testing.md` §3 à §6.

## 3. Dépendances

- **SPEC-701** (doit être `done`) : service de session du jour (`services.globalQuiz.getToday(ctx, fid, mode)`), route `GET /api/v1/formations/:fid/global-quiz/today`, `POST /api/v1/review-sessions/:sid/answers`, `POST /api/v1/review-sessions/:sid/complete`, composants de l'écran `QuizGlobal` (en-tête, progression, rail des jeux, carte de rappel, écran de fin), application FSRS côté serveur via `packages/services/learning` (SPEC-411).
- **SPEC-702** (doit être `done`) : composants des quatre jeux et leur correction par le code (`@learny/bricks`, `grade.ts`, SPEC-502).
- Utilisés transitivement : SPEC-205 (gestionnaire `push`/`notificationclick` du service worker, à fusionner dans le nouveau service worker), SPEC-304/305 (coquille, en-tête où s'affiche l'indicateur), SPEC-303 (Toast, EmptyState, Card, Button), SPEC-207 (`clock`, début de journée locale), SPEC-201 (`handler()`, contrats, problem+json).
- Bibliothèques (dernière version stable, ADR-0003) : `@serwist/next` et `serwist` (≥ 9), `idb` (≥ 8), `fake-indexeddb` (tests unitaires, ≥ 6), `sharp` (génération des icônes, dépendance de développement). Aucune variable d'environnement nouvelle.
- Aucune dépendance externe en ligne : rien n'est bloquant.

## 4. Règles métier couvertes

- **BR-PLA-01** — Application installable : manifest Web App (`app/manifest.ts`), icônes 192/512/maskable/Apple, service worker Serwist enregistré en production (EF-1 à EF-3). Hors ligne : la session de quiz global du jour et les cartes de rappel sont préchargées chaque jour dans IndexedDB (EF-4) et jouables sans réseau avec correction immédiate par le code (EF-6) ; les réponses sont mises en file (EF-7) puis synchronisées au retour du réseau via `POST /api/v1/sync/offline-answers`, idempotent par identifiant client (EF-8, ET-6) ; FSRS est recalculé côté serveur, jamais côté client (ET-7) ; en cas de conflit, le serveur fait foi (ET-8, CL-3).

## 5. Exigences fonctionnelles

- **EF-1 — Manifest.** `GET /manifest.webmanifest` renvoie : `name: "Learny"`, `short_name: "Learny"`, `description: "Apprenez intensément, retenez durablement."`, `lang: "fr"`, `dir: "ltr"`, `id: "/accueil"`, `start_url: "/accueil?source=pwa"`, `scope: "/"`, `display: "standalone"`, `orientation: "any"`, `background_color: "#F4F4F1"`, `theme_color: "#111113"`, `categories: ["education"]`, icônes `/icons/icon-192.png` (192×192, `purpose: "any"`), `/icons/icon-512.png` (512×512, `any`), `/icons/icon-maskable-512.png` (512×512, `maskable`, logo dans la zone sûre de 80 %). Le layout racine déclare `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">` (180×180) et `<meta name="theme-color" content="#111113">`.
- **EF-2 — Installation.** Le navigateur juge l'application installable (critères Chromium : manifest valide, service worker avec gestionnaire `fetch`, HTTPS ou `localhost`). Aucun bouton d'installation personnalisé n'est ajouté en V1 (l'invite du navigateur suffit).
- **EF-3 — Service worker.** Enregistré à la portée `/` uniquement dans le build de production (`next start`) ; désactivé en `next dev`. Mise à jour : nouvelle version activée au prochain chargement complet (`skipWaiting: false`, `clientsClaim: true` à la première installation seulement), sans perte de la file d'attente.
- **EF-4 — Préchargement quotidien.** Quand l'apprenant est connecté et en ligne, l'application appelle `GET /api/v1/offline/pack` au chargement de la coquille, puis à chaque retour au premier plan (`visibilitychange` → `visible`) si le paquet stocké n'est pas celui du jour local courant. Le paquet contient, pour **chaque formation active** (3 au plus, BR-FOR-10) : la session de quiz global du jour (mode `full`, mêmes items que l'écran en ligne) et jusqu'à **20 cartes de rappel** supplémentaires portant sur les notions dues le lendemain (jour local), hors notions déjà présentes dans la session. Un paquet est remplacé, jamais fusionné.
- **EF-5 — Navigation hors ligne.** Sans réseau : (a) une navigation vers `/formations/<fid>/quiz-global` affiche l'écran de révision hors ligne alimenté par IndexedDB ; (b) toute autre navigation affiche `/hors-ligne`. Les ressources statiques (JS, CSS, polices, icônes) sont servies depuis le cache.
- **EF-6 — Jeu hors ligne.** L'écran de révision hors ligne reprend la structure de l'écran Quiz global (en-tête « Quiz global », sous-titre « <formation> · session du <jour long> », progression, rail, carte de rappel avec auto-évaluation Raté/Difficile/Bon/Facile, jeux, « Passer », « Suivant », écran de fin) et affiche en tête un bandeau `role="status"` : « Mode hors ligne · vos réponses seront envoyées au retour du réseau. ». La correction et l'explication s'affichent immédiatement après chaque réponse (calculées par `@learny/bricks` `grade()`). Les échéances affichées sous les boutons d'auto-évaluation sont **absentes** hors ligne (remplacées par « Échéance calculée au retour du réseau ») car FSRS n'est jamais calculé côté client.
- **EF-7 — File d'attente.** Chaque réponse et chaque fin de session hors ligne sont enregistrées immédiatement dans le magasin `queue` d'IndexedDB avec un `clientId` UUID v4 (`crypto.randomUUID()`), avant l'affichage de la correction.
- **EF-8 — Synchronisation.** Déclenchée : à l'événement `online`, au chargement de la coquille, au retour au premier plan, et par l'événement `sync` du service worker (étiquette `learny-offline-answers`) quand le navigateur le prend en charge. Les entrées `pending` sont envoyées par lots de 50 au plus, dans l'ordre de `answeredAt`, à `POST /api/v1/sync/offline-answers`. Après réponse : `applied`, `duplicate` et `conflict` → entrée supprimée ; `rejected` → entrée conservée 7 jours avec `status: 'rejected'` puis purgée. À la fin, un toast `role="status"` affiche « n réponse(s) synchronisée(s). » (n = applied + duplicate), et, si au moins un `conflict`, « Certaines réponses avaient déjà été enregistrées sur un autre appareil : la version du serveur est conservée. ».
- **EF-9 — Indicateur hors ligne.** Dans l'en-tête figé (à gauche de la cloche), une pastille `data-testid="offline-indicator"` `role="status"` affiche « Hors ligne » quand `navigator.onLine === false`, et « n en attente » (`data-testid="offline-pending-count"`) quand la file contient au moins une entrée `pending`, en ligne ou non. Elle est absente sinon.
- **EF-10 — Page `/hors-ligne`.** Route publique (accessible sans session, précachée). Contenu : sur-titre « Connexion perdue », titre « Vous êtes hors ligne », texte « Les révisions préparées aujourd'hui restent disponibles. Le reste de Learny reviendra dès que le réseau sera rétabli. », liste des paquets disponibles pour l'utilisateur propriétaire du stockage (carte par formation : titre, « Session du <jour> · N notions · M cartes de rappel », bouton citron « Réviser hors ligne » vers `/formations/<fid>/quiz-global`), bouton contour « Réessayer » (recharge la page), et, si aucun paquet : EmptyState « Aucune révision disponible hors ligne. » / « Ouvrez Learny une fois connecté pour préparer les révisions du jour. ».
- **EF-11 — Confidentialité de l'appareil.** À la déconnexion (BR-ACC-09), la base IndexedDB `learny-offline` est supprimée et les caches d'exécution du service worker sont vidés (le précache statique est conservé). Si un autre utilisateur se connecte sur le même navigateur (`meta.ownerId` différent), la base est supprimée avant tout préchargement.

## 6. Exigences techniques

- **ET-1 — Manifest et icônes.** `apps/web/app/manifest.ts` (route de métadonnées Next.js, type `MetadataRoute.Manifest`). Icônes générées par `apps/web/scripts/generate-icons.mjs` (sharp) à partir de `apps/web/public/icons/source.svg` (logo « Learny » : carré `#111113`, rayon 22 %, lettre « L » `#C6F432` en Space Grotesk 600), committées en PNG ; un test vérifie leurs dimensions.
- **ET-2 — Service worker.** `apps/web/app/sw.ts` compilé par `@serwist/next` (`swSrc: 'app/sw.ts'`, `swDest: 'public/sw.js'`, `disable: process.env.NODE_ENV === 'development'`, `register: false` : l'enregistrement est fait par `apps/web/lib/offline/register-sw.ts`, appelé dans un composant client du layout connecté et de `/hors-ligne`). Stratégies (ADR-0200) :

| Requête | Stratégie | Cache | Expiration |
|---|---|---|---|
| Précache Serwist (`self.__SW_MANIFEST` : `/_next/static/**`, `/hors-ligne`, `/hors-ligne/revisions`, icônes, polices `next/font`) | précache, révision par empreinte | `serwist-precache-v2` | à chaque version |
| `/_next/image?*` et `/icons/*` | `CacheFirst` | `learny-images` | 60 entrées, 30 jours |
| Polices (`/_next/static/media/*.woff2`) | `CacheFirst` | `learny-fonts` | 20 entrées, 365 jours |
| `/api/**`, `/auth/**`, `/_dev/**`, `/api/inngest`, Supabase (`*.supabase.co`, `NEXT_PUBLIC_SUPABASE_URL`) | `NetworkOnly` (jamais mis en cache) | — | — |
| Navigation (`request.mode === 'navigate'`) | `NetworkOnly` ; en cas d'échec réseau : `/formations/<uuid>/quiz-global` → réponse précachée `/hors-ligne/revisions` ; autre chemin → précache `/hors-ligne` | — | — |

  Aucune page HTML authentifiée n'est mise en cache (pas de fuite de données personnelles sur un appareil partagé). Le gestionnaire `push` et `notificationclick` de SPEC-205 est déplacé dans `apps/web/lib/push/sw-push.ts` et importé par `app/sw.ts` (l'ancien fichier de service worker de SPEC-205 est supprimé ; un seul service worker à la portée `/`). Le gestionnaire `sync` (étiquette `learny-offline-answers`) appelle `syncQueue()` de `apps/web/lib/offline/sync.ts` (code partagé page/service worker, sans dépendance au DOM).
- **ET-3 — Pages hors ligne.** `apps/web/app/hors-ligne/page.tsx` (statique, aucune donnée serveur, composant client qui lit IndexedDB) et `apps/web/app/hors-ligne/revisions/page.tsx` (statique ; lit l'identifiant de formation dans `location.pathname` quand elle est servie à la place de `/formations/<fid>/quiz-global`, sinon dans `?formation=`). Les deux routes sont ajoutées à la liste des routes publiques du middleware (SPEC-202) et sont `export const dynamic = 'force-static'`.
- **ET-4 — Schéma IndexedDB** (`apps/web/lib/offline/db.ts`, `idb`), base `learny-offline`, version 1 :
  - `meta` (clé `key`) : `{ key: 'owner', ownerId: uuid }`, `{ key: 'lastPack', localDate: 'YYYY-MM-DD', fetchedAt: ISO }`.
  - `packs` (clé `formationId`) : `OfflinePack` (ET-5) + `storedAt`.
  - `progress` (clé `sessionId`) : `{ sessionId, formationId, position, answered: number[], skipped: number[], completed: boolean }` (reprise de la session après rechargement).
  - `queue` (clé `clientId`, index `by-status` sur `status`, index `by-answeredAt`) : `QueueEntry = { clientId, kind: 'answer' | 'complete', ownerId, formationId, sessionId, position?: number, brickVersionId?: uuid, response?: unknown, timeMs?: number, selfGrade?: 'again'|'hard'|'good'|'easy', answeredAt: ISO, status: 'pending'|'syncing'|'rejected', attempts: number, lastError?: string }`.
- **ET-5 — `GET /api/v1/offline/pack`** (nouvelle route, ajoutée à `docs/architecture/api.md` dans le même commit ; limitation par défaut 120/min). Sortie (`packages/contracts/src/offline.ts`) : `{ ownerId, localDate, generatedAt, expiresAt, formations: OfflinePack[] }` avec `OfflinePack = { formationId, formationTitle, session: GlobalQuizTodayDto /* SPEC-701, mode full, items avec payload complet de brick_version, y compris réponses attendues et explications */, extraCards: { brickVersionId, notionId, notionLabel, payload }[] (≤ 20) }`. `expiresAt` = fin du jour local suivant (fuseau utilisateur, `packages/core/src/time.ts`). Une formation sans notion due a `session.items = []`. Le service `services.offline.buildPack(ctx)` réutilise `services.globalQuiz.getToday` (création idempotente de la session du jour) ; il ne fait **aucun** appel IA (BR-IA-09) : si la banque ne contient pas de carte de rappel pour une notion due le lendemain, la notion est simplement omise.
- **ET-6 — `POST /api/v1/sync/offline-answers`** (route déjà inventoriée). Entrée : `{ entries: OfflineEntry[] }` (1 à 50), `OfflineEntry` = `QueueEntry` sans `status`, `attempts`, `lastError`, `ownerId`. Sortie 200 : `{ results: { clientId, status: 'applied'|'duplicate'|'conflict'|'rejected', code?: 'SESSION_NOT_FOUND'|'EXPIRED'|'INVALID_RESPONSE'|'FORBIDDEN', correct?: boolean, nextDueAt?: ISO }[] }`. Erreurs : 400 `VALIDATION_FAILED` (lot mal formé, plus de 50 entrées), 401, 429 `RATE_LIMITED` (profil par défaut). L'idempotence est assurée par la table **`offline_sync_receipts`** (nouvelle migration `packages/db`, RLS propriétaire, ajoutée à `docs/architecture/data-model.md` §6) : `user_id uuid → profiles on delete cascade`, `client_id uuid`, `status text check in ('applied','conflict','rejected')`, `answer_id uuid null → answers on delete set null`, `created_at`, `pk(user_id, client_id)` ; purge des reçus de plus de 30 jours par le cron nocturne (SPEC-203). Un `clientId` déjà reçu renvoie `duplicate` sans effet.
- **ET-7 — Traitement serveur** (`packages/services/src/offline/sync.ts`), dans une transaction par entrée, entrées triées par `answeredAt` croissant : (1) vérifier que la session appartient à l'utilisateur et à la formation (sinon `rejected/FORBIDDEN`, ou `SESSION_NOT_FOUND`) ; (2) `answeredAt` effectif = `min(answeredAt, clock.now())` et doit être ≥ début du jour local de `activities.for_date` et ≥ `clock.now() − 7 jours`, sinon `rejected/EXPIRED` ; (3) recorriger la réponse avec `grade()` de `@learny/bricks` (la justesse envoyée par le client est ignorée) — réponse invalide pour le schéma → `rejected/INVALID_RESPONSE` ; (4) enregistrer l'`answer` et appeler le même service que `POST /review-sessions/:sid/answers` avec `source = 'offline'` et `reviewedAt = answeredAt effectif` (FSRS, maîtrise, lacunes, `daily_activity` du jour local de `answeredAt` pour la série, BR-GAM-01) ; (5) entrée `complete` : appeler le service de `POST /review-sessions/:sid/complete` (idempotent).
- **ET-8 — Règle de conflit (le serveur fait foi).** Si la position de la session a déjà une réponse côté serveur (jouée en ligne ou synchronisée depuis un autre appareil), l'entrée est `conflict` : rien n'est modifié. Si une révision de la même notion existe dans `review_logs` avec `reviewed_at > answeredAt`, la réponse est enregistrée (`answers`, `review_logs` historisé) mais l'état FSRS courant de la notion n'est **pas** recalculé (la révision la plus récente prévaut) ; statut `applied`.
- **ET-9 — Client** (`apps/web/lib/offline/`) : `pack.ts` (`prefetchPack()`), `queue.ts` (`enqueue()`, `pendingCount()`), `sync.ts` (`syncQueue({ fetchImpl })` : verrou `navigator.locks` `learny-sync` si disponible, sinon drapeau en mémoire ; entrées passées à `syncing` puis remises à `pending` si l'appel échoue ; réessai au déclenchement suivant, sans boucle), `use-online-status.ts`, `OfflineIndicator.tsx`, `OfflineQuizGlobal.tsx` (réutilise les composants SPEC-701/702 avec un adaptateur de données `OfflineSessionSource`). Le hook de données de SPEC-701 est étendu d'une interface `SessionSource` (`online` | `offline`) ; l'écran en ligne n'est pas modifié visuellement.
- **ET-10 — Horloge.** Côté client, `answeredAt` provient de l'horloge du navigateur via le helper client de `packages/core/src/clock.ts` (aucun `new Date()` hors de ce module, ESLint). Côté serveur, `clock.now()`.
- **ET-11 — Sécurité.** Le service worker ne met jamais en cache les réponses d'API ; `Service-Worker-Allowed` n'est pas élargi ; `sw.js` est servi avec `Cache-Control: no-cache` et la CSP de SPEC-805 (`worker-src 'self'`). Les données IndexedDB sont propres à l'origine.
- **ET-12 — Performance.** `GET /api/v1/offline/pack` p95 < 300 ms sur le jeu de démonstration (mesuré par SPEC-804) ; taille du paquet ≤ 500 Ko (JSON) pour 3 formations ; le préchargement s'exécute après `requestIdleCallback` (repli `setTimeout` 2 s) pour ne pas pénaliser le LCP.

## 7. Comportements attendus et cas limites

- **CL-1 — Réseau coupé pendant une session en ligne.** L'envoi d'une réponse échoue (`TypeError` réseau) : la réponse est mise en file, la correction locale s'affiche, l'écran bascule en mode hors ligne sans perdre la position (bandeau EF-6).
- **CL-2 — Double envoi (réessai après coupure pendant la requête de synchronisation).** Le serveur a déjà le reçu : `duplicate`, aucune double révision, aucune double incrémentation de `daily_activity`.
- **CL-3 — Même session jouée en ligne sur un autre appareil.** Les positions déjà répondues sont `conflict` ; message EF-8 ; l'écran de fin hors ligne n'est pas renvoyé si la session est déjà terminée côté serveur (le service `complete` est idempotent).
- **CL-4 — Paquet périmé.** Le jour local a changé et l'appareil est hors ligne : la session de la veille reste jouable jusqu'à `expiresAt` (fin du lendemain) avec le libellé « Session du <jour> (préparée hier) » ; au-delà, elle est supprimée et `/hors-ligne` affiche l'état vide. Une réponse de plus de 7 jours est rejetée (`EXPIRED`) et l'entrée affichée dans l'indicateur jusqu'à sa purge.
- **CL-5 — Changement d'utilisateur sur le même navigateur.** `meta.ownerId` différent → suppression de la base avant tout préchargement ; les réponses `pending` de l'ancien utilisateur ne sont jamais envoyées avec la session du nouveau (le serveur rejetterait de toute façon `FORBIDDEN`).
- **CL-6 — Déconnexion avec réponses en attente.** Avant la suppression (EF-11), une synchronisation est tentée (délai 5 s) ; si elle échoue, un dialogue d'alerte (AlertDialog) avertit « n réponses hors ligne n'ont pas encore été envoyées et seront perdues. » avec « Se déconnecter quand même » / « Annuler ».
- **CL-7 — Quota IndexedDB dépassé ou stockage refusé (navigation privée).** `QuotaExceededError` ou ouverture impossible : le préchargement est abandonné silencieusement (journal console `warn` en développement uniquement), l'application en ligne fonctionne normalement, `/hors-ligne` affiche l'état vide.
- **CL-8 — Navigateur sans service worker** (ou service worker refusé) : aucune erreur visible ; EF-5 non disponible ; l'enregistrement est encapsulé dans `if ('serviceWorker' in navigator)`.
- **CL-9 — Formation mise en pause ou terminée entre le préchargement et la synchronisation.** Les réponses restent appliquées (la révision a eu lieu) ; le paquet de cette formation est retiré au préchargement suivant.
- **CL-10 — Brique signalée erronée entre-temps (BR-MEM-09).** La réponse est enregistrée (`applied`) mais ne compte pas pour FSRS si la brique est `reported` ou `retired` ; résultat `applied` avec `correct` absent.
- **CL-11 — Lot partiellement invalide.** Chaque entrée est traitée indépendamment ; une entrée `rejected` n'empêche pas les autres ; la réponse HTTP reste 200.
- **CL-12 — Nouvelle version du service worker pendant une session hors ligne.** La version en attente n'est activée qu'au prochain chargement complet ; le schéma IndexedDB v1 est conservé ; toute évolution future passe par `upgrade()` avec migration (jamais de suppression de `queue`).

## 8. Instructions d'implémentation

1. Créer `apps/web/public/icons/source.svg` et `apps/web/scripts/generate-icons.mjs` ; générer `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` ; ajouter `apps/web/app/manifest.ts` et les balises du layout racine. Commit `feat(SPEC-801): ajoute le manifest et les icônes de l'application`.
2. Installer `@serwist/next`, `serwist`, `idb`, `fake-indexeddb` ; configurer `next.config.ts` (`withSerwist`), créer `app/sw.ts` avec les stratégies d'ET-2, déplacer le code push de SPEC-205 dans `lib/push/sw-push.ts`, créer `lib/offline/register-sw.ts`. Vérifier que les tests de SPEC-205 restent verts. Commit `feat(SPEC-801): ajoute le service worker Serwist`.
3. Écrire `docs/adr/` : rien à faire (ADR-0200 déjà présent) ; ajouter la migration `offline_sync_receipts` + politique RLS + test d'isolation (patron SPEC-113) ; mettre à jour `docs/architecture/data-model.md` §6. Commit `feat(SPEC-801): ajoute les reçus de synchronisation hors ligne`.
4. Contrats `packages/contracts/src/offline.ts` ; services `packages/services/src/offline/pack.ts` et `sync.ts` (ET-5, ET-7, ET-8) ; routes `apps/web/app/api/v1/offline/pack/route.ts` et `apps/web/app/api/v1/sync/offline-answers/route.ts` via `handler()` ; ligne ajoutée à `docs/architecture/api.md`. Commit `feat(SPEC-801): ajoute le paquet hors ligne et la synchronisation idempotente`.
5. Client : `lib/offline/db.ts`, `pack.ts`, `queue.ts`, `sync.ts`, `use-online-status.ts`, composant `OfflineIndicator` dans l'en-tête (SPEC-305), déclencheurs EF-4/EF-8 dans un composant `OfflineProvider` monté par le layout connecté ; purge à la déconnexion (EF-11, CL-6). Commit `feat(SPEC-801): ajoute la file d'attente et l'indicateur hors ligne`.
6. Interface `SessionSource` dans le hook de SPEC-701, `OfflineQuizGlobal`, pages `/hors-ligne` et `/hors-ligne/revisions`, libellés dans `apps/web/messages/fr.ts` (`offline.*`), routes publiques du middleware. Commit `feat(SPEC-801): rend le quiz global jouable hors ligne`.
7. Ajouter le gestionnaire `sync` du service worker et le purgeur des reçus au cron nocturne. Commit `feat(SPEC-801): synchronise en arrière-plan`.
8. Tests (§12) au fil des étapes, puis `/_dev/sdd/SPEC-801` n'est pas requis (mode `tokens`). Commit `test(SPEC-801): couvre l'installation et le hors ligne`.

## 9. Fichiers et composants concernés

- **Créés** : `apps/web/app/manifest.ts`, `apps/web/app/sw.ts`, `apps/web/public/icons/{source.svg,icon-192.png,icon-512.png,icon-maskable-512.png,apple-touch-icon.png}`, `apps/web/scripts/generate-icons.mjs`, `apps/web/app/hors-ligne/page.tsx`, `apps/web/app/hors-ligne/revisions/page.tsx`, `apps/web/lib/offline/{db.ts,pack.ts,queue.ts,sync.ts,register-sw.ts,use-online-status.ts,session-source.ts}`, `apps/web/components/offline/{OfflineIndicator.tsx,OfflineProvider.tsx,OfflineQuizGlobal.tsx,OfflinePackList.tsx}`, `apps/web/lib/push/sw-push.ts`, `apps/web/app/api/v1/offline/pack/route.ts`, `apps/web/app/api/v1/sync/offline-answers/route.ts`, `packages/contracts/src/offline.ts`, `packages/services/src/offline/{pack.ts,sync.ts}`, `packages/db/src/schema/offline.ts` + migration, tests listés au §12.
- **Modifiés** : `apps/web/next.config.ts` (Serwist), `apps/web/app/layout.tsx` (apple-touch-icon, theme-color), en-tête SPEC-305 (indicateur), hook et écran du quiz global SPEC-701 (`SessionSource`), service de déconnexion SPEC-202 (purge), `apps/web/middleware.ts` (routes publiques), `apps/web/messages/fr.ts`, `packages/jobs` cron nocturne (purge des reçus), `docs/architecture/api.md`, `docs/architecture/data-model.md`, `.gitignore` (`apps/web/public/sw.js`, `apps/web/public/swe-worker-*.js`).
- **Lus / réutilisés** : `@learny/bricks` (`grade`, vues), `@learny/ui` (Card, Button, EmptyState, Toast, AlertDialog, Badge), `packages/core/src/time.ts`, services de SPEC-701/411.

## 10. Interface et conformité visuelle

- Mode `tokens` (écrans SCR-10 hors ligne et SCR-20 `/hors-ligne`, sans maquette dédiée). L'écran de révision hors ligne réutilise les composants de `QuizGlobal.dc.html` ; seule différence structurelle : le bandeau EF-6 (fond `#FFF7E0`, texte `#111113`, rayon 16 px, icône `WifiOff` de lucide).
- Structure de `/hors-ligne` (ordre) : `main` → en-tête de page (sur-titre 14 px gris `#62626B` « Connexion perdue », `h1` 34 px Space Grotesk « Vous êtes hors ligne »), paragraphe, liste `data-testid="offline-packs"` de cartes blanches bordées `#E7E6E1` rayon 24 px (`data-testid="offline-pack-<fid>"`), bouton citron `#C6F432` « Réviser hors ligne », bouton contour `#DAD9D3` « Réessayer ». État vide : EmptyState `data-testid="offline-empty"`. Pas de coquille (menu, en-tête) sur `/hors-ligne`.
- Indicateur : pastille 32 px de haut, fond `#111113`, texte `#FFFFFF` 13 px, compteur sur fond `#C6F432`.
- Contrôles automatisés (`docs/engineering/testing.md` §6) : (1) `expectTokens` sur le titre (Space Grotesk, 34 px × 0,9), les boutons (couleurs citron et contour), les cartes (bordure, rayon) ; (2) structure et textes exacts ci-dessus ; (4) lignes de base `toHaveScreenshot` (`maxDiffPixelRatio: 0.01`) de `/hors-ligne` (avec et sans paquet) et de l'écran de révision hors ligne, en 1440×900 et 390×844, horloge figée au 2026-11-11T12:20:00Z, jeu de démonstration SPEC-115. La comparaison maquette (contrôle 3) s'applique à l'écran Quiz global en ligne, qui ne doit pas régresser : rejouer `@SPEC-701 @visual`.
- Accessibilité : bandeau et indicateur `role="status"` (`aria-live="polite"`), toasts annoncés, focus sur le `h1` à l'arrivée sur `/hors-ligne`, cibles ≥ 44 px.

## 11. Critères d'acceptation

- **CA-1** — `/manifest.webmanifest` contient exactement les champs d'EF-1 et les 3 icônes existent aux bonnes dimensions ; l'audit Lighthouse « installable » (catégorie PWA ou contrôle `installable-manifest` équivalent) est réussi sur `/accueil`.
- **CA-2** — Après un chargement en ligne de `/accueil` (utilisateur de démonstration), IndexedDB contient un paquet par formation active (2 pour Alex Perrin : SAP S/4HANA Finance et Gestion de projet agile ; Python est à l'état `programme_proposed`) avec la session du jour (14 notions pour SAP, conforme à la maquette) en moins de 3 s.
- **CA-3** — Navigateur hors ligne : `/formations/<fid SAP>/quiz-global` affiche l'écran de révision hors ligne ; une carte de rappel et un jeu d'association sont joués avec correction immédiate ; toute autre route affiche `/hors-ligne`.
- **CA-4** — Au retour du réseau, les réponses en file sont envoyées en un appel, `review_logs` contient une ligne `source = 'offline'` par réponse avec `reviewed_at` = heure de réponse, `notion_states` est mis à jour par le serveur, et la file est vide (indicateur absent).
- **CA-5** — Rejouer le même lot renvoie `duplicate` pour chaque entrée et ne crée aucune ligne supplémentaire dans `answers`, `review_logs` ni `daily_activity`.
- **CA-6** — Une position déjà répondue en ligne renvoie `conflict` et la réponse serveur est inchangée ; une entrée de plus de 7 jours renvoie `rejected` avec `EXPIRED`.
- **CA-7** — À la déconnexion, la base `learny-offline` n'existe plus ; aucune réponse d'API ni page authentifiée n'est présente dans le Cache Storage.
- **CA-8** — Aucune violation axe serious/critical sur `/hors-ligne` et l'écran hors ligne ; contrôles visuels (jetons, structure, lignes de base) réussis.

## 12. Plan de tests

- **Unitaires** (`describe('[SPEC-801] …')`) :
  - `apps/web/app/manifest.test.ts` : champs exacts d'EF-1.
  - `apps/web/scripts/generate-icons.test.ts` : dimensions des PNG (lecture `sharp().metadata()`).
  - `apps/web/lib/offline/queue.test.ts` (fake-indexeddb) : `enqueue` attribue un `clientId` unique, `pendingCount`, ordre par `answeredAt`.
  - `apps/web/lib/offline/sync.test.ts` : lots de 50, transitions `pending → syncing → supprimée`, échec réseau → retour à `pending`, `rejected` conservé, verrou empêchant deux synchronisations concurrentes.
  - `apps/web/lib/offline/pack.test.ts` : remplacement du paquet, propriétaire différent → purge, paquet expiré → supprimé, `QuotaExceededError` → abandon silencieux.
  - `packages/services/src/offline/sync.test.ts` (dépôts simulés) : tri par `answeredAt`, clamp de `answeredAt`, règle d'expiration 7 jours, règle de conflit ET-8, brique signalée CL-10.
  - `apps/web/components/offline/OfflineIndicator.test.tsx` : libellés « Hors ligne » et « n en attente », `role="status"`.
- **Intégration** (`[SPEC-801]`, base locale) :
  - `packages/services/test/integration/offline-pack.test.ts` : paquet du jeu de démonstration (2 formations, 14 notions SAP, ≤ 20 cartes, aucune ligne `ai_calls` créée).
  - `packages/services/test/integration/offline-sync.test.ts` : application, idempotence (`duplicate`), conflit, `EXPIRED`, `FORBIDDEN` (session d'un autre utilisateur), `daily_activity` du jour de réponse, `review_logs.source = 'offline'`.
  - `packages/db/test/integration/offline-receipts-rls.test.ts` : isolation RLS de `offline_sync_receipts`.
  - `apps/web/test/integration/sync-route.test.ts` : 400 au-delà de 50 entrées, 401 sans session, 200 avec résultats mixtes.
- **End-to-end** (Playwright, `apps/web/e2e/specs/p8/offline.spec.ts`, vidéo, horloge figée, `serviceWorkers: 'allow'`, étiquette `@chromium-only` en plus) :
  1. `installable et précharge les révisions @SPEC-801` : connexion d'Alex Perrin, `/accueil`, attente de l'enregistrement du service worker (`navigator.serviceWorker.ready`), lecture d'IndexedDB par `page.evaluate` (2 paquets), contrôle du manifest.
  2. `révise hors ligne puis synchronise @SPEC-801` : `context.setOffline(true)`, navigation vers le quiz global SAP, bandeau visible, carte de rappel retournée et « Bon », association jouée et vérifiée, indicateur « 2 en attente » ; navigation vers `/agenda` → page `/hors-ligne` ; `context.setOffline(false)`, attente du toast « 2 réponses synchronisées. », vérification API (`GET` de la session : positions répondues) et indicateur absent.
  3. `conflit et déconnexion @SPEC-801` : réponse hors ligne sur une position déjà répondue via l'API, toast de conflit ; déconnexion → `indexedDB.databases()` ne contient plus `learny-offline`, `caches.keys()` sans cache d'API.
  4. Axe (`@axe-core/playwright`) sur `/hors-ligne` et l'écran hors ligne dans les tests 2 et 3.
- **Visuel** (`@SPEC-801 @visual`, `apps/web/e2e/specs/p8/offline-visual.spec.ts`) : `expectTokens` et structure de `/hors-ligne` (avec paquets, vide) et de l'écran hors ligne ; `toHaveScreenshot` desktop et mobile (`maxDiffPixelRatio: 0.01`).
- **Non-régression** : rejouer `@SPEC-701`, `@SPEC-702`, `@SPEC-703`, `@SPEC-205`, `@SPEC-305`, `@SPEC-202` ; `pnpm test:unit` et `pnpm test:int` complets.

| Critère | Tests |
|---|---|
| CA-1 | `manifest.test.ts`, `generate-icons.test.ts`, e2e 1 |
| CA-2 | `offline-pack.test.ts`, `pack.test.ts`, e2e 1 |
| CA-3 | e2e 2 |
| CA-4 | `offline-sync.test.ts`, `sync.test.ts`, e2e 2 |
| CA-5 | `offline-sync.test.ts`, `sync-route.test.ts` |
| CA-6 | `services/offline/sync.test.ts`, `offline-sync.test.ts`, e2e 3 |
| CA-7 | `pack.test.ts`, e2e 3 |
| CA-8 | e2e 2 et 3 (axe), `offline-visual.spec.ts` (`@visual`) |

## 13. Preuves attendues

- Vidéos : `révise hors ligne puis synchronise` (scénario complet coupure → jeu → retour réseau) et `conflit et déconnexion`.
- Captures : `offline-page-desktop.png`, `offline-page-mobile.png`, `offline-empty.png`, `offline-quiz-mobile.png`, `offline-indicator.png`, `manifest.json` (copie de la réponse) dans `evidence/SPEC-801/screenshots/`.
- Mesures consignées dans `acceptance.md` : temps de préchargement, taille du paquet (octets), nombre de lignes `review_logs` avant/après synchronisation et après rejeu.

## 14. Définition de terminé

Définition commune de `docs/engineering/testing.md` §7, plus : un seul service worker enregistré à la portée `/` (les tests Web Push de SPEC-205 passent avec le nouveau fichier) ; `docs/architecture/api.md` et `data-model.md` mis à jour ; aucune réponse d'API ni page HTML authentifiée dans le Cache Storage (vérifié par test) ; aucune utilisation de `new Date()` hors du module d'horloge.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0037 (principe PWA), ADR-0047 (horloge), ADR-0020 et ADR-0025 (FSRS côté serveur uniquement), ADR-0055 (Web Push, service worker unique), ADR-0063 (TanStack Query côté client), ADR-0059 (composants).
- **ADR-0200 créé** (« PWA : stratégies de cache, stockage hors ligne et synchronisation ») : tableau des stratégies d'ET-2, aucune page authentifiée en cache, schéma IndexedDB v1, paquet quotidien (session + 20 cartes du lendemain), lots de 50, reçus `offline_sync_receipts` (30 jours), expiration des réponses à 7 jours, règle de conflit d'ET-8, purge à la déconnexion.
- Compléments au modèle et à l'API signalés : table `offline_sync_receipts` ; route `GET /api/v1/offline/pack`.
- Hypothèse : les items renvoyés par SPEC-701 contiennent le `payload` complet des versions de briques (réponses attendues comprises) ; sinon, `buildPack` les complète depuis `brick_versions` (données de l'utilisateur lui-même).
- Pas de bouton d'installation personnalisé en V1 ; l'invite du navigateur suffit.
