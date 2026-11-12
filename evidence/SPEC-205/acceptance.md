# SPEC-205 — critères d'acceptation

Mesures du 2026-11-12 sur la pile Supabase locale (`pnpm dev:up`), horloge figée ADR-0047
(`2026-11-11T12:20:00Z`) et `PUSH_MODE=mock` (ADR-0055, ADR-0261) : Postgres réel avec ses
politiques RLS et ses déclencheurs, deux identités `authenticated` réelles, service worker exécuté
en bac à sable. Aucun service push réel n'est appelé et aucune clé VAPID privée n'est écrite dans
les preuves. Preuves : `unit.json` (25 tests `[SPEC-205]`), `integration.json` (11 tests
`[SPEC-205]`), `e2e.json`, les sept vidéos de `video/`, les captures de `screenshots/`, les
baselines desktop/mobile de `apps/web/e2e/__screenshots__/p2/spec-205.spec.ts/` et les mesures
écrites par les tests eux-mêmes dans `proofs/` (comptes, codes et statuts uniquement : aucun
endpoint, aucune clé, aucune adresse). Les maquettes n'ont pas été modifiées.

- ✅ **CA-1** — L'abonnement exige permission et session, un endpoint n'appartient qu'à un compte et
  le retrait est idempotent.
  Preuve : intégration `[SPEC-205] push subscriptions › registration under Row Level Security (CA-1)`
  « creates the subscription of a learner, then refreshes it idempotently on the same endpoint »
  (première création `created: true`, rejeu sur le même endpoint `created: false` et même `id`, une
  seule ligne, clés `p256dh`/`auth` remplacées), « refuses the endpoint of another account with a
  neutral answer and no leak (CL-3) » (`FORBIDDEN` 403, message sans l'endpoint ni le mot
  « existe/appartient », 0 ligne pour le second compte, lecture RLS par endpoint : 0 ligne),
  « removes idempotently, and a foreign removal deletes nothing while answering the same (EF-2) »
  (retrait par un tiers `removed: 0` puis par le propriétaire `1` puis `0`, ligne du propriétaire
  intacte après le retrait étranger) et « refuses an endpoint the server must never contact (ET-3)
  and an anonymous caller » (10 endpoints refusés : `http`, `localhost`, IP littérales, hôte
  mono-label, identifiants dans l'URL, `.internal`, espace, 2 100 caractères, `javascript:` ;
  appelant anonyme → `UNAUTHENTICATED`). Unitaires `[SPEC-205] browser push flow` : « asks the
  permission once, subscribes with the key and saves the subscription (EF-3) », « shares one run
  between two simultaneous clicks: one prompt, one subscription (CL-7) » et « reuses an existing
  browser subscription instead of creating a second one ». E2E `@SPEC-205` « parcourt les routes
  réelles : abonnement, unicité, retrait » : `POST` sans session → 401, endpoint non public → 400
  `VALIDATION_FAILED` en `application/problem+json`, création `created: true` puis rejeu
  `created: false` avec le même `id`, même endpoint depuis un second compte → 403 `FORBIDDEN` sans
  l'endpoint dans la réponse, `DELETE` étranger → 204 sans suppression, deux `DELETE` du
  propriétaire → 204 puis 0 ligne. Mesures : `proofs/registration.json` (`upsert`, `foreign-endpoint`,
  `remove`, `endpoint-validation`).
- ✅ **CA-2** — 404/410 nettoient immédiatement ; cinq échecs transitoires nettoient ; un succès
  réinitialise le compteur.
  Preuve : unitaires `[SPEC-205] push delivery › push service answers` « treats 2xx as sent, 404 and
  410 as gone, anything else as transient (CA-2) », « removes the subscription at the first 404 or
  410, whatever the counter (CL-4) », « counts transient failures 1 to 4 and removes at the fifth
  (CL-5) » et « resets the counter to zero after an intermediate success (CL-5) ». Intégration
  `[SPEC-205] push subscriptions › sending through the mock push service (CA-2, CA-4)` :
  « removes the subscription at the first 404 and at the first 410, in the same transaction as the
  journal (CL-4, ET-5) » (0 ligne après la première réponse, journal `failed`/`gone`,
  `remainingSubscriptions: 0`), « counts transient failures 1 to 4, removes at the fifth, and resets
  after a success (CL-5) » (compteurs mesurés `[1, 2, 3]`, succès intermédiaire → 0, puis
  `[1, 2, 3, 4, 'removed']` et journal `failed`/`transient` rejouable) et « writes `sent`, resets the
  counter and stamps last_success_at on a 201 » (compteur remis à 0, `last_success_at` à l'horloge
  injectée, payload minimal reçu une fois). Mesures : `proofs/send.json` (`success`, `missing`,
  `gone`, `five-failures`, `retry`, `three-subscriptions`).
- ✅ **CA-3** — Le service worker n'ouvre qu'une URL interne et aucun secret VAPID privé n'atteint le
  client.
  Preuve : unitaires `[SPEC-205] service worker` « opens or focuses an internal URL only (CL-6,
  CA-3) » (chemin interne ouvert ou fenêtre focalisée et naviguée sur la même origine) et
  « ignores external, javascript:, protocol-relative and malformed URLs (CL-6) » (neuf valeurs :
  `https://evil.example/`, `javascript:alert(1)`, `//evil.example/x`, `/\evil.example`, `quiz`, vide,
  `null`, `undefined`, nombre → aucune ouverture, aucune navigation, aucun focus) ; `[SPEC-205] push
  delivery › safe click URL (CL-6, CA-3)` couvre les mêmes refus côté serveur et l'acceptation de
  `/quiz/global` et `/agenda?from=…` ; `[SPEC-205] push delivery › payload (EF-4, ET-3)` vérifie que
  la charge ne contient que `title`, `body`, `icon`, `url`, `tag` et refuse un `href` externe,
  protocol-relative ou `javascript:` avant tout envoi. Intégration `[SPEC-205] push subscriptions ›
  no private key reaches the client (CA-3, ET-6)` : 25 fichiers scannés (service worker et bundles
  `.next/static`), 0 occurrence du nom `VAPID_PRIVATE_KEY` ou de sa valeur. Unitaire `[SPEC-205]
  service worker` « contains no secret, no cache and only the push handlers (ET-4) » : aucun
  `privateKey`, `caches.` ou `fetch(` dans `apps/web/public/sw.js`. Mesures : `proofs/bundle.json`.
- ✅ **CA-4** — Permission refusée ou API Push absente garde le canal in-app utilisable et ne lance
  aucun envoi.
  Preuve : unitaires `[SPEC-205] browser push flow` « reports a refused permission without
  subscribing or saving anything (CL-1) » (aucun `subscribe`, aucune sauvegarde, seconde tentative
  sans nouvelle demande) et « never prompts when the browser has no Push API or the key is not
  configured (CL-2) » (aucune demande de permission, états `unsupported`/`unconfigured`). Intégration
  « sends nothing and keeps the in-app notification when the learner has no subscription (CA-4) » :
  0 appel au service push, journal `skipped_pref`/`no_subscription`, notification in-app toujours
  non lue (1 ligne), aucun envoi déclenché. E2E `@SPEC-205` « simule les permissions push » : avec
  la permission refusée, message « Permission refusée : les notifications in-app restent
  disponibles. », état d'abonnement `none`, 0 ligne `push_subscriptions`, envoi simulé
  `skipped_pref`/`no_subscription`, aperçu « Sans abonnement, la notification reste dans la boîte
  in-app. » et annonce `aria-live` « Livraison : Ignorée. Abonnements restants : 0. » ; l'API Push
  absente désactive le bouton avec explication (`spec-205-support-missing`), puis redevient
  disponible. Mesures : `proofs/send.json` (`no-subscription`).
- ✅ **CA-5** — La démonstration simule les états, passe axe, vidéo et captures desktop/mobile.
  Preuve : e2e `@SPEC-205` « simule les permissions push » (titre H1 `SPEC-205 — Notifications
  navigateur`, sections `spec-205-permission`, `spec-205-subscription`, `spec-205-preview`,
  `spec-205-delivery` dans cet ordre, quatre titres de niveau 2, permissions `default`/`granted`/
  `denied` navigables au clavier avec `Space`, demandes comptées, scénarios `success`/`missing`/
  `gone`/`transient`, journal réel de `sendPush`, axe sans violation serious/critical — pièce jointe
  `attachments/01-…-axe.json` vide —, aucune erreur de console, vidéo
  `video/04-…` et capture `screenshots/02-…` et `screenshots/03-…`) et « push conforme @SPEC-205
  @visual @mobile » pour desktop et mobile (jetons `#F4F4F1` / `#FFFFFF` / `#E7E6E1` / rayon 24 px,
  Inter et Space Grotesk, aucun défilement horizontal, axe vide en pièces jointes `07-…-axe.json` et
  `12-…-axe.json`, baselines `spec-205-demo-desktop-linux.png` et
  `spec-205-demo-mobile-linux.png` comparées à ≤ 1 %, vidéos `09-…`/`10-…` et `14-…`/`15-…`,
  captures `08-…` et `13-…`). Le parcours réel « parcourt les routes réelles » fournit en plus sa
  capture `17-…` et sa vidéo `18-…`. Aucune vraie demande de permission n'est émise : le compteur
  `Notification.requestPermission` instrumenté reste à 0 (EF-7). Les trois permissions restent
  atteignables au clavier et les réponses sont annoncées par `aria-live`.
