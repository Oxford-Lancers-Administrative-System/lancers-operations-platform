# W10 — Administer recruitment's messages, cycles and QR

- Purpose/intended outcome: an operator changes what recruitment says, when it
  says it, whether a step runs at all, and which QR codes are live — without an
  engineer.
- Primary actor: an operator holding the core four authority.
- Trigger: a new term, a new push, a changed group link, a poster going out or
  being retired.
- Entry point: Administration in the left navigation.
- Route/placement: `/operate/admin/recruitment`.
- Controlling source: boundary items 3, 13, 43 and Task 09 §9.1's open
  welcome-flow mechanics inherited from the walk-ups brief (Task 04 D-6 and §5);
  Brian's 2026-08-28 note — _"how that message gets sent out, where that machinery
  lives, and how the administration of the recruitment cycle gets handled on the
  flexibility. I'm not sure where."_
- User-visible result: the change takes effect, and who made it is recorded.

## This is the machinery workflow — Brian, 2026-08-31

> "We still need a workflow to say how the machinery works, because the machinery
> needs to be here to say that there's going to be a flow to how the items get out
> there." … "When somebody gets recruited on board, we need to be able to tell
> when those things get sent out to them."

`W10` is that workflow. No new one was added: Brian declined a fifteenth
(_"I don't want a workflow 15"_), and this one already owned "what recruitment
says, when it says it, and whether a step runs at all". When `W3` was removed on
the same day, its three ladder decisions — `D3`, `SIGNON-OWNED` and
`SIGNON-LADDER` — moved here, which makes the ownership explicit rather than
implied.

So `W10` must define **the sequence itself**, not merely the screens that edit
it:

1. **What is sent** — the WhatsApp welcome, the community-group invite,
   Questionnaire A (who you are), Questionnaire B (how you came to football),
   event invitations, and the single permitted reminder for each.
2. **On what trigger** — capture at a door (`W5`, `W6`, `W7`), an operator's
   hand (`W2`, `W9`), a scheduled offset, or an event's own timetable.
3. **In what order, and how far apart.** Brian is settling when the two
   questionnaires go out and whether they are ever combined; the machinery must
   express whichever answer he gives rather than hard-coding one.
4. **Whether a step runs at all**, per cycle — a Freshers' push and a mid-season
   push are the same machine configured differently.

### The WhatsApp flow, settled

Brian asked for this before finalising `W2-04`. It differs by door, and once
that is said the rest falls out:

| Door                | Opt-in                          | First message                              |
| ------------------- | ------------------------------- | ------------------------------------------ |
| `W7` · QR sign-in   | They joined at the stand        | **None.** They are already in the group    |
| `W5` · Walk-up      | None captured                   | `recruit_welcome`, carrying the group link |
| `W6` · Operator add | How the club came by the number | `recruit_welcome`, carrying the group link |

The recruit-facing half happens inside WhatsApp, which this product does not
render — which is why `W3` looked empty and was removed. What this product owns
is the list above, the cycle below, and the group link itself.

### The cycle

| #   | Template                    | Fires                                      | Runs |
| --- | --------------------------- | ------------------------------------------ | ---- |
| 1   | `recruit_welcome`           | On capture — walk-up and operator-add only | on   |
| 2   | `recruit_details_ask`       | 1 day after capture (Questionnaire A)      | on   |
| 3   | `recruit_details_reminder`  | 3 days later, once only                    | on   |
| 4   | `recruit_interest_ask`      | 3 days after capture (Questionnaire B)     | on   |
| 5   | `recruit_interest_reminder` | 3 days later, once only                    | off  |

### What the cycle never does

- **Nothing fires at a recruit who declined.** Ever. This is `NEVER-HARSH`,
  inherited from `W9` when it folded, and its refusal is rendered on `W2-04`.
- **There is never a second reminder.** One per ask, then silence.
- **Event invitations are not here.** An event sends its own, on its own terms
  (`W11`).
- **Free text is impossible.** Every message is a Meta-approved template.

### The template gate

Only `event_invitation` is approved today. The other four do not exist, Meta
review takes days to weeks, and it is outside the club's control. **The cycle can
be built and cannot run until they clear.** `W10-03` states that on the screen
rather than leaving it in a decision log.

### What an operator must be able to tell about one recruit

This is the half Brian asked for last and it is a requirement on `W2` as much as
on this workflow: for a given recruit, an operator must be able to see **what has
already been sent, when, and what is due to go out next**. `W2` renders it; this
workflow defines what "due next" means. Neither is drawn yet.

## The boundary this workflow exists to find

Brian, 2026-08-31: _"W9 is important. I'm most confused about this one. I think we
need to go through the workflow and find the boundary there."_ It is drawn tenth
rather than third for exactly that reason: the boundary is found against the flows
that actually configure it, not guessed in the abstract. The answer this
specification proposes:

- **Mission 4 owns** the scheduler, the transport, delivery states, retry, and the
  per-event-type ladder configuration that already ships at
  `/operate/admin/messaging`.
- **Recruitment owns** what it sends, on what trigger, in what order, whether a
  step runs at all, and who may change any of it.
- **The line** is that recruitment never schedules; it declares a cycle, and
  Mission 4's scheduler runs it.

## Current `main` grounding

- Locally rendered route or nearest implemented analogue:
  `/operate/admin/messaging` at `main@e669331`, photographed as `W10-01` — the
  shipped messaging schedule, which is exactly the shape of thing this needs to be
  and is already a per-type cadence editor.
- Reused component, language, interaction, and permission patterns: that screen
  wholesale — its per-type rows, its offsets, its save behaviour and its audit.
- Desktop and 375px evidence: `W10-01`, `W10-02` and `W10-03`, both sides,
  measured. `W10-02` is QR administration, which was promised by this
  specification and never shot; `W10-03` is the templates behind the cycle, moved
  here from `W3` when Brian folded that workflow on 2026-08-31.
- Reason for any departure from the implemented application: the shipped screen
  configures reminder cadence per event type. Recruitment's cycle is a different
  object — a sequence of named steps with content — so it is a sibling screen in
  the same language rather than a new column on that one.

## Required actions

1. Read the recruitment cycle as a sequence: welcome, group invite, standard ask,
   reminder, the `W4` form, the reminder for that.
2. Edit any step's content, or turn a step off.
3. Change the community-group link, which rotates and breaks silently when it does.
4. See what happens when a message fails to deliver, and what happened when
   delivery was down at capture.
5. Mint a QR, name it, see where it points, and revoke it.
6. See who changed what, and when.

## State transitions

None on any recruit. This workflow changes configuration, never a person.

## Handoffs

- To Mission 4's scheduler, which runs whatever this declares.
- From `W3`, `W4`, `W9` and `W11`, all of which read this configuration.
- To `W7`, whose QR codes are minted and revoked here.

## Dependencies and mission boundaries

- **Mission 4 / scheduler and templates:** the line above. Independently walkable —
  the scheduler and the admin screen both ship.
- **Mission 8 / wording:** content that constitutes consent language is Mission
  8's to word; this screen is where it is entered. Non-blocking.
- **Mission 1 / authority:** who may change this is the existing four-role group.
  No capability is minted.

## Exceptions and recovery

- **The group link is stale.** The single most likely silent failure in the
  mission: recruits receive an invite to a dead link and nobody finds out. The
  screen shows when it was last changed and by whom.
- **A step is turned off.** Stated plainly on the cycle, so a recruit going quiet
  is not mistaken for disinterest when the club simply stopped asking.
- **A QR is revoked while posters are still up.** The uniform invalid page, and the
  screen says how many submissions that code has taken.

## Safety, privacy, consent, and authority boundaries

- Four-role only, audited, because this screen changes what is said to every
  recruit at once.
- Turning off a consent-bearing step is a Mission 8 concern, and the screen must
  say so rather than allowing it silently.
- No real send before LAN-101.

## Acceptance evidence

- `grounding: photograph`. The shipped messaging schedule as the shell, both
  sides at measured 1280px and 375px. The proposed route
  `/operate/admin/recruitment` does not exist on `main` and every frame says so.
- **QR administration is its own screen now.** It was built into `W10-01` and
  appended below three thousand pixels of messaging schedule inside a 520px
  review box, so the only thing visible was an untouched page — Brian, correctly:
  _"You just fucking didn't do W10… There's literally nothing here about the QR
  code. You just screenshotted it."_ Every region now lands above the page's
  first card.

## Core decisions

| Decision                                                                  | Classification                | Governing evidence or recommended default                                         | Status  |
| ------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------- | ------- |
| Mission 4 owns the scheduler; recruitment owns content, trigger and order | `proposed for owner approval` | The boundary Brian asked to be found. This is the proposal                        | Open    |
| Recruitment declares a cycle and never schedules                          | `proposed for owner approval` | Keeps one scheduler in the product                                                | Open    |
| The cycle is one editable sequence, not per-message screens               | `proposed for owner approval` | The cycle is the thing an operator thinks about                                   | Open    |
| A step can be turned off entirely                                         | `locked`                      | Boundary item 43: what an operator may change includes whether a step runs at all | Settled |
| QR minting and revocation live here                                       | `proposed for owner approval` | Alternative is a separate screen; this is one operator's administration           | Open    |
| The group link shows when it was last changed                             | `proposed for owner approval` | The most likely silent failure in the mission                                     | Open    |

## Brian approval

- Exact words:
- Date:
