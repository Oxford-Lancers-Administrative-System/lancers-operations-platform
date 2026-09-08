# Design mockup review — LAN-225

Generated evidence for the mockup on `chore/lan-225-design-mockup`.

1. With the issue's slot held and the app up (`npm run db:acquire -- LAN-225`,
   `db:start`, `db:reset`, `npm run dev:slot`), run from the worktree root:
   `node docs/ux/review/design-mockup-2026-09/capture.mjs` — signs in through
   the real login and writes `screens/*.png` and `manifest.json` at 1440×900
   and measured 375×812, with per-route timeouts.
2. `node docs/ux/review/design-mockup-2026-09/build-index.mjs` writes
   `index.html`, pairing each proposed capture with the audit's current
   capture (`../design-audit-2026-09/screens/`), labelled per
   `docs/ux/mockup-standards.md`.
3. `npm run visual:preflight -- /design-preview /design-preview/roster …` for
   the readiness evidence, then `visual:start` and `db:review-ready`.
