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

## Structure and feedback (SPEC-303)

| Component                                       | Props (main)                                                                                                                              | Defaults / notes                                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `Card` / `CardHeader`                           | `as`, `tone` (`default`/`dark`/`lime`/`subtle`), `padding`, `radius`, `labelledBy`; header `title`, `description`, `titleSize`, `actions` | `section`, `default`, `md`, 24 (18 for subtle); `lg` title is 22 px Space Grotesk            |
| `StatCard` / `StatRow`                          | `value`, `label`, `tone` (`dark`/`light`)                                                                                                 | 34 px Space Grotesk figure, 13 px label; row wraps and stacks under 480 px                   |
| `ProgressBar`                                   | `value`, `tone`, `size`, `onDark`, and exactly one of `label`, `labelledBy`, `decorative` (typed union)                                   | clamped 0–100; fill width is the only inline style                                           |
| `ProgressRing`                                  | `value`, `label`, `size` (`md` 112 px, `xs` 36 px), `tone` (`indigo`/`teal`)                                                              | `role="img"` wrapper, hidden SVG; dasharray 248.6 for 86 %                                   |
| `Avatar` / `getInitials`                        | `firstName`, `lastName`, `size` (`md`/`sm`)                                                                                               | accent-preserving initials, `?` when empty, `aria-hidden` by default                         |
| `Popover` / `PopoverTrigger` / `PopoverContent` | Radix props; `width`, `align`, `sideOffset`                                                                                               | radius 20, popover shadow, 400 px, inside viewport minus 32 px                               |
| `DropdownMenu*`                                 | Radix props; `DropdownMenuItem.icon`, `DropdownMenuLabel`, `DropdownMenuSeparator`                                                        | 260 px non-modal menu, 42 px items, arrows/Home/End, Escape and Tab close                    |
| `Dialog*`                                       | Radix props; `size`, `initialFocusRef`, `returnFocusRef`, `hideClose`; `DialogFooter`                                                     | trapped focus, explicit `aria-modal`, body lock + `inert` background, 150 ms entrance        |
| `AlertDialog`                                   | `trigger`, `title`, `description`, `confirmLabel`, `cancelLabel`, `onConfirm`, `destructive`, `size`, `open`                              | initial focus on Annuler; promise shows the loading button; destructive dot and warning icon |
| `ToastProvider` / `toast`                       | `toast({ title, description, tone, action, durationMs })`, store helpers                                                                  | three toasts max, 5 s (8 s with action), bottom centre, error assertive                      |
| `Tooltip*`                                      | Radix props                                                                                                                               | 400 ms delay, dark 12 px bubble, arrow, keyboard focus                                       |
| `EmptyState`                                    | `title`, `description`, `icon`, `tone`, `action`, `compact`                                                                               | 64 px pictogram, 22 px display title; compact is text-only                                   |
| `Skeleton*`                                     | `Skeleton`, `SkeletonText`, `SkeletonCard`, `SkeletonStatRow`, `SkeletonGroup`                                                            | pulse 1.5 s disabled under reduced motion; group carries `aria-busy` and « Chargement… »     |
| `ErrorState`                                    | `title`, `description`, `onRetry`, `requestId`                                                                                            | `role="alert"`, retry button, copyable reference; refusal selects the text                   |
| `Breadcrumb` / `buildFormationBreadcrumb`       | `items`, `ariaLabel`; builder `{ formationId, module?, page }`, injected messages                                                         | `Programme / Module n · titre / page`, 40-character truncation, `aria-current="page"`        |
| `PageHeader`                                    | `eyebrow`, `title`, `breadcrumb`, `actions`                                                                                               | h1 34 px Space Grotesk, eyebrow 14 px muted                                                  |
| `Icon` / `iconRegistry`                         | `name`, `size`, `strokeWidth`                                                                                                             | 23 named lucide icons, always `aria-hidden`                                                  |

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
