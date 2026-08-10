# 0004 — Material UI and Tailwind coexist; MUI is the component baseline

**Status:** Accepted · **Date:** 2026-08-10 · **Decided by:** Brian Schuster

Supersedes the open question originally raised in this ADR.

## Context

The ticket mandates "Material UI baseline with a theme file. No component work."
The repository was scaffolded with `create-next-app`, which installed Tailwind
CSS v4. The two overlap: both ship a CSS reset (Tailwind's Preflight, MUI's
`CssBaseline`), and both offer a complete styling idiom.

The concern raised was that leaving both installed without a rule produces an
inconsistent UI later, and that removing Tailwind gets expensive once anything
depends on it.

## Decision

**Both stay.** Reviewed separately on Brian's instruction and found not to be a
problem in practice. Tailwind is not removed.

The rule that keeps it from becoming ambiguous:

- **Material UI is the component baseline.** Anything that is a component —
  buttons, inputs, dialogs, tables, navigation — is MUI, themed through
  `src/theme.ts`. Do not hand-roll a component in Tailwind that MUI provides.
- **Tailwind is available for layout and one-off utility styling** where reaching
  for `sx` would be more verbose than useful.
- Do not style the _same element_ with both. Pick one per element.

## Evidence

The two resets coexist without visible breakage. `CssBaseline` is applied inside
`AppRouterCacheProvider` with `enableCssLayer: true`, which places MUI's styles
in a CSS layer so plain-CSS and utility rules win predictably over MUI's
defaults rather than fighting specificity. The rendered pages — `/`, `/login`,
`/dashboard` — were checked in a browser and in the production container with
both resets active.

## Consequences

- Removing Tailwind later is no longer a clean deletion. That is accepted.
- If the two idioms do start producing inconsistency, that is grounds for a new
  ADR superseding this one — not for quietly reversing it.
