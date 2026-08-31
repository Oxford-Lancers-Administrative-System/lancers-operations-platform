# Handoff — M-RECRUITMENT intake

Written 2026-08-28 when Brian paused the intake. Read this, then run the CLI —
never infer position from a transcript.

> **Start here, with Brian, out loud.** His instruction at the pause: _"We should
> start by opening this exact file up and talking about it."_ So before you
> inventory anything or write a line: open `HANDOFF.html` on his machine
> (`open missions/intake/M-RECRUITMENT/HANDOFF.html`), walk him through where the
> intake is, what he already settled, and what the research found — and let him
> correct it. He resumes by talking, not by reading a status line.

## Where you are

```bash
git worktree add .claude/worktrees/intake-M-RECRUITMENT intake/M-RECRUITMENT
cd .claude/worktrees/intake-M-RECRUITMENT
npm run intake -- status M-RECRUITMENT
```

Expect: **stage `inventory`**, inventory not frozen. Branch
`intake/M-RECRUITMENT`, pushed. Baseline `main@e669331d96fb949a3c29d7475842a6414cfe9e57`
(rebased there on 2026-08-31 on Brian's word; Stages 0-1 were reconciled against
`c69d544` and keep those records).
Working tree was clean at handoff; there is no uncommitted scratch to reconcile.

**Resuming cold, from `/mission-intake 6`.** The ledger lives only on this
branch, so `npm run intake -- status` finds nothing from the `main` checkout —
enter the worktree first. On Brian's machine it is already registered:
`git worktree list` shows `intake-M-RECRUITMENT`. Anywhere else, the
`git worktree add` above creates it from the pushed branch.
**You do not need Notion to map the number.** The portfolio row for mission 6 is
quoted verbatim in `00-boundary.md` and pinned with its observed version in
`sources.md`. Refetch the portfolio only to check that the row has not drifted
since 2026-08-28 — not to find out what mission 6 is.

Portfolio mission **6 · Recruitment**, Portfolio v2 (approved 2026-08-26). Read
`SKILL.md` and `references/ported-intake-rules.md` in full before touching
anything, and read `00-boundary.md` and `01-overview.md` completely — they carry
Brian's own words and are the mission's authority, not a summary of it.

## What is done

- **Stage 0 — boundary: approved** 2026-08-28, _"You're approved"_.
- **Stage 1 — overview: approved** 2026-08-28, _"Close stage one."_
- **Stage 2 — in progress.** The observability research Brian commissioned is
  complete and committed at `evidence/2026-08-28-signal-observability.md`.
  Nothing else in Stage 2 has started.

## The thing that governs everything

Brian's direction of 2026-08-28: _"You own recruitment as a subject… You own the
subject, not merely the workflows that are mentioned."_ The portfolio row's
bullets are the **named minimum**. The boundary is the recruitment subject-matter
lifecycle under portfolio rule 1, and it is a **43-item inventory** in
`00-boundary.md`, each item marked `[row]`, `[subject]` or `[owner]`. Do not
narrow it back to the row.

## Decisions Brian settled during Stages 0 and 1

Each is recorded with his words in the ledger. None may be reopened without him.

1. **Recruits are never chased** — and _"a recruit gets exactly one message,
   ever"_ is **not** the rule; it was a gloss that forbade ordinary things. A
   recruit may receive the welcome, the community-group invite, the recruit-stage
   ask, **one invitation per event**, and any message a human sends by hand.
   Never a reminder, an escalation, or a collection cadence.
2. **The core four roles only** — President, Vice President, Secretary, General
   Manager. **No new capability is minted.** This narrows Task 09 D9 and leaves
   Mission 1's role catalogue untouched. Carve-out: a coach recording a walk-up
   is doing attendance, not recruitment, and never sees the board.
3. **Every walk-up is a recruit**, and walk-up capture stays on every event type
   for anyone taking attendance. This is why the off-ramps are load-bearing.
4. **The recruit status is one flat field of seven values** — `identified`,
   `engaged`, `committed`, `joined`, `declined`, `disengaged`, `void`. Not
   tiered; "on the board" is a display rule over this one field. `joined`
   replaces `converted`, `disengaged` replaces `lapsed`, `void` is new, and "did
   not show up" is deliberately **not** a value. Frozen-model change: new enum
   type plus data migration, blast radius named in `01-overview.md`.
5. **The board is the Roster board** — copy it where copying works, person
   details then recruitment details, one line per recruit. **Event columns
   append** at the right end, headed by a compact handle with the event name,
   showing invited / answered / attended. Clicking a row opens that recruit's own
   working page.
6. **The QR points at our own page on our own domain.**

## What the research found, and what it costs

`evidence/2026-08-28-signal-observability.md` is the record. The headline:

- **"Accepted the WhatsApp" is not observable.** Group and community membership
  is not exposed by the Cloud API at all. Brian named it as a known-good signal
  at Stage 1; it does not survive. **Tell him again if it resurfaces.**
- **This collapses the WhatsApp community-join door.** It cannot be a door the
  system watches; it is a link posted in the group landing on the QR page. Four
  doors are really three plus a place a link lives.
- **`read` and `sent` are already stored verbatim** in `delivery_callbacks` and
  mapped to nothing, because widening `delivery_outcome` is a frozen-model
  change. Using them is a model decision, not an integration.
- **No inbound message is captured anywhere** — the webhook parses only
  `statuses[]`. `rsvp_source = 'channel_reply'` is an enum value no code path has
  ever written.
- **Ten signals work today** with no new anything.

## What is next, in order

1. **Finish Stage 2's decision inventory.** Every controlling source's decisions,
   exclusions, handoffs, delegations and shared dependencies, into
   `state.json.decision_coverage`, each with exactly one reasoned disposition.
   Then `npm run intake -- coverage --write`. Never hand-maintain
   `decision-coverage.md`. Sources to inventory, at minimum: Task 09 (D1–D12 and
   its four 2026-08-25/26 amendments), the portfolio row, the Authority Manifest
   (R2, Scope 4, §6 gates, §8 exclusions, the 2026-08-26 owner amendment), Task
   04's welcome-flow residual (D-6), the approved `M-PEOPLE-AND-ROSTER` packet's
   seams, Mission 4's shipped chase machinery, and `main@c69d544`.
2. **Enumerate the recruit-stage field set.** Nobody has ever done it; Mission
   5's approved packet records it as an open unknown. Task 08 §4 references the
   8/5 staged fields — football background, experience, gear ownership.
3. **Draft `02-workflows.md`** and get Brian to freeze the numbered inventory.
   He has already asked where the doors get decided and been told: named at
   Stage 1, **counted here**, designed at Stage 3. Expect the QR door to be its
   own workflow because the actor is the recruit; the others are operator
   journeys. **The flip is late in the order by his instruction.**
4. **Stage 3**, workflow by workflow, with mockups. This changed at the
   2026-08-31 rebaseline: Mission 5 shipped, so `/operate/people`,
   `/operate/people/[personId]` and `/operate/roster` **exist on `main` and are
   photographed on both sides** with `npm run intake -- shoot`. `8a4239f` seeds
   two people onto the Recruit rung, so the recruit case renders. Only genuinely
   new recruitment surfaces are drawn, and only those carry
   `grounding: code-only`.

## Open decisions to carry to Brian

Listed in full at the end of `01-overview.md`. Four are settled and struck. The
live ones, with the recommendations already given to him:

| #   | Decision                                                                                                                         | Recommendation given                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1   | The recruit-stage ask's timing — rides the welcome (2026-08-26 record) or a day later as its own message (his later description) | A day later, its own message                |
| 2   | Two Notion wording corrections in `notion-corrections.md` — **drafted, not applied**                                             | Apply after his approval of that exact text |
| 4   | The unconverted recruit at a season boundary                                                                                     | —                                           |
| 5   | How flexible the recruitment cycle is                                                                                            | Decide against a Stage 3 drawing            |
| 6   | Whether a human touch is recorded                                                                                                | An operator records it by hand              |
| 7   | How a recruit comes off the board                                                                                                | Decide against a Stage 3 drawing            |
| 8   | The WhatsApp community-join door                                                                                                 | Research says it collapses into the QR door |
| 10  | Whether `void` is a status value or a separate marker                                                                            | A separate marker                           |
| 12  | The unique sign-up link for recording a walk-up                                                                                  | —                                           |
| 13  | How the flip is performed — his idea: the status change interrupts with "Should this person be added to onboarding? Yes / No"    | Deferred to Stage 3 by his instruction      |

## Two mechanical notes

- **The `.html` files beside each `.md` are reading companions for Brian**, not
  ledger records — he asks for stage files to be opened on his machine. They were
  generated by a throwaway markdown-to-HTML script in the session scratchpad,
  reusing the stylesheet from
  `missions/intake/M-PEOPLE-AND-ROSTER/01-overview.html`. That script is gone;
  regenerate them however you like, keep the same look, and keep the markdown as
  the record.
- **Every scripted replacement goes through**
  `npm run intake -- edit --file … --find-file … --replace-file … --expect n`.
  Prettier reflows list continuation lines after each edit, so re-read the exact
  bytes before composing the next `--find`.

## Do not

Merge, un-draft, deploy, migrate hosted Supabase, edit Notion without Brian's
approval of the exact text, or open the PR before Stage 5. The final PR carries
exactly `missions/intake/M-RECRUITMENT/**` and `missions/packets/M-RECRUITMENT/**`
and nothing else. Brian's merge is the packet approval.
