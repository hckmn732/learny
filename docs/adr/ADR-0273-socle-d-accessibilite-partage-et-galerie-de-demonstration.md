# ADR-0273 — Socle d’accessibilité partagé et galerie de démonstration

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-309

## Contexte

SPEC-309 exige un lien d’évitement, le retour du focus des panneaux, des annonces `aria-live` sans doublon, la désactivation des animations décoratives sous `prefers-reduced-motion` et des contrastes WCAG 2.2 AA vérifiés. Le layout connecté `apps/web/components/shell/app-shell.tsx` n’existe pas encore : il est livré par SPEC-304 et SPEC-305, qui ne sont pas démarrées. Les primitives doivent donc vivre dans `packages/ui` sans dépendre des messages de l’application, puis être réutilisées telles quelles par la future coquille.

## Décision

1. `@learny/ui/accessibility` expose `SkipLink`, `LiveRegion`, les helpers de gestion du focus (`returnFocus`, `focusMainContent`, `resolveFocusTarget`) et les utilitaires de contraste WCAG 2.2. `@learny/ui/accessibility.css` fournit le lien d’évitement, la classe visuellement masquée, le style des cibles de focus et la neutralisation globale des animations sous `prefers-reduced-motion`. Il est importé une fois par `apps/web/app/globals.css`.
2. En l’absence de coquille connectée, le lien d’évitement et `main#contenu-principal` sont appliqués au layout de la galerie `/_dev/ui`, seule route dotée d’un layout persistant à ce stade. SPEC-304 et SPEC-305 consommeront les mêmes primitives dans `AppShell` sans modifier leur contrat.
3. `LiveRegion` déduplique les messages consécutifs identiques et réinitialise sa mémoire quand le message est effacé ; les erreurs utilisent `role="alert"` et `aria-live="assertive"`.
4. `@learny/testing/axe` centralise le filtrage des violations `serious` et `critical`, utilisé par la fixture Playwright et couvert par un test unitaire. La galerie `/_dev/ui/accessibilite` démontre le socle, les contrastes de jetons et les états asynchrones.
5. Le test d’intégration de `packages/ui` vérifie le RLS réel de `public.profiles` avec deux utilisateurs créés dans une transaction annulée, puis l’absence de fuite de données dans l’état d’erreur affiché par l’interface.

## Conséquences

`apps/web/components/shell/app-shell.tsx` reste à créer par SPEC-304 ; aucune route connectée n’est introduite hors périmètre. Les lignes de base visuelles `dev-ui-accessibilite-desktop-linux.png` et `dev-ui-accessibilite-mobile-linux.png` sont ajoutées et devront être mises à jour, avec justification, par toute spécification qui modifie la galerie. Le socle est disponible pour les écrans des phases suivantes sans duplication.
