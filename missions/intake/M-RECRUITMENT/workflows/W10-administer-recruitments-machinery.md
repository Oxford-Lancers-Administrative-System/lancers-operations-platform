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
- Desktop and 375px evidence: `W10-01` and `W10-02`, both sides, measured.
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

- `grounding: photograph`. The shipped messaging schedule as the shell, both sides
  at measured 1280px and 375px.

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
