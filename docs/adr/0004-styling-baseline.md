# 0004 — Material UI is the styling baseline; Tailwind is unresolved

**Status:** **Open — decision required** · **Date:** 2026-08-10

## Context

The ticket mandates "Material UI baseline with a theme file. No component work."
The repository was scaffolded with `create-next-app`, which installed Tailwind
CSS v4. The two overlap: both ship a CSS reset (Tailwind's Preflight, MUI's
`CssBaseline`), and both offer a complete styling idiom.

Leaving both installed with no rule about which to use is the kind of ambiguity
that produces an inconsistent UI six months later, when the answer is "whichever
the agent felt like that day."

## Current state

- Material UI **is** the baseline. `src/theme.ts` is the theme file, applied in
  `src/app/layout.tsx` via `AppRouterCacheProvider` + `ThemeProvider` +
  `CssBaseline`. Every page in the repository is built with MUI components only.
- Tailwind remains installed (`tailwindcss`, `@tailwindcss/postcss`,
  `postcss.config.mjs`, the `@import "tailwindcss"` in `src/app/globals.css`) and
  is **not used by any application code**.

## Decision required

Brian is having this reviewed separately. Two options:

1. **Remove Tailwind.** Delete the two dependencies, `postcss.config.mjs`, and
   the `@import` line. One styling system. This is the current recommendation.
2. **Keep both**, with an explicit written rule about which is used for what.

Until it is decided: **build UI with MUI.** Do not add Tailwind classes to
application code — that would make option 1 expensive.

Because no application code depends on Tailwind today, option 1 is currently a
clean deletion. That stops being true as soon as someone uses a Tailwind class.
