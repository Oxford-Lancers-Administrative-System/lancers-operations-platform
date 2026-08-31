# Handoff — M-RECRUITMENT intake

Written 2026-08-31 when Brian stopped the session. **Read this before you touch
anything.** It replaces the 2026-08-28 handoff, whose resume is done.

> **The short version.** Stage 2 is closed and sound. Stage 3 is not: the
> specifications are usable but carry errors, and **most of the mockups are
> wrong and should be treated as suspect until re-grounded.** Brian's words at
> the stop: _"This is horrendous. If you needed to know more information from me,
> you should have fucking asked before doing this, especially four times."_
> Nothing in Stage 3 is approved. Do not build on the mockups. Ask him first.

## Where the ledger actually is

```bash
cd .claude/worktrees/intake-M-RECRUITMENT   # branch intake/M-RECRUITMENT
npm run intake -- status M-RECRUITMENT
```

- Stage: `workflows`. Baseline `main@e669331d96fb949a3c29d7475842a6414cfe9e57`.
- Ledger version 3. `npm run intake -- check` is consistent; both coverage
  validators pass. That is a statement about structure, not about quality.
- **Approvals: boundary, overview, inventory. Nothing else.** No workflow has a
  spec approval, a mock approval or an acceptance verdict, and none should be
  recorded without Brian's own words.
- Local runtime: lease `mission-m-recruitment-1`, app on port 3101. Release it
  with `npm run db:release` if you are not using it.

## What is solid, and worth keeping

1. **Stage 0, 1 and 2.** The 44-item boundary, the overview with its eight
   invariants, and the frozen fourteen-workflow inventory all carry Brian's
   exact words. 89 controlling decisions across nine sources, 44 subject areas.
   Do not reopen these; amend only with his approval.
2. **The never-harsh amendment** (2026-08-31) and the nine decisions from his
   inventory review are recorded correctly in `01-overview.md`.
3. **One genuine finding, and it is load-bearing.**
   `src/lib/delivery/config.ts`: _"template is the only production shape."_
   Every business-initiated WhatsApp message must be a Meta-approved template;
   free text exists on the loopback test path alone, and only
   `event_invitation` is approved today. Brian confirmed the intent:
   _"We're sending WhatsApp template messages. We don't have the president
   sending them each individual messages… These should be sending automated
   templates."_ This kills any design where an operator types a message.
4. **The tooling works.** `mockups/build-proposals.mjs` assembles proposals from
   `mockups/src/_prelude.js` plus one body per screen; `mockups/build-pages.mjs`
   emits the review pages; the hub and coverage files are generated. The
   prelude's helpers for cloning real cards, rows and form fields are sound and
   worth reusing.

## The mistakes. Read these before writing a single screen

### 1. Choosing a shell because its name sounded right — four times

This is the root error and it was pointed out three times before it stopped.
Each time I grounded a workflow on whatever route had a similar-sounding name
rather than on where the work actually happens:

| Workflow            | Shell I used                 | Why it was wrong                                                                                                                                  |
| ------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `W9` follow-up      | `/operate/admin/follow-ups`  | Mission 4's chase queue for **members who owe the club an answer**. A recruit owes nothing. Brian: _"That's not even the right place."_           |
| `W2` recruit record | `/operate/people/[personId]` | Brian: _"It does not come from the people workflow."_ Corrected to the player record shell, which he accepted.                                    |
| `W3`, `W4`          | `/operate/admin/messaging`   | Mission 4's **per-event-type reminder cadence**. Nothing to do with recruitment sign-on. Brian: _"Message scheduling? Why the fuck is it there?"_ |
| `W8` duplicates     | `/operate/people/[id]/merge` | Brian: _"That's not where in the fucking workflow it belongs. That's not how the duplicate checks get done."_ **Still wrong. Not fixed.**         |

**What to do instead:** decide where a workflow lives from the workflow, and if
the answer is not obvious in the running app, **ask Brian**. Do not pick the
nearest route.

### 2. Narration instead of screens

The first full build appended cards of label/value rows _describing_ what a
screen would do, next to an untouched page. Brian: _"it didn't actually make the
fucking screens. It just showed what it wanted to do."_ These were swept, but
the habit reappeared as thin work elsewhere — see `W10` below.

**The correct technique**, and it does work: insert the proposal **into the real
DOM**. `fill()` real fields, `afterField()` to place a block between real
fields, `rebuildCard()`/`recordRow()` to replace a real card's rows with cloned
markup. `W5` and `W2` are the two examples worth copying.

### 3. Inventing product reality instead of checking or asking

- **The WhatsApp chat thread** in the first `W3-02` was invented. Brian:
  _"That's not what a WhatsApp page looks like… This is completely invented."_
  It was also unsendable under the template-only constraint, which I found only
  after drawing it twice.
- **A defect that did not exist.** `W5`'s spec claimed nothing tells the operator
  a walk-up creates a recruit. The shipped form says exactly that in an alert.
  Written from the shape of the code rather than from the screen. Struck in the
  spec, with the correction recorded — **check the other specs for the same
  class of error; they were written the same way.**

### 4. Not asking

Four rounds of rework, three of them avoidable. Brian invited questions
explicitly and I built instead. When the answer is not in the record, ask.

## Brian's per-workflow feedback at the stop, verbatim in substance

Treat every one of these as open. **None is fixed.**

- **`W3`** — _"the wrong fucking screen. It has nothing to do with the workflows.
  Why are we on the messaging page? How is it grounded in the rest of the app?
  Where the fuck is this supposed to be?"_ The unresolved design question
  underneath: `W3`'s actor is the recruit and their journey happens in WhatsApp,
  which the product does not render. Either it has almost no screens, or it
  folds into the doors plus `W10`, or there is a recruit-facing surface nobody
  has described yet. **Ask him.**
- **`W4`** — _"No explanation on how we got here. Is this automated? Does this
  get sent out? I don't know because it doesn't say anywhere."_ The form is
  drawn; how it reaches the recruit is not explained anywhere a reviewer can
  see it.
- **`W7`** — _"it's not clear to me how this page is supposed to be organized,
  where we get to this QR code, or how we explain where it happens."_ Where the
  QR lives, who mints it, how a recruit reaches the page — none of it is shown.
- **`W8`** — the merge screen is the wrong flow, and _"that's not how the
  duplicate checks get done. That's not where it happens."_
- **`W10`** — _"You just fucking didn't do W10… There's literally nothing here
  about the QR code. You just screenshotted it."_ One screen, and the QR
  administration the spec promises is absent.
- **`W11`** — _"none of the machinery to explain how we separate out recruitment
  recruits from non-recruits."_
- **`W12`** — _"I don't know why we're reinventing fucking UI. That's perfectly
  good. For a recruitment event, the recruits just need to go on top as their
  own category."_ The shipped attendance sheet is fine; recruits become a
  category at the top of it and nothing else changes.

## Questions Brian has not answered

He rejected the question set when he stopped the session, so these are still
open and they block real progress:

1. **What `W3` actually is** — an operator view only, folded into other
   workflows, or a recruit-facing surface we build.
2. **Where "how a message gets sent" belongs** — per recruit on their record, a
   recruitment settings page this mission builds, or both. It is emphatically
   **not** Mission 4's messaging schedule.
3. **Vocabulary: `walk-up` or `walk-on`.** The shipped button says _Add
   walk-up_, the page says _Add a walk-on_, the row chip says _Walk-on_, every
   brief says _walk-up_. Unresolved and recorded in `W5`'s spec.

## What is where

| Thing          | Path                                                               |
| -------------- | ------------------------------------------------------------------ |
| Stage files    | `00-boundary.md`, `01-overview.md`, `02-workflows.md`              |
| Specifications | `workflows/W1..W14-*.md` — usable, but see mistake 3               |
| Review pages   | `mockups/W1..W14-*.html`, generated by `build-pages.mjs`           |
| Screens        | `mockups/shots/` — 126 PNGs, and `shots.json` is the record        |
| Proposals      | `mockups/src/*.js` + `_prelude.js`, built by `build-proposals.mjs` |
| Index          | `mockups/index.html` — generated, never hand-edited                |
| Acceptance     | `acceptance/W*.md` — all `awaiting review`                         |

Reading companions (`.html` beside each stage file) are for Brian and are
regenerated from the markdown; the markdown is the record.

## What I would do first if I were you

1. **Do not defend the existing mockups.** Open the index with Brian, agree
   which screens survive, and mark the rest stale in `state.json` rather than
   silently rebuilding.
2. **Settle the three open questions above** before drawing anything.
3. **Re-ground `W8`, `W10`, `W11`, `W12` from the workflow**, not from a route
   that sounds right. `W12` in particular needs _less_ invention, not more.
4. **Re-read the specs for claims written from code rather than from screens.**
   At least one was false; assume there are others.

## Do not

Merge, un-draft, deploy, migrate hosted Supabase, edit Notion without Brian's
approval of the exact text, record an approval he has not given, or open the PR
before Stage 5. The final PR carries exactly `missions/intake/M-RECRUITMENT/**`
and `missions/packets/M-RECRUITMENT/**`.
