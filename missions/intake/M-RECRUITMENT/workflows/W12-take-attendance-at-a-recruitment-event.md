# W12 — Take attendance at a recruitment event

- Purpose/intended outcome: on the day, whoever is holding the phone records who
  actually turned up — recruits first, everyone else below — and captures the
  people nobody expected.
- Primary actor: an operator or a coach holding one of the ten fixed coaching
  roles.
- Trigger: the session starts.
- Entry point: the event, on a phone, at the pitch.
- Route/placement: `/operate/events/[id]/attendance`, unchanged.
- Controlling source: Task 09 D11's recruits-on-top sheet and D8's turnout rule;
  Brian's 2026-08-31 direction to look at how recruits are treated differently
  from players for attendance and who showed up versus not.
- User-visible result: attendance recorded, walk-ups captured, and every recruit's
  row on the board updated with what happened.

## Current `main` grounding

- Locally rendered route or nearest implemented analogue: the real thing,
  photographed as `W12-01` against the seeded Freshers' Fair event.
- Reused component, language, interaction, and permission patterns: the shipped
  sheet — four one-touch states with immediate save and no Submit, the
  not-recorded state that never becomes Absent, the correction audit, the
  RSVP-as-context rule, and the walk-up capture path `W5` owns.
- Desktop and 375px evidence: `W12-01` and `W12-02`, both sides, measured. As with
  `W5`, the 375px frame is the real one.
- Reason for any departure from the implemented application: the sheet derives its
  roster from memberships, so invited recruits do not appear on it at all. That is
  the gap Task 09 §9.1 names, and it is what this workflow builds.

## How a recruit differs from a player here

|                         | Player                           | Recruit                                                             |
| ----------------------- | -------------------------------- | ------------------------------------------------------------------- |
| Appears on the sheet    | From their membership            | From their invitation                                               |
| Position on the sheet   | Below                            | **At the top** — D11                                                |
| Not recorded            | Stays not recorded, never Absent | The same                                                            |
| Did not show up         | Feeds the chase                  | **Nothing.** "Did not show up" is deliberately not a recruit status |
| Showing up unexpectedly | Recorded present                 | Recorded present, and `W5` captures them if new                     |

The last row is the one that matters. A player who does not turn up has an
obligation they did not meet. A recruit who does not turn up has told the club
something mild, and the system's only correct response is to note it on their row
and do nothing else.

## Required actions

1. Open the sheet and see invited recruits at the top, everyone else below.
2. Mark present or not, one touch, saved immediately.
3. Capture a walk-up without leaving the sheet (`W5`).
4. See turnout as the sum of the records — no separate headcount, D8.
5. Correct a mistake, attributably.

## State transitions

Attendance recorded moves `identified → engaged`. Attendance not recorded moves
nothing and means nothing.

## Handoffs

- From `W11`.
- To `W5` for a walk-up.
- To `W1`, where the event column fills in, and to `W2`, where it becomes a
  signal.
- To Mission 2, which owns the sheet and occurrence assertion.

## Dependencies and mission boundaries

- **Mission 2 / attendance:** this mission's side is that recruits appear at all,
  that they appear on top, and what their absence means; Mission 2's side is the
  sheet, the states and occurrence. Independently walkable.

## Exceptions and recovery

- **A big sheet.** Expected at a taster. Optimised for scanning who showed up, per
  D11.
- **A recruit who never RSVPed but shows up.** Recorded present, exactly like
  anyone else — Task 09 §5.
- **A walk-up who is already a recruit.** The duplicate check catches it; they are
  marked present rather than created twice.
- **The event did not happen.** Occurrence assertion precedes attendance and is
  Mission 2's; nothing here changes it.
- **A coach takes the sheet.** They see the narrow attendance payload only — no
  contact values, no recruitment facts, no board.

## Safety, privacy, consent, and authority boundaries

- The coach payload exclusions are unchanged: no contact data, no RSVP reasons, no
  recruitment status, no notes.
- A recruit on the sheet is shown by name only. Their funnel status is not on it —
  a coach reading "declined" beside somebody standing in front of them is both a
  privacy leak and a bad afternoon.

## Acceptance evidence

- `grounding: photograph`. Both sides at measured 1280px and 375px against the
  seeded recruitment event.

## Core decisions

| Decision                                                         | Classification                | Governing evidence or recommended default                    | Status  |
| ---------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------ | ------- |
| Recruits at the top, everyone else below                         | `locked`                      | Task 09 D11                                                  | Settled |
| Turnout is the sum of attendance records; no aggregate headcount | `locked`                      | Task 09 D8; Register F4 superseded                           | Settled |
| "Did not show up" is not a recruit status and triggers nothing   | `locked`                      | Brian, 2026-08-28                                            | Settled |
| A recruit's funnel status never appears on the coach's sheet     | `proposed for owner approval` | Privacy, and plain decency at the touchline                  | Open    |
| Attendance moves `identified → engaged`                          | `proposed for owner approval` | It is the strongest signal the platform can honestly observe | Open    |

## Brian approval

- Exact words: _"W12 is approved. I looked at it. It's simple. It's done. It's
  approved."_
- Date: 2026-08-31

**Recorded here rather than in the ledger's state**, because the inventory
forbids a workflow being approved before every earlier one is done and `W11` was
still with him when he said this. The words are his and the approval stands; the
state flips the moment `W11` lands, and he is not to be asked again.
