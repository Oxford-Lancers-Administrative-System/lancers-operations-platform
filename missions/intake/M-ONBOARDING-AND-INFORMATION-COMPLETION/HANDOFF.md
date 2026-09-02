# Handoff — M-ONBOARDING-AND-INFORMATION-COMPLETION

For the next `/mission-intake 7` session. Everything durable is in this
directory; this file records only what a fresh session cannot infer from it.

**Start at W4.** W1, W2 and W3 are `done` with Brian's exact words in
`state.json`. Brian ended the previous session there: _"I want the next one to
pick up at W4. This agent has run long enough."_

```bash
cd ~/Documents/Lancers/Prod_DB_Push/lancers-worktrees/intake-M-ONBOARDING-AND-INFORMATION-COMPLETION
npm run intake -- status M-ONBOARDING-AND-INFORMATION-COMPLETION
```

## Environment facts that will otherwise cost you turns

1. **This worktree is not under `.claude/`.** `.claude/settings.json` denies
   `Edit(./.claude/**)`, which blocks every write into a worktree placed there.
   Brian declined to change that rule, correctly. Put future intake worktrees
   beside this one.
2. **`node_modules` here is a real install, not a symlink.** It was a symlink to
   the main checkout, which the intake CLI tolerated but **Turbopack refuses** —
   `Symlink [project]/node_modules is invalid, it points out of the filesystem
root` — so `npm run dev:slot` died on it. If you recreate this worktree, run
   `npm ci` in it rather than linking.
3. **No runtime is held.** The previous session released its lease. Acquire one
   when you need to shoot:
   ```bash
   node scripts/local-supabase-coordinator.mjs acquire-mission M-ONBOARDING-AND-INFORMATION-COMPLETION \
     --base-commit 332bc6b3ba3028f1b79d99fc59dc1417791c2d81 --migration-head 27
   npm run db:start && npm run dev:slot
   ```
4. **Serve the review pages over HTTP.** The Chrome extension cannot load
   `file://`: `python3 -m http.server 4177 --bind 127.0.0.1` from this directory.

## How the workflow loop actually runs, learned the hard way

- **Look at the rendered PNG of every screen before showing Brian anything.**
  Every defect found in this session was found that way; none was found by
  reading the code that produced it. Caught: navigation reading _Events_ on a
  roster workflow; a totals strip saying `6 New · 0 Refused` above a table with
  two refusals; a card explaining what an import can never do to an _event_; a
  heading set before an upload and overwritten by React; cards built by sibling
  position against elements that had already moved; a page heading carrying a
  different person's name than the card beneath it.
- **Never filter shoot output.** A `| grep -E "Error|could not"` swallowed both
  the output and the failure, and two screens were reported as reshot when they
  were sixteen minutes stale. Run the shoot plainly and read all of it.
- **`must()` throwing is the point.** It refused a screen that pretended an
  alert existed. Let it fail rather than widening it.
- **Do not build another workflow's surface.** W2 drafted a "What the club has
  said" card before someone noticed the per-player activity log is **W6's** —
  `S32`, `T10-activity-log`, `PR7-activity-log`, `OD7-log-by-section`. Check
  `decision_coverage` for the owner before drawing anything.
- **Brian's standing instructions, 2026-09-01:** _"So long as we're not
  inventing new UX elements here"_ and _"We really shouldn't change anything if
  we don't have to."_ Rewrite shipped text; do not add elements.
- **Seed the real thing rather than proposing over a contradiction.** W3's first
  draft put a flipped recruit onto a long-seeded player's record and argued with
  itself in four places. Seeding one and photographing it removed all four. The
  SQL is in `evidence/W3-local-walk-data.md` and must be re-run after any
  `db:reset` before `W3-01` can be reshot.

## W4 — what you are walking into

**The mission's largest workflow: 22 owned decisions, 4 cited.** It is the form
itself, and the boundary names defining it "a principal job of the mission".

- `item-and-ask-inventory.md` is **approved** and already fixes the form's
  content and order — fifteen numbered asks, consent first. **Cite it; do not
  re-decide it.**
- Consent is step one and one-way on the player's side. The form _is_ the
  consent board.
- The signed link is Mission 6's substrate extended here (`T11-A3`). No player
  logins, ever.
- Owns `M2` (the welcome), `T11-one-request` (one open ask, ever), `T11-states`
  (invited → submitted → corrected → already-complete → expired → error), and
  `R4-P` (a minimal checklist at the top, then the form).
- **A flipped recruit arrives pre-filled and skips consent** — their row already
  exists for this season. W3 settled that; W4 has to render it.
- Nearest implemented analogues for the player-facing side: the shipped RSVP
  landing pages (LAN-79) and Mission 6's sign-up form (LAN-202). **Check whether
  LAN-202's code is in the baseline before assuming it is** — it was marked Done
  after `332bc6b` was cut.

## Owed, and still unwritten

- **BUCS Play instruction copy** and **Hudl instruction copy.** Task 10 defers
  both to Task 11, which is this mission. Nobody has drafted either. They block
  no build and no walk; they block a real send.
- **Consent wording** remains Clint's, from a versioned slot. Build and walk with
  a placeholder in a real slot.

## Carried to W12, not decided yet

- **Quiet hours are not a thing.** Brian, 2026-09-02, in passing while looking
  at the messaging table. `T11-suppression` names quiet hours among its
  suppression rules; that half of it is out. He asked to capture it properly at
  W12 rather than then, so this line exists only so W12 does not re-introduce it.
- **The recruit ladder is two columns, not a table.** `messaging_schedules` is
  keyed by `event_type` — practice, game, social — and Mission 6 added
  `recruit_invitation_lead_days` and `recruit_follow_up_cadence_hours` to it,
  null on all five rows. Onboarding's cadence fits that grain even less than
  recruitment's does. **W12's main decision.**

## Open, and deliberately not assigned

- **Where the season comes from.** The import inherits the roster's current
  season and never creates one. Season creation is Mission 11's and exists
  nowhere; a local walk needs a seeded season.
- **`membership_entry` stays `('new','returning')`.** Locked at the
  recommendation, but Brian never addressed it in his own words and the `W3-01`
  photograph argues against it: Entry reads `New`, so a flipped recruit is
  indistinguishable from a hand-added player on the surface an operator works
  from. **First thing to put back to him if it bites.** See `acceptance/W3.md`.

**Task 11's M5, active-membership maintenance, is closed and is not a gap.**
Brian, 2026-09-02: it is day-to-day club operation, Clint handles it, and it
needs no mission and no record. Do not re-raise it.

## Two things that must happen before Stage 5

1. **Split out the `scripts/intake/lib/hub.mjs` commit** (`8fd2d20`, "Link the
   rendered specification from the hub, not the markdown"). The intake PR carries
   only `missions/intake/**` and `missions/packets/**`; that change is shared
   harness tooling and needs its own issue and its own pull request. Prove the
   paths with `npm run intake -- pr-paths <mission-id> --diff main`.
2. **Show Brian the whole amendment batch before editing any record.**
   `state.json.amendment_plan` holds four proposed append-only edits — the flag
   supersession, the coach welcome flow leaving portfolio row 7, BPS leaving the
   checklist, and the photo release becoming seasonal. Then refetch each target
   and record the proof.

## Generated files — never hand-edit

`mockups/index.html` (`npm run intake -- hub --write`), `decision-coverage.md`,
`subject-coverage.md`, `specifications.html` and `workflows/*.html`
(`node missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION/build-specifications.mjs`),
and the review pages (`mockups/build-pages.mjs`, after
`mockups/build-proposals.mjs`). `npm run intake -- check` fails when the hub
drifts.

## Do not

Merge, un-draft, deploy, migrate hosted Supabase, edit Notion without Brian's
approval of the exact text, record an approval he has not given in his own
words, or open the PR before Stage 5.
