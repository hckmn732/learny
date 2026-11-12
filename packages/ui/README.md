# @learny/ui

Design system of Learny (ADR-0059). The package exposes the typed design tokens, the generated
Tailwind CSS 4 theme and the shared class-name helper.

## Public API

| Entry point            | Contents                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@learny/ui`           | `cn(...classes)` — `clsx` composed with a `tailwind-merge` instance configured for the Learny scales.                                                                           |
| `@learny/ui/tokens`    | `colors`, `fontSizesPx`, `fontWeights`, `lineHeights`, `letterSpacings`, `spacingPx`, `radiiPx`, `shadows`, `controlHeightsPx`, `layout`, `focusRing`, `tokensExport`, `px(n)`. |
| `@learny/ui/theme.css` | Generated Tailwind CSS 4 theme (`pnpm --filter @learny/ui tokens:css`). Never edit it by hand.                                                                                  |

## Tokens

Values come from the mockups in `design/maquettes/` (SPEC-301, ADR-0034). Sizes are expressed in
rem as `px / 16`; `apps/web/app/globals.css` sets `html { font-size: 90% }`, so 1 rem renders at
14.4 px and the application matches the 90 % scale of the mockups without `zoom`.

## Commands

```bash
pnpm --filter @learny/ui tokens:css   # regenerate src/styles/theme.css
pnpm --filter @learny/ui typecheck
pnpm --filter @learny/ui lint
```
