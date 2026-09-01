# Handoff — M-ONBOARDING-AND-INFORMATION-COMPLETION

For the next `/mission-intake 7` session. Everything durable is in this
directory; this file records only what a fresh session cannot infer from it.

## Two environment facts that will otherwise cost you turns

1. **This worktree is not under `.claude/`.** It lives at
   `~/Documents/Lancers/Prod_DB_Push/lancers-worktrees/intake-M-ONBOARDING-AND-INFORMATION-COMPLETION`,
   because `.claude/settings.json` carries `Edit(./.claude/**)` in its deny
   list, which blocks every write into a worktree placed under
   `.claude/worktrees/`. Brian declined to change that rule, correctly — it
   protects the harness config. Put future intake worktrees here too.
2. **`node_modules` in this worktree is a symlink** to the main checkout's, so
   `npm run intake -- ...` works normally from here. Without it Node cannot
   resolve the CLI's imports from this path. It is gitignored. If it is missing,
   either recreate it or run
   `node <main-checkout>/scripts/intake/cli.mjs <command>` from this directory.

## Where this stands

Stage `workflows`. The boundary, the overview and the twelve-workflow inventory
are approved with Brian's exact words in `state.json`; both coverage files and
the mockup hub are generated and consistent. `item-and-ask-inventory.md` is
approved and is what the workflow specs must cite rather than re-decide.

No workflow has been started. `W1` is next.

## What Brian settled that the briefs do not say

The controlling briefs describe a club that does not quite exist. Read
`item-and-ask-inventory.md` before any workflow spec, because it corrects them:

- **Seven items are operator ticks, not player claims** — subs invoiced, subs
  paid, kit, squad photo and comms group (twice over). They ride Mission 5's
  roster board, which already edits in the cell; they do not need a surface.
- **Comms group cannot be derived.** Meta's API cannot enumerate an existing
  personal-account Community, so group membership is hand-tracked in two
  columns: assigned, then actually in.
- **BPS left the checklist** for a yes/no column on the roster, added by this
  mission.
- **There is no flagged/unflagged distinction** any more; it superseded Task 10
  R3-G's display-flag half. Nothing gates is untouched.
- **Hudl** is invited-then-accepted, email-invite method assumed.
- **First name, last name and mobile are required**, superseding the
  2026-08-26 brief note that last name was not.

## What is owed and unwritten

- The **BUCS Play instruction copy** and the **Hudl instruction copy**. Task 10
  defers both to Task 11, which is this mission. Nobody has drafted either.
- Consent wording remains Clint's, rendered from a versioned slot. Build and
  walk with a placeholder in a real slot; that is not a blocker.

## Open, and deliberately not assigned

- **Task 11's M5, active-membership maintenance**, is excluded from this mission
  because onboarding ends at activation — and no other mission has claimed it.
  It is defined in Task 11 and homeless. Raise it with Brian; do not file it
  somewhere to make a validator happy.
- **Where the season comes from.** The import inherits the roster's current
  season and never creates one. Season creation is a later mission's and does
  not exist anywhere yet, so a local walk needs a seeded season.

## Before closeout

`state.json.amendment_plan` holds four proposed append-only edits — the flag
supersession, the coach welcome flow leaving portfolio row 7, BPS leaving the
checklist, and the photo release becoming seasonal. **Show Brian the whole batch
before editing any record**, then refetch each target and record the proof.

Pages published during intake, for context rather than authority: the boundary,
the overview, the inventory with its coverage map, and the item-and-ask
inventory. They are projections of this ledger; the ledger governs.
