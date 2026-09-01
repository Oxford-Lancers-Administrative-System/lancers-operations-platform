# Handoff — M-RECRUITMENT intake

> **UPDATE, 2026-08-31, later the same day.** The two defects this file was
> written about are **fixed and verified**, and W1 has been rebuilt with Brian
> and re-photographed. Everything below is retained because the reasoning still
> governs; only the "fix this first" instructions are discharged.
>
> - `mockups/src/_prelude.js` helpers now **throw** (`must()`), so a proposal
>   that cannot apply fails the shoot instead of producing a confident-looking
>   screen. `rebuildCard` replaces rows **before** it touches the header.
> - `setRecruitCards()` rebuilds the **phone** card list. Both renderings are
>   always in the DOM (`display:{xs,md}` hides, it does not unmount), so a board
>   proposal now rewrites the table and the cards from one dataset. The old
>   phone shots were the shipped roster's 42 players under a recruitment
>   heading; that class of error is closed.
> - Navigation is fixed and **asserted**: `selectRecruitmentNav()` throws unless
>   exactly one item ends up selected. Recruitment is a **top-level destination
>   under Roster** at `/operate/recruitment` — Brian, 2026-08-31 — not an
>   Administration entry.
> - Transitions are disabled before capture. The first rebuilt shots caught MUI
>   mid-fade and showed two selected destinations while the DOM had one.
> - **W1 is no longer stale.** W2-W14 still are. Brian goes one workflow at a
>   time; do not sweep.

Written 2026-08-31 when Brian stopped the session. **Read this before you touch
anything.** It replaces both earlier handoffs of the same day.

> **The short version.** Stage 0, 1 and 2 are closed and sound. **Stage 3 is not
> trustworthy and all fourteen workflows are stale.** A sweep was run, it fixed
> some real faults, and it shipped a new one it did not catch. Brian has
> abandoned the sweep approach: _"We're just going to go through the workflows.
> I'm just going to fix this one workflow at a time."_ Do that. Do not run
> another sweep.
>
> **Nothing in Stage 3 is approved.** Do not record an approval Brian has not
> given in his own words.

## Where the ledger is

```bash
cd .claude/worktrees/intake-M-RECRUITMENT   # branch intake/M-RECRUITMENT
npm run intake -- status M-RECRUITMENT
```

- Stage `workflows`. Baseline `main@e669331d96fb949a3c29d7475842a6414cfe9e57`.
- Ledger version 3. `npm run intake -- check` is consistent and both coverage
  validators pass. **That is a statement about structure, not about quality.**
- **Approvals: boundary, overview, inventory. Nothing else.**
- No runtime is held. Acquire one when you need it (see the bottom of this file).

## The defect that stopped the session — fix this first

`mockups/src/_prelude.js` has three helpers that **silently do nothing** when
their target is not shaped the way they assume:

| Helper                | Silently no-ops when                                  |
| --------------------- | ----------------------------------------------------- |
| `rebuildCard`         | the card has no `[data-testid="record-row"]` children |
| `setPersonRows`       | same                                                  |
| `replaceSummaryStrip` | the strip is not found                                |

`rebuildCard` renames the card's header and stamps `PROPOSED — this mission` on
it **before** it tries to replace the rows. So when the replacement fails, the
card ends up with a recruitment heading, a proposed flag, and the player
record's original content still inside it.

**Confirmed on `W2-01`**, which is the first screen Brian opened:

- **"WHAT WE HAVE SAID"** — heading renamed, but the card still holds the player
  record's sixty-row attendance table, headed _"7 of 7 mandatory · 100% · 12
  attendants not recorded"_.
- **"NOTES"** — heading renamed, but the card still holds the player's seasons
  content: _"2025-26 / Blue 44"_.
- **"STATUS HISTORY"** — never touched by the proposal at all, so it shows
  _"Created as onboarding… Onboarding → Active"_, which is membership history a
  recruit cannot have.
- The left navigation still shows **Roster** selected and there is no Recruits
  item; the button at the foot still reads **BACK TO ROSTER**. The prelude has
  `selectRecruitsNav()` for exactly this and `W2-01` never calls it.

This is why Brian asked why W2 shows the roster. It does show the roster.

**How many other screens this affects is unknown — it was not audited.** Assume
every screen using `rebuildCard`, `setPersonRows` or `replaceSummaryStrip` is
suspect until you have looked at its rendered image.

**The fix that makes this class of error impossible:** make these helpers
**throw** rather than return, exactly as `npm run intake -- edit` refuses a
zero-match edit. A proposal that cannot apply must fail the shoot, not produce a
confident-looking screen. `rebuildCard` must also not rename a header or add the
proposed flag until the row replacement has succeeded.

## The second defect — the mockups do not show a recruits section

Brian, at the stop: _"You completely destroyed the recruits page. None of these
pages have a recruits page anymore. There's supposed to be a fucking recruits
page."_ And when the last session answered that nothing had been deleted:
_"Yeah, no shit, because that's what we're fucking creating here."_

He is right, and the deletion question is beside the point. **A recruits section
is what this mission exists to build, and the mockups are supposed to depict
it.** On 33 of 37 screens they do not. `selectRecruitsNav()` is called by four
screens only — `W1-01`, `W1-02`, `W1-03`, `W13-01`. Everywhere else the left
navigation is whatever shipped page was photographed, with **Roster** or
**People** or **Messaging schedule** selected and no Recruits item at all.

That is why `W2` reads as the roster: it _is_ the roster shell with its
navigation, its selected state and its `BACK TO ROSTER` button untouched, and a
few cards swapped underneath. `W10` reads as the messaging schedule for the same
reason.

It is the same root cause as the card defect above: **a proposal rewrites the
content and leaves the shell around it alone.** Navigation, selected state,
breadcrumbs, headings and the button at the foot of the page all belong to the
surface, and none of them says "recruits".

**What has to be true for a screen to be finished:** if its proposed route is
under `/operate/recruits`, the screen shows the Recruits item in the
Administration navigation, selected, and every other affordance on the page
points inside recruitment. That covers `W1`, `W2`, `W6`, `W8`, `W9`, `W13`,
`W14`, and the recruitment administration screens under `W4` and `W10`. Only
`W5`, `W11` and `W12` keep another section's navigation, because they genuinely
happen on the attendance sheet and on the event.

## Why it got through, so you do not repeat it

The last session verified **its own mechanism** and not the **screens**. It
checked that every numbered marker rendered and that no frame printed a false
route — both true — and reported the sweep as done without opening W2's
rendered image. That is the same error the earlier handoff had already recorded
in different clothes: written from the shape of the code rather than from the
screen.

**Look at the rendered PNG of every screen you touch, before you show Brian
anything.** `missions/intake/M-RECRUITMENT/mockups/shots/<id>-proposed-desktop.png`.

## What the sweep did fix, and what is worth keeping

These are real and were verified; do not redo them.

1. **Frames no longer lie.** Eighteen of thirty-six frames used to print a route
   that does not exist on `main` — `/operate/recruits`,
   `/operate/recruits/review`, `/operate/admin/recruitment` — above a photograph
   of a different page, all calling themselves `modified`. `build-pages.mjs` now
   derives every frame URL and disposition from `shots.json`, refuses to build a
   screen that has no shot, and states the provenance in the screen head where a
   proposed route does not exist.
2. **Pointing instead of narrating.** Brian, 2026-08-31: _"I don't care if it
   has extra, as long as it stays bounded and I can scroll. That's fine, but if
   there is something relevant, it needs to be pointed out. I don't want that
   through narration."_ `mark(node, n)` draws a numbered outline and nothing
   else; the prose for that number is delta _n_ in the screen head, outside the
   frame. Proposals place their regions above the page's first card.
3. **`W8-01` drives the real form.** Proposals are now async, so a screen can
   fill the shipped add-a-person form, press its own _Check for duplicates_, and
   photograph the real answer. This one was inspected in the browser and is
   good — it is the model for how a screen should be built.
4. **`W12-01` clones the attendance sheet's own group markup** rather than
   authoring a replacement, and was verified in the DOM: the recruits group is
   first. Worth checking visually, but the approach is right.
5. **One head SHA** across all 37 shots, and the legend renders as a list rather
   than a broken table.

## Brian's two decisions from this session — these stand

1. **`W3` folds into the doors and `W10`.** It keeps its specification, where
   the ladder and its invariants live, and draws no screens. Its three screens
   moved to `W10-03` (the templates), `W2-03` (one recruit's position in the
   ladder) and `W6-03` (the welcome held for want of opt-in evidence, because
   operator-add is the door with no natural opt-in). Recorded in
   `workflows/W3-say-yes-to-the-club.md`.
2. **Vocabulary: walk-up.** `WALK_UP_HEADLINE`, `WALK_UP_SUBMIT` and
   `WALK_UP_CHIP` in `src/app/operate/events/[id]/attendance/presentation.ts`
   are corrected by this mission. Recorded as locked in
   `workflows/W5-capture-a-walk-up-as-a-recruit.md`.

## How Brian wants this done now

One workflow at a time, start to finish, with him. Not a sweep. Build `W1`,
look at the rendered image yourself, show him, take his corrections, and do not
move to `W2` until he has approved `W1` in his own words.

## Restarting the runtime

```bash
node scripts/local-supabase-coordinator.mjs acquire-mission M-RECRUITMENT \
  --base-commit e669331d96fb949a3c29d7475842a6414cfe9e57 --migration-head 26
npm run db:start
npm run dev:slot                      # application on port 3101
# from this worktree, to attach it to the same stack:
node scripts/local-supabase-coordinator.mjs attach-mission M-RECRUITMENT \
  --token "$(node -e 'console.log(require("/Users/schuster/Documents/Lancers/Prod_DB_Push/lancers-operations-platform/.lancers-runtime/lease.json").token)')"
```

The review pages are static; serve `missions/intake/M-RECRUITMENT/mockups` on
any port to open them, because the Chrome extension cannot load `file://`.

## Do not

Merge, un-draft, deploy, migrate hosted Supabase, edit Notion without Brian's
approval of the exact text, record an approval he has not given, or open the PR
before Stage 5. The final PR carries exactly the `missions/intake/M-RECRUITMENT`
and `missions/packets/M-RECRUITMENT` trees — `scripts/intake` is out of scope,
which is why the capture tool was left alone.
