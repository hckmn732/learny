# Lignes de base visuelles modifiées

- `apps/web/e2e/__screenshots__/p1/spec-101-db.spec.ts/spec-101-demo-desktop-linux.png` —
  régénérée par `pnpm test:e2e --grep "@SPEC-101" --update-snapshots`. La page de démonstration de
  SPEC-101 liste les migrations appliquées ; `0018_ai_billing` et `0019_ai_billing_rules` ajoutent
  deux lignes à ce tableau. Aucun autre écran de la phase P1 n'a changé.
- `apps/web/e2e/__screenshots__/p1/spec-110.spec.ts/spec-110-ai-billing-desktop-linux.png` et
  `…-mobile-linux.png` — nouvelles lignes de base de la page SPEC-110, générées par
  `pnpm test:e2e --grep "@SPEC-110" --update-snapshots` puis vérifiées sans mise à jour.
