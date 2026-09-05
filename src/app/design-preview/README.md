# Design preview — LAN-225

**Branch:** `chore/lan-225-design-mockup`, cut from `main` at `73577d6`.
**Never merged, and never to be merged.** The implementation mission takes
`src/theme.ts`, `src/components/` and `docs/ux/design-system.md` from it.

**Run it:** the ordinary review environment (`npm run db:acquire -- LAN-225`,
`db:start`, `visual:start`), sign in with the fixed local review account, open
`/design-preview`.

## What this is

The real application on the club's tokens, behind a session-gated route, on
the deterministic seed. Each screen reads through the same `gateShellPage`
and the same services as the page it mirrors, then renders with the kit and
the theme instead of the page's own local components. Reads are real; writes
are drawn, not wired — except the roster board, which is the real component
inside the proposed shell.

| Route                              | Mirrors                                    | Screen |
| ---------------------------------- | ------------------------------------------ | ------ |
| `/design-preview`                  | index, decisions taken                     | —      |
| `/design-preview/roster`           | `/operate/roster` (tokens only)            | S1     |
| `/design-preview/player`           | `/operate/roster/[membershipId]`           | S2     |
| `/design-preview/event`            | `/operate/events/[id]` (approved)          | S3     |
| `/design-preview/event-new`        | `/operate/events/new`                      | S4     |
| `/design-preview/rsvp`             | `/rsvp/[token]` (UX-60)                    | S5     |
| `/design-preview/rsvp-unusable`    | `/rsvp/[token]` not-found (UX-63/64/65)    | S5     |
| `/design-preview/report`           | `/operate/report`                          | S6     |
| `/design-preview/login`            | `/login`                                   | S7     |
| `/design-preview/operators`        | `/operate/admin/operators`                 | S8     |
| `/design-preview/operator`         | `/operate/admin/operators/[operatorId]`    | S8     |
| `/design-preview/player-home`      | `/me/[token]`                              | S9     |
| `/design-preview/player-details`   | `/me/[token]/details` (step 1)             | S10    |
| `/design-preview/player-agreement` | `/me/[token]/details?step=code_of_conduct` | S10b   |
| `/design-preview/answer`           | `/a/[token]` (a Yes already taken)         | S11    |
| `/design-preview/kit`              | every kit component once                   | K      |

`picks.ts` chooses which seeded record each screen shows, deterministically,
so `visual:preflight` can be pointed at fixed paths on any reseed.

The four player screens read their subject **by person id through the operator
tier**, never by token: no token is minted to render them, none is in the
address bar, and none can end up in a capture. The subject is the hardest
honest case rather than the tidiest — the active player with the most
invitations still needing an answer, which is the same player the current-side
captures were taken for, so every pair on the review page is the same person
and the same events.

## What this is not

- **Not authority.** `docs/ux/design-system.md` is what the implementation
  mission is held to; where this route and that document disagree, the
  document wins.
- **Not a product change.** Every screen shows what its counterpart shows on
  `main`. The `product`-class items Brian took (H1, A6, E9, B2, B3) are listed
  as deltas on the review page, never as unlabelled differences.
- **Not wired.** Buttons and fields are drawn to be judged, not pressed. The
  one exception is S1, the real board.
- **Not the crest.** `public/brand/crest.svg` is a labelled placeholder until
  the Figma export lands.
- **Not a fix for the findings it does not touch.** The nine player-facing
  routes are audited in
  `docs/ux/review/design-mockup-2026-09/player-surfaces.md`; six of them carry
  findings and no built target, and the three `product`-class items there
  (P15, P16, P21 — including the unbounded invitation list) are Brian's and are
  left exactly as they are on `main`.
