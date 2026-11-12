# @learny/ui

Design system of Learny (ADR-0059). The package exposes the typed design tokens, the generated
Tailwind CSS 4 theme, the shared class-name helper and the action/form components of SPEC-302.

## Public API

| Entry point            | Contents                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@learny/ui`           | Components and `cn(...classes)` — `clsx` composed with a `tailwind-merge` instance configured for the Learny scales.                                                            |
| `@learny/ui/tokens`    | `colors`, `fontSizesPx`, `fontWeights`, `lineHeights`, `letterSpacings`, `spacingPx`, `radiiPx`, `shadows`, `controlHeightsPx`, `layout`, `focusRing`, `tokensExport`, `px(n)`. |
| `@learny/ui/theme.css` | Generated Tailwind CSS 4 theme (`pnpm --filter @learny/ui tokens:css`). Never edit it by hand.                                                                                  |

## Components (SPEC-302)

Each component lives in `src/components/<Name>/` with its test and barrel (`index.ts`). Every
component forwards `ref`, merges `className` last and transmits `data-testid` and `aria-*`.

| Component                                           | Props (main)                                                                                                      | Defaults / notes                                                                                  |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `Button`                                            | `variant`, `size`, `fullWidth`, `loading`, `leadingIcon`, `trailingIcon`, `asChild`, native `<button>` attributes | `dark`, `md`, `type="button"`; `loading` disables and sets `aria-busy`                            |
| `IconButton`                                        | `label` (required, `aria-label`), `icon`, `tone`, `size`, `badge`                                                 | `light`, `md`; sizes `md` 42, `sm` 32, `xs` 28                                                    |
| `Link`                                              | `next/link` props, `variant`, `weight`                                                                            | `inline`, `semibold`; external `http(s)` gets `target="_blank"`, `rel` and a screen-reader notice |
| `TextField`                                         | `label`, `hint`, `error`, `variant`, `leadingIcon`, `hideLabel`, native `<input>` attributes                      | `form`; `search` variant with 18 px icon; error uses `role="alert"` and `aria-invalid`            |
| `Textarea`                                          | `label`, `hint`, `error`, `hideLabel`, `maxLength`, native `<textarea>` attributes                                | counter `n / max`, `aria-live="polite"` from 90 %                                                 |
| `Select`                                            | `label`, `hint`, `error`, `options`, `hideLabel`, native `<select>` attributes                                    | `options: { value, label, disabled? }[]`                                                          |
| `Checkbox`                                          | `label` (required), `hint`, `error`, `indeterminate`, native `<input type="checkbox">` attributes                 | 18 × 18, `accent-ink`, clickable label                                                            |
| `Switch`                                            | `checked`, `onCheckedChange`, `label`, `description`, `locked`                                                    | Radix `role="switch"`; `locked` never changes and sets `aria-disabled`                            |
| `SegmentedControl<T>`                               | `options`, `value`, `onValueChange`, `aria-label`, `variant`, `size`, `fullWidth`                                 | `aria-pressed` buttons, roving tabindex, arrows/Home/End; soft or solid                           |
| `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent` | Radix Tabs props; `TabsList` requires `aria-label` and accepts `variant`                                          | ARIA tabs, automatic activation, soft (36 px) or solid (40 px)                                    |
| `Chip`                                              | `pressed`, `onPressedChange`, `shape`, `size`, `count`, `ariaLabel`                                               | non-exclusive toggle; `rounded` or `pill`                                                         |
| `Badge`                                             | `tone`, `size`, native `<span>` attributes                                                                        | non-interactive status pill, nine tones                                                           |
| `CountBadge`                                        | `value`, `tone`, native `<span>` attributes                                                                       | `99+` above 99; `lime` or `orange-on-dark`                                                        |
| `Form`                                              | `form` (`UseFormReturn`), native `<form>` attributes                                                              | `FormProvider` + `noValidate`                                                                     |
| `FormField`                                         | `name`, `label`, `hint`, `hideLabel`, `render(api)`                                                               | binds id, label, `aria-invalid`, `aria-describedby` and the Zod error                             |
| `FormError`                                         | native `<p>` attributes                                                                                           | global error, `role="alert"`                                                                      |
| `useZodForm`                                        | Zod schema, `UseFormProps` (without resolver/mode)                                                                | `zodResolver`, first validation on blur then on change                                            |

## Tokens

Values come from the mockups in `design/maquettes/` (SPEC-301, ADR-0034). Sizes are expressed in
rem as `px / 16`; `apps/web/app/globals.css` sets `html { font-size: 90% }`, so 1 rem renders at
14.4 px and the application matches the 90 % scale of the mockups without `zoom`.

## Commands

```bash
pnpm --filter @learny/ui tokens:css   # regenerate src/styles/theme.css
pnpm --filter @learny/ui typecheck
pnpm --filter @learny/ui lint
pnpm test:unit -t SPEC-302
pnpm test:int -t SPEC-302
```
