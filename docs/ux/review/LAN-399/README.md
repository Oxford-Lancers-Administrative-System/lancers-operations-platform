# LAN-399 — operator playbook, visual evidence

What is here, what it shows, and — the part that matters — what could not be
captured and why.

## What could not be captured

**Full-page screenshots of the eight pages through a real login were not
taken.** `npm run visual:preflight` needs a local Supabase slot, and both were
held by other work for the whole of this task: `primary` by
`../lan-401-vocab` and `overflow` by `../lan-394-safety`'s review environment.
The pages are gated on `resolveOperatorAccess()`, so there is no way to render
one in a browser without a database behind it, and taking a slot from either
worktree was not an option.

So the captures below are of the part of the work that can be photographed
without one: the eight committed drawings themselves, and the container the
pages put them in, at both widths. Everything else the pages do — the gate, the
steps, the rules, the where-to-look links, the generated seat table — is covered
by the tests rather than by a screenshot:

- `src/app/operate/admin/guide/playbook-screens.test.tsx` renders every page
  through the real gate, seat by seat, and asserts each band is on it;
- `src/app/operate/admin/guide/_playbook/content.test.ts` asserts every screen
  name and control label the copy quotes exists in `src/`;
- `src/app/operate/admin/guide/_playbook/flowchart.test.ts` asserts each
  committed SVG is exactly what its spec renders.

**Somebody with a slot should run this before the visual approval:**

```
npm run visual:preflight -- /operate/admin/guide/workflows /operate/admin/guide/recruitment /operate/admin/guide/onboarding /operate/admin/guide/events /operate/admin/guide/messaging /operate/admin/guide/roster /operate/admin/guide/people-and-data /operate/admin/guide/operators-and-roles /operate/admin/guide/reports
```

signed in as one of the core four — President, Vice-President, Secretary or
General Manager. The IT Officer is refused, deliberately.

## The eight drawings

One per workflow, as committed to `public/guide/<slug>.svg` and served to the
page through an ordinary `<img>`. Captured at their own intrinsic size, at 2×.

| File                                | Page                |
| ----------------------------------- | ------------------- |
| `flowchart-recruitment.png`         | Recruitment         |
| `flowchart-onboarding.png`          | Onboarding          |
| `flowchart-events.png`              | Events              |
| `flowchart-messaging.png`           | Messaging           |
| `flowchart-roster.png`              | Roster              |
| `flowchart-people-and-data.png`     | People and data     |
| `flowchart-operators-and-roles.png` | Operators and roles |
| `flowchart-reports.png`             | Reports             |

Six shapes, one legend on every drawing: a state, something the operator does,
something the app does, a decision, a message leaving the club, and an end.
Every colour is a token from `src/theme-tokens.ts`; none was invented for the
drawings, and `flowchart.test.ts` fails on a hex that is not one.

## The container, at both widths

`container-events-desktop-1440.png`, `container-events-phone-375.png`,
`container-messaging-desktop-1440.png`, `container-messaging-phone-375.png`.

The card, the frame and the drawing, reproduced with the same geometry the page
uses, at 1440px and at 375px. The phone captures are the point: the drawing
keeps its own width and scrolls sideways **inside its box**, and the page itself
does not scroll sideways at 375px. That was measured, not eyeballed —
`document.documentElement.scrollWidth > window.innerWidth` was `false` at both
widths for both pages.

These two are a harness, not the running application: the surrounding page
chrome, the operator shell and the rest of the bands are not in them.
