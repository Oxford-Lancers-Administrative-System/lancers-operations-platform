# Handoff — M-RECRUITMENT intake

Written 2026-08-31 after the Stage 3 sweep. It replaces the earlier handoff of
the same day, whose repairs are done.

> **The short version.** Stage 0, 1 and 2 are closed and sound. Stage 3's
> screens have been rebuilt from the ground up and re-shot at one head SHA, and
> the three mechanical faults that produced every complaint at the stop are
> fixed. **Nothing in Stage 3 is approved**, and no approval should be recorded
> that Brian has not given in his own words. The next action is to open
> `mockups/index.html` with him and walk `W1`.

## Where the ledger is

```bash
cd .claude/worktrees/intake-M-RECRUITMENT   # branch intake/M-RECRUITMENT
npm run intake -- status M-RECRUITMENT
```

- Stage `workflows`. Baseline `main@e669331d96fb949a3c29d7475842a6414cfe9e57`.
- Ledger version 3. `npm run intake -- check` is consistent and both coverage
  validators pass.
- **Approvals: boundary, overview, inventory. Nothing else.**
- Local runtime: lease `mission-m-recruitment-1`, application on port 3101.
  Release it with `npm run db:release` when you are not using it. The lease is
  held by the main checkout and this worktree is attached to it.

## What the sweep found, and what it changed

An audit of all 36 screens against the running application found three faults.
Each was one defect repeated, not a series of judgement calls.

### 1. The URL bar lied on eighteen of thirty-six frames

`/operate/recruits`, `/operate/recruits/review` and `/operate/admin/recruitment`
do not exist on `main` — `src/app/operate` has no `recruits` directory — yet
those routes were printed in the browser chrome above a photograph of a
different page, and all eighteen declared themselves `modified`.

| The frame said               | It was a photograph of                    |
| ---------------------------- | ----------------------------------------- |
| `/operate/recruits`          | `/operate/roster`                         |
| `/operate/recruits/<id>`     | `/operate/roster/<id>`, the player record |
| `/operate/admin/recruitment` | `/operate/admin/messaging`                |
| `/operate/recruits/review`   | `/operate/people/<id>/merge`              |
| `/operate/recruits/new`      | `/operate/people/new`                     |

That is the whole of _"why the fuck are we on the messaging page"_ and _"that's
not where it belongs."_ It was not four bad shell choices; it was one technique
applied eighteen times.

**Fixed.** `build-pages.mjs` now derives every frame's URL and every screen's
disposition from `shots.json` rather than taking an assertion. Where a proposed
route does not exist, the screen head says so in words and the frame shows what
was really photographed. The build refuses a screen that has no shot.

### 2. Half the screens were a five-thousand-pixel page in a 520px window

`shoot.mjs` captures `fullPage: true`; the review page renders the result in
`max-height: 520px; overflow: auto` at full width. Fourteen screens were 2,800
to 5,700px tall. On `W10-01` the QR administration was built and appended at the
bottom of a 3,557px image, so what was visible was the top of an untouched
messaging page — exactly _"you just screenshotted it."_ The correlation was
near-perfect: every workflow Brian complained about was a tall screen, and every
one he did not was 900–1,500px.

**Fixed, and deliberately not by cropping.** Brian, 2026-08-31: _"I don't care
if it has extra, as long as it stays bounded and I can scroll. That's fine, but
if there is something relevant, it needs to be pointed out. I don't want that
through narration."_ So the shots stay whole pages in a bounded scrolling box,
every proposal places its regions **above the page's first card**, and each
changed region carries a numbered outline.

### 3. Review commentary was painted inside the application frame

`proposedBlock()` inserted a teal or amber prose card into the live DOM, which
is the narration habit in a new costume, and `docs/ux/mockup-standards.md` puts
that material in the screen head.

**Fixed.** `mark(node, n)` draws a numbered outline and nothing else. The prose
for number _n_ is delta _n_ in the screen head, outside the frame. Every screen's
marker count now matches its delta count; this was verified in the live DOM, not
assumed.

## What changed per workflow

- **`W3` folds into the doors and `W10`** — Brian's decision. It keeps its
  specification, which is where the ladder and its invariants are defined, and
  draws no screens. Its three screens moved to where a reviewer can see them:
  the templates to `W10-03`, the ladder on a recruit to `W2-03`, the held
  welcome to `W6-03` (operator-add is the door with no natural opt-in).
- **`W8` is re-grounded on the shipped duplicate check.** _"That's not how the
  duplicate checks get done."_ Correct: `create-person-form.tsx` is a
  check-then-create, and `W8-01` now drives that real form — types a name and a
  mobile, presses the application's own _Check for duplicates_, and photographs
  its own answer. Only the parked queue is drawn, because only the queue is new.
- **`W10` has its QR screen**, `W10-02`, as its own screen rather than buried.
- **`W11` points at machinery that already ships.** `audience-builder.tsx` has a
  Capacity filter whose `Recruits` option appears on a Recruitment event and
  nowhere else — D46, running code. The first draft asserted an invented table
  instead. `W11-01` is now shot on `?step=audience` of the seeded draft
  recruitment event with that control set to `Recruits`. `W11-02`, which was
  captured and then never put on the page, is on it.
- **`W12` stops reinventing the sheet.** The sheet already groups, with a
  toggle, label, detail, count chip and row list. The proposal clones that group,
  renames it `Recruits`, fills it with cloned real rows and moves it to the
  front. Verified first in the DOM.
- **Vocabulary settled: walk-up.** Three shipped strings in
  `presentation.ts` change; recorded as a locked decision in `W5`.

## Bookkeeping that was also wrong

- Nine screens had no mention in any specification. All are now accounted for.
- `W10-02` was promised by its specification and never shot. It exists.
- `W11-02` had no proposed side and was not on its review page. Both fixed.
- Four specifications named a route that was not what was photographed —
  `W2`, `W9`, `W3-01`, `W3-02`. All corrected to say what was really shot.
- Shots spanned six head SHAs. All 37 are now at one.
- `/a/[token]` **does** ship at the baseline. `W4` and `W7` are drawn for want
  of a seeded token, not for want of a route; if a token becomes available they
  should be re-shot as photographs.

## What is still open, and still Brian's

1. **Every Stage 3 approval.** No specification, mockup or acceptance verdict
   has been approved. Walk `W1` first; `Wn` completes before `Wn+1` is approved.
2. **Where "how a message gets sent" belongs.** `W10` proposes
   `/operate/admin/recruitment` as a sibling of the shipped messaging schedule,
   with Mission 4 owning the scheduler and recruitment declaring a cycle. That is
   a proposal, and it is the boundary Brian said he was least sure of.
3. The `proposed for owner approval` rows in each specification's decision table.

## Do not

Merge, un-draft, deploy, migrate hosted Supabase, edit Notion without Brian's
approval of the exact text, record an approval he has not given, or open the PR
before Stage 5. The final PR carries exactly the `missions/intake/M-RECRUITMENT`
and `missions/packets/M-RECRUITMENT` trees and nothing else — `scripts/intake`
is out of scope, which is why the capture tool was left alone and the review
page does the work.
