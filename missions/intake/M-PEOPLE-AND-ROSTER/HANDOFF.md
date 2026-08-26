# Handoff — M-PEOPLE-AND-ROSTER intake

Written 2026-08-26 for the agent taking this over. Everything here is verifiable
from the ledger or the repository; nothing is remembered-only. **Read
`00-boundary.md`, `01-overview.md`, `02-workflows.md` and `field-inventory.md`
before doing anything** — they are the approved authority and this file only
tells you where things stand and where the traps are.

## Where you are

- Branch `intake/M-PEOPLE-AND-ROSTER`, baseline `main@2115bfe`.
- Stage `workflows`. `W1`'s specification is **approved**; its mockups are not
  built. `W2`–`W8` are `not_started`.
- Run `npm run intake -- status M-PEOPLE-AND-ROSTER` first. It is the truth;
  this file is a courtesy.
- `npm run intake -- check M-PEOPLE-AND-ROSTER` reports consistent at handoff.

## Environment traps that cost real time

1. **The worktree is deliberately outside `.claude/`**, at
   `/Users/schuster/Documents/Lancers/intake-M-PEOPLE-AND-ROSTER`. The
   `Edit(./.claude/**)` deny rule blocks every write **and every `cp`, in either
   direction**, anywhere under `.claude/` — worktrees included. If a database
   rule tells you a worktree outside `.claude/worktrees/` means broken
   isolation, that does not apply here: this location is the workaround, and
   `pwd` never returns the primary checkout.
2. **Run `npm ci` in the worktree** before any `npm run intake` command. A fresh
   worktree has no `node_modules` and the CLI fails on a missing `prettier`.
3. **Compound Bash commands with variable assignments get denied.** Use plain
   single-purpose commands with absolute paths.
4. **Never `cp` to or from `.claude/`.** To copy a skill template, `cat` it and
   write the content out.
5. **Commit messages go through a file** (`git commit -F`). Backticks in a `-m`
   string are executed by zsh.
6. Prettier every ledger file before committing, then re-run
   `intake -- hub --write` and `intake -- coverage --write` — editing
   `state.json` puts the two generated files out of date and `check` refuses.

## Showing Brian anything

He is in the terminal. There is **no side panel**, and he does not want browser
automation. Open files with `open -a "Google Chrome" <path>`.

Raw markdown in Chrome is unreadable for documents this size, so this session
built a small viewer in the session scratchpad: `npm install marked --prefix
<scratchpad>`, plus a `view.mjs` that renders one or more `.md` files into a
styled, light/dark HTML page and opens it. **Your scratchpad is a different
directory — rebuild it.** It is about sixty lines and pays for itself
immediately. It must stay outside the repository: the intake PR may contain only
`missions/intake/**` and `missions/packets/**`.

## What comes next, concretely

`W1`'s mockups. Both its surfaces — the People list and person detail — are
**new**, so both sides of every screen are **drawn**, and the current side reads
`New surface, nothing to compare`. Read `docs/ux/mockup-standards.md` in full
first; the pairing rule there is a refusal, not a preference.

Later workflows are not all drawn. **`W5` and `W6` redesign surfaces that exist
on `main`** — `/operate/roster` and `/operate/roster/[membershipId]` — so those
screens are **photographed on both sides** with
`npm run intake -- shoot --screen <Wn-nn> --route <path> [--proposal <file.js>]`.
Never pair a photograph with a drawing on one screen.

`shoot` needs a database lease and a running application:

```
npm run db:acquire -- LAN-###
npm run db:start
PORT=3200 npm run dev
```

Another agent is active in this repository. **Never touch the mission stack
`mission-m-automated-communications-reminders-recovery-0` or port 3100**, never
run `db:acquire-mission`, `db:attach-mission` or `db:cleanup-stale`, and never
`pkill` by process name. Release your lease when you are done with it. `shoot`
drives its own Playwright login with the machine-local review account and
asserts a measured 375px — Brian does not type a password, and a resized Chrome
window will not satisfy the check.

## What binds a mockup

The mockup owns **structure and copy**: which sections exist and in what order,
what each row carries, which controls exist and where they sit, which states get
their own screen. A departure is an owner question **before** it is built.

The application owns **style**: button variants, colour, typography, spacing,
component idiom, shared formatters — taken from `src/theme.ts` and MUI defaults,
never from the drawing. An ugly button in a mock means "a button goes here". This
is Q-23 from the Mission 4 journal, and it also settles conflicts _between_
approved artifacts: where prose and drawing disagree on a visual treatment, the
application decides and neither governs.

## How this owner works

- He tests conclusions rather than accepting them. "Why eight workflows, why not
  six?" produced a better answer. Bring the reasoning, not just the result.
- He wants evidence, not judgement, on club facts. The Source Data Analysis and
  the 7/30 Roster Management workshop transcript in Drive settled kit, Blues,
  jersey shape and the alias question this session. Go and look.
- Decide what is decidable; escalate club facts, credentials and unsafe changes.
  Several things this session were mine to settle and I over-escalated them.
- When he corrects you, correct the record rather than arguing. Six coverage
  decisions are marked `superseded` with his words rather than overwritten.
- Concise. Lead with the answer.

## Decisions made this session that live in no brief

All are in the ledger with his exact words; this is the index so you do not
rediscover them the hard way.

- **The season bootstrap and the import moved to Mission 7**, closing the
  portfolio's open decision. This mission therefore closes walkable against
  seeded data only.
- **Club-role assignment stays with Mission 1.** Drafted as scope, withdrawn the
  same day. The observation survives as a packet finding: event audiences resolve
  coaches only through `role_assignments`, whose sole writer is invitation
  acceptance, so a club role cannot be recorded without granting a login.
- **A person editing their own record is Mission 7's**, through the signed link
  everyone else uses — Task 11 §2.1 and §7 already decided it. No settings
  surface anywhere.
- **The collection request is Mission 7's.** Task 11 §1 states the division; this
  mission keeps the fact-level states and the queue only.
- **Channel presence is a season record**, named concretely **On WhatsApp**, and
  goes to Mission 6 because Task 09 D3 fires the group invite at every recruit
  door. Contact points stay durable and here. Presence is not consent.
- **Formalwear is seasonal**, reasked each season — which removes Task 10 item
  3's returner carve-out, a note Mission 7 must reconcile.
- **Half and Full Blue are seasonal awards**; the total derives.
- **Known-as collapses into alias**, one flagged as the display name. Drops the
  shipped `known_as` column.
- **Emergency contact is five fields** — first name, last name, relationship,
  phone, email. No source evidence exists for it at all, so the shape is his.
- **The pipeline status is rebuilt**: Recruit · Onboarding · Active · Inactive ·
  Departed · Archived. `carried_forward`, `confirmed` and `withdrawn` struck.
  One status the operator sees, assembled from two records, because the frozen
  model refuses to store recruits as memberships. **This supersedes OD-3** and is
  a frozen-model vocabulary change reaching event audiences, the weekly report,
  the roster and Mission 4's messaging — a new enum type and a data migration.
- **A committee year pairs to the season sharing its label**; dates are
  irrelevant and date overlap was considered and rejected. Accepted as technical
  debt, no schema change.
- **No season picker anywhere.** The active season is ambient context.
- **People is season-scoped**; the person record is not.

## Open, and deliberately not closed here

- `W1`'s **list columns** stay `proposed for owner approval` — he approved them
  in principle and wants to judge them rendered. That is the first thing his
  mockup review settles.
- Whether the **widen-to-everyone** action is four-role or GM-only. He said it
  happens "once in a while from the GM"; I recorded that as expected usage, not
  as a restriction, because narrowing it would invent an authority split inside
  the four-role group that Task 08 §6 does not make. Ask him.
- The **recruit-stage field set** has never been enumerated by anyone. Recorded
  as Mission 6's at its intake. Do not invent it here.
- **BPS is the Blues Performance Scheme** — the 7/30 transcript says so, and
  Task 10 carries "BPS meaning" as an open delegated gate. Not this mission's to
  close, but worth passing on.

## The corpus moved today — read `notion-corrections.md` first

Eleven amendments were applied across eight Notion records at the end of this
session and **all seven pages were verified by refetch**. Task 08, Task 10, Task
14, Task 05, Task 16, the Authority Manifest and the portfolio all carry dated
2026-08-26 notes recorded with this intake. If you read a brief and it
contradicts this ledger, check its amendment callout at the bottom before
believing the body text.

Two pages — Task 08 and Task 14 — needed a sentence struck through in place,
because an earlier note from the same morning still said Mission 5 delivers a
minimal season row. Those are the only approved prose this session rewrote.

## Two repository facts worth having before you build

**The status enum migration is bigger than it reads.** Twelve views depend on
membership status, and Postgres cannot alter an enum a view depends on — every
one must be dropped and recreated in the same migration. Dropping `known_as`
hits `person_standing` for a second reason, so treat both as one migration. The
full measured list is in `field-inventory.md`; it also reaches the production
showcase scripts and three pilot SQL directories.

**`person_standing` already derives alumni standing**, including the operator
override. `W1` surfaces it rather than inventing it.

## Mission 4 drift

`LAN-169`–`173` are executing and will move `main` during this intake. Tolerated
by the portfolio and confirmed by inspection: its surface is messaging and
scheduling, which this mission does not touch. Re-check before Stage 5 and
record the observed head.

**`main` has already moved twice past the `2115bfe` baseline**, observed
2026-08-26 after this ledger was written:

- `ceff8ef` — "Let an operator record an in-person RSVP answer (LAN-170)". Mission
  4 scope, messaging, harmless here.
- `53f01ee` — **"Gate visual packages on mockup structure" (#94)**. This one is
  yours: the harness gate for mockup structure landed _after_ the baseline, so
  the mockups you are about to build are subject to a check this ledger predates.
  Read it before drawing anything.
