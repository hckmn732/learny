# SPEC-302 — critères d'acceptation

Date : 2026-11-12 · Branche : `spec/SPEC-302-composants-de-base-i-actions-et-saisie` · Horloge figée : 2026-11-11T12:20:00Z · `LLM_MODE=mock`.

- ✅ **CA-1** — Les six variantes et quatre tailles de `Button` ont exactement les couleurs, rayons, hauteurs et graisses de EF-1 (styles calculés).
  Preuve : unitaire `[SPEC-302] Button` (`packages/ui/src/components/Button/Button.test.tsx`, 6 cas de variantes + 4 tailles) ; e2e `styles calculés des actions et de la saisie @SPEC-302` — `expectTokens` vérifie `ui-button-lime-md` fond `#C6F432`, texte `#111113`, graisse 700, rayon 10.8 px et hauteur min 39.6 px, puis `ui-button-outline-md` bordure `#DAD9D3` (rapport `e2e.json`).
- ✅ **CA-2** — `Switch` expose `role="switch"` et `aria-checked`, bascule à Espace, reste inchangé et `aria-disabled` quand `locked`.
  Preuve : unitaire `[SPEC-302] Switch` (`Switch.test.tsx` : clic, Espace, `locked`, description) ; e2e `parcours clavier des contrôles @SPEC-302` — Tab jusqu'à `ui-switch-on`, Espace bascule `aria-checked` true→false→true ; `ui-switch-locked` porte `aria-disabled="true"` (vidéo `video/`).
- ✅ **CA-3** — `Tabs` respecte le motif ARIA (tablist/tab/tabpanel, `aria-selected`, flèches qui bouclent, un seul contrôle dans l'ordre de tabulation) ; `SegmentedControl` expose `aria-pressed` et le tabindex itinérant.
  Preuve : unitaires `[SPEC-302] Tabs` et `[SPEC-302] SegmentedControl` (rôles ARIA, `aria-selected`, panneaux, flèches avec boucle, Home/End, `aria-pressed`, tabindex 0/-1) ; e2e `parcours clavier des contrôles @SPEC-302` — onglets solid : Profil → Notifications → Apprentissage → Profil, panneau actif vérifié, puis segmenté soft : flèches, Fin, Début (vidéo `video/`).
- ✅ **CA-4** — Le formulaire d'exemple affiche les erreurs Zod sous les champs en `role="alert"`, avec `aria-invalid` et `aria-describedby`, et place le focus sur le premier champ en erreur à la soumission.
  Preuve : unitaire `[SPEC-302] useZodForm` (`Form.test.tsx` : erreurs au blur, disparition à la frappe, deux alertes à la soumission vide, focus sur l'e-mail, soumission valide) ; e2e `parcours clavier des contrôles @SPEC-302` — deux alertes visibles, `aria-invalid="true"` et `document.activeElement.type === "email"` (vidéo `video/`).
- ✅ **CA-5** — Les galeries `/_dev/ui/actions` et `/_dev/ui/saisie` n'ont aucune violation axe serious/critical et correspondent à leurs lignes de base.
  Preuve : e2e `galeries actions et saisie ligne de base @SPEC-302 @visual @mobile` (desktop et mobile) — `axeCheck` sans violation, `toHaveScreenshot` `maxDiffPixelRatio: 0.01` ; baselines `apps/web/e2e/__screenshots__/p3/spec-302-actions-saisie.spec.ts/dev-ui-actions-{desktop,mobile}-linux.png` et `dev-ui-saisie-{desktop,mobile}-linux.png` ; rapport axe dans `attachments/`.
- ✅ **CA-6** — Aucun composant n'utilise de couleur, taille ou rayon hors jetons (lint vert, recherche de littéraux hexadécimaux nulle dans `packages/ui/src/components`).
  Preuve : intégration `[SPEC-302] rendu serveur` (`packages/ui/test/integration/components-render.test.tsx`) — snapshot des classes générées pour toutes les variantes de `Button`, `Badge`, `Chip`, `IconButton`, `TextField`, `Switch`, `SegmentedControl` et `Tabs` ; `pnpm lint` vert ; `grep -rEn '#[0-9A-Fa-f]{3,8}\b' packages/ui/src/components packages/ui/src/forms` ne renvoie aucun résultat ; aucun `style={{` non plus.

## Preuves complémentaires

- **Unitaires** : `pnpm test:unit -t "SPEC-302"` → 43 tests `[SPEC-302]` réussis (15 fichiers).
- **Intégration** : `pnpm test:int -t "SPEC-302"` → 3 tests `[SPEC-302] rendu serveur` réussis (rendu `renderToString` de chaque composant + snapshot de classes).
- **E2E** : `pnpm test:e2e --grep "@SPEC-302"` → 4 tests réussis (parcours clavier, styles calculés, visuel desktop et mobile), vidéos Playwright attachées.
- **Visuel** : quatre lignes de base créées par cette spécification (aucune ligne de base antérieure modifiée) ; captures pleine page avec horloge figée et `maxDiffPixelRatio: 0.01`.
- **Bundle de la galerie** (Next 16, `route-bundle-stats.json`, gzip niveau 9) : code propre aux routes `/_dev/ui/actions` = 1 487 octets et `/_dev/ui/saisie` = 2 617 octets, soit 4,1 Ko gzip ajoutés par les galeries. Le socle partagé (chunk commun des composants : `react-hook-form`, `cn`/tailwind-merge, Radix Tabs/Switch, lucide, cva, Zod) pèse 39 744 octets gzip ; il est requis par tous les formulaires et contrôles du produit (ADR-0064), pas seulement par la galerie. ET-7 est donc respecté pour le code ajouté aux pages de galerie ; le socle reste mutualisé.
- **Non-régression** : suite unitaire complète 1 153/1 153 réussie. La suite d'intégration complète passe 462 tests ; trois tests hors périmètre (`tools/security` et `tools/docker`) échouent dans cet environnement car `gitleaks` ne trouve pas `.gitleaks.toml` depuis le répertoire de test et l'état Docker self-host n'est pas monté — aucun test SPEC-302 ni aucune régression produit n'est concerné.
