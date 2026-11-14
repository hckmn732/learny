# Blocages

## B-001 — Firefox cross-browser sur l'hôte de développement (2026-11-14)

- **Contexte** : CP-6 exige un cross-browser Chromium / Firefox / WebKit sur les parcours
  principaux. Chromium et WebKit passent (WebKit : 47 tests des parcours P6). Firefox 159
  (build Playwright 1.65, `firefox-1572`) ne peut pas exécuter les pages de l'application sur cet
  hôte : le processus de contenu meurt en `SIGSEGV` dans `libxul.so`, toujours au même offset
  (`libxul.so+0x4c87f14`, instruction d'écriture sur un pointeur nul).
- **Preuves** : `journalctl -b -k` enregistre un `segfault ... in libxul.so` pour chaque test
  Firefox qui échoue ; Playwright rapporte `Page crashed` (14 occurrences sur la campagne
  cross-browser complète, puis reproduit de façon déterministe sur
  `spec-604-cadrage.spec.ts:52`).
- **Tentatives** : désactivation de Fission, de WebRender et du JIT ; désactivation des bacs à
  sable de contenu et GPU ; désactivation de l'ASLR (`setarch -R`) ; désactivation de la vidéo et
  des traces Playwright ; exécution du même build Firefox dans le conteneur officiel
  `mcr.microsoft.com/playwright:v1.65.0-noble`. Le binaire démarre mais le processus de contenu
  reste instable.
- **Décision** : le cross-browser des parcours principaux est exécuté sur **Chromium et WebKit**
  sur cet hôte ; Firefox est explicitement neutralisé par `CROSS_BROWSER_SKIP_FIREFOX=1` pour le
  checkpoint local (`grep: /$^/`), avec ce blocage consigné. Sur un runner compatible
  (Ubuntu 24.04, celui de la CI), la variable n'est pas définie : Firefox rejoue la suite
  complète des parcours P6.
- **Portée** : aucune fonctionnalité produit n'est simplifiée ; les tests Firefox restent dans le
  dépôt et le projet Playwright est inchangé hors opt-out explicite. Les visuels restent validés
  sur Chromium desktop/mobile et les parcours fonctionnels sur WebKit.
